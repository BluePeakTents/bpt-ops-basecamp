import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { EMPLOYEES, LEADERS, canDrive } from '../data/crewConstants'

/* ═══════════════════════════════════════════════════════════════════
   DRIVER SHEET PDF GENERATOR
   One branded PDF page per non-leader CDL driver per day.
   Leader uses the Production Schedule — does NOT get a driver sheet.

   Layout:
   1. Header: Date / Start Time / End Time, Driver / Leader
   2. Address: Google Maps link + site contact
   3. Crew: inline list with CDL classes
   4. Truck #: blank write-in line
   5. Key Aspects: sand-bordered box with job summary
   6. Job Stops: table (Job Name, Address, Set, Removal, Arrival Window)
   7. Before Leaving / After Returning checklists (side-by-side)
   8. Driver Signature + Date/Time
   ═══════════════════════════════════════════════════════════════════ */

const NAVY = [29, 58, 107]
const BLUE = [121, 150, 170]
const SAND = [209, 190, 164]
const IVORY = [237, 228, 218]
const EGGSHELL = [251, 249, 247]
const WHITE = [255, 255, 255]

function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
}

function formatDate(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/**
 * Generate driver sheets for a given day's jobs and crew assignments.
 * @param {Object} params
 * @param {Date} params.date - The date for the driver sheets
 * @param {Array} params.dayJobs - Jobs active this day, grouped by leader
 * @param {Object} params.crewAssignments - { leaderName: [{ name, cdl, isLead }] }
 * @param {string} params.startTime - Default start time (e.g., "6:30 AM")
 */
export function generateDriverSheets({ date, dayJobs, crewAssignments, startTime = '6:30 AM' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const dateStr = formatDate(date)
  let firstPage = true

  // For each leader's crew, find non-leader CDL drivers
  for (const [leader, jobs] of Object.entries(dayJobs)) {
    const crew = crewAssignments[leader] || []
    const drivers = crew.filter(emp => emp.cdl && !emp.isLead)

    if (drivers.length === 0) continue

    for (const driver of drivers) {
      if (!firstPage) doc.addPage()
      firstPage = false

      renderDriverPage(doc, {
        date: dateStr,
        startTime,
        endTime: '6:00 PM',
        driver: `${driver.name} (CDL-${driver.cdl})`,
        leader,
        address: jobs[0]?.cr55d_venueaddress || jobs[0]?.cr55d_venuename || 'Address TBD',
        siteContact: '',
        crew: crew.map(c => `${c.name}${c.cdl ? ' ('+c.cdl+')' : ''}`),
        keyAspects: jobs.map(j => j.cr55d_jobname || j.cr55d_clientname || 'Job'),
        jobStops: jobs.map(j => ({
          jobName: j.cr55d_jobname || j.cr55d_clientname || '',
          address: j.cr55d_venueaddress || j.cr55d_venuename || '',
          set: j._isInstallDay !== false ? 'X' : '',
          removal: j._isStrikeDay ? 'X' : '',
          arrival: '8:00–10:00',
        })),
      })
    }
  }

  if (firstPage) {
    // No driver sheets needed
    return null
  }

  const filename = `Driver_Sheets_${toLocalISO(date)}.pdf`
  doc.save(filename)
  return filename
}

function renderDriverPage(doc, data) {
  const pageW = 215.9 // letter width mm
  const margin = 15
  const contentW = pageW - margin * 2
  let y = margin

  // ── Header Bar ──────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentW, 18, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('BLUE PEAK TENTS & EVENTS', margin + 4, y + 7)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('DRIVER SHEET', margin + 4, y + 14)
  doc.setTextColor(...IVORY)
  doc.text(data.date, pageW - margin - 4, y + 7, { align: 'right' })
  y += 22

  // ── Date / Time / Driver / Leader ───────────────────────────
  doc.setTextColor(...NAVY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')

  const col1 = margin
  const col2 = margin + contentW * 0.5

  doc.text('Start Time:', col1, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.startTime, col1 + 22, y)

  doc.setFont('helvetica', 'bold')
  doc.text('End Time:', col2, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.endTime, col2 + 20, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.text('Driver:', col1, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.driver, col1 + 14, y)

  doc.setFont('helvetica', 'bold')
  doc.text('Leader of Crew:', col2, y)
  doc.setFont('helvetica', 'normal')
  doc.text(data.leader, col2 + 30, y)
  y += 8

  // ── Address ─────────────────────────────────────────────────
  doc.setFillColor(...EGGSHELL)
  doc.rect(margin, y, contentW, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('ADDRESS:', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.text(data.address, margin + 22, y + 4)
  if (data.siteContact) {
    doc.text(`Site Contact: ${data.siteContact}`, margin + 3, y + 8)
  }
  y += 13

  // ── Crew List ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('CREW:', margin, y)
  doc.setFont('helvetica', 'normal')
  const crewStr = data.crew.join(', ')
  const crewLines = doc.splitTextToSize(crewStr, contentW - 14)
  doc.text(crewLines, margin + 14, y)
  y += crewLines.length * 4 + 3

  // ── Truck # ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.text('TRUCK #:', margin, y)
  doc.setDrawColor(...SAND)
  doc.line(margin + 18, y, margin + 80, y)
  y += 6

  // ── Key Aspects ─────────────────────────────────────────────
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentW, 6, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('KEY ASPECTS OF THE JOB TODAY', margin + 3, y + 4)
  y += 8

  doc.setDrawColor(...SAND)
  doc.setLineWidth(0.5)
  const boxH = Math.max(12, data.keyAspects.length * 5 + 4)
  doc.rect(margin, y, contentW, boxH)

  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  data.keyAspects.forEach((aspect, i) => {
    doc.text(`• ${aspect}`, margin + 3, y + 4 + i * 5)
  })
  y += boxH + 4

  // ── Job Stops Table ─────────────────────────────────────────
  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['JOB NAME', 'ADDRESS', 'SET', 'REMOVAL', 'ARRIVAL WINDOW']],
    body: data.jobStops.map(s => [s.jobName, s.address, s.set, s.removal, s.arrival]),
    styles: {
      fontSize: 7,
      cellPadding: 2,
      font: 'helvetica',
      textColor: NAVY,
      lineColor: SAND,
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 28 },
    },
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 6

  // ── Checklists (side by side) ───────────────────────────────
  const checkW = (contentW - 4) / 2

  // Before Leaving
  doc.setFillColor(...EGGSHELL)
  doc.rect(margin, y, checkW, 40, 'F')
  doc.setDrawColor(...SAND)
  doc.rect(margin, y, checkW, 40)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('BEFORE LEAVING WAREHOUSE', margin + 3, y + 4)
  doc.setFont('helvetica', 'normal')
  const beforeItems = ['Pre-trip inspection complete', 'Cab clean & organized', 'Fuel/DEF checked', 'E-logbook started', 'All passengers accounted for']
  beforeItems.forEach((item, i) => {
    doc.rect(margin + 3, y + 7 + i * 6, 3, 3)
    doc.text(item, margin + 8, y + 9.5 + i * 6)
  })

  // After Returning
  doc.setFillColor(...EGGSHELL)
  doc.rect(margin + checkW + 4, y, checkW, 40, 'F')
  doc.setDrawColor(...SAND)
  doc.rect(margin + checkW + 4, y, checkW, 40)
  doc.setFont('helvetica', 'bold')
  doc.text('AFTER RETURNING TO WAREHOUSE', margin + checkW + 7, y + 4)
  doc.setFont('helvetica', 'normal')
  const afterItems = ['Rental items counted & checked', 'Doors locked, keys on hook', 'Canvas bags tagged & stored', 'Key logbook updated', 'E-logbook submitted', 'Ending mileage recorded']
  afterItems.forEach((item, i) => {
    doc.rect(margin + checkW + 7, y + 7 + i * 5.5, 3, 3)
    doc.text(item, margin + checkW + 12, y + 9.5 + i * 5.5)
  })
  y += 44

  // ── Signature ───────────────────────────────────────────────
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('Driver Signature:', margin, y + 4)
  doc.setDrawColor(...NAVY)
  doc.line(margin + 30, y + 4, margin + 90, y + 4)

  doc.text('Date/Time:', margin + 100, y + 4)
  doc.line(margin + 120, y + 4, margin + contentW, y + 4)

  // ── Footer ──────────────────────────────────────────────────
  doc.setFontSize(6)
  doc.setTextColor(150, 150, 150)
  doc.text('Blue Peak Tents & Events — 1020 Olympic Dr, Batavia, IL 60510 — INTERNAL USE ONLY', pageW / 2, 270, { align: 'center' })
}

/**
 * Generate a single Production Schedule PDF for a job.
 */
export function generateProductionSchedulePDF(job, schedule = {}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pageW = 215.9
  const margin = 15
  const contentW = pageW - margin * 2
  let y = margin

  // Header
  doc.setFillColor(...NAVY)
  doc.rect(margin, y, contentW, 20, 'F')
  doc.setTextColor(...WHITE)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('PRODUCTION SCHEDULE', margin + 4, y + 8)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...IVORY)
  doc.text(`PS-${job.cr55d_jobnumber || 'DRAFT'}`, margin + 4, y + 15)
  doc.text(job.cr55d_clientname || '', pageW - margin - 4, y + 8, { align: 'right' })
  doc.text(job.cr55d_jobname || '', pageW - margin - 4, y + 14, { align: 'right' })
  y += 24

  // Client info
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Client:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(job.cr55d_clientname || '—', margin + 16, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Event:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(job.cr55d_jobname || '—', margin + 14, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Venue:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(job.cr55d_venuename || '—', margin + 15, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('Address:', margin, y); doc.setFont('helvetica', 'normal')
  const addrLines = doc.splitTextToSize(job.cr55d_venueaddress || '—', contentW - 20)
  doc.text(addrLines, margin + 18, y)
  y += addrLines.length * 4 + 3
  doc.setFont('helvetica', 'bold')
  doc.text('Sales Rep:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(job.cr55d_salesrep || '—', margin + 22, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('PM:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(job.cr55d_pmassigned || '—', margin + 10, y)
  y += 8

  // Dates
  doc.setFillColor(...EGGSHELL)
  doc.rect(margin, y, contentW, 12, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  const installStr = job.cr55d_installdate?.split('T')[0] || '—'
  const eventStr = job.cr55d_eventdate?.split('T')[0] || '—'
  const strikeStr = job.cr55d_strikedate?.split('T')[0] || '—'
  doc.text(`Install: ${installStr}`, margin + 3, y + 5)
  doc.text(`Event: ${eventStr}`, margin + 60, y + 5)
  doc.text(`Strike: ${strikeStr}`, margin + 110, y + 5)
  y += 16

  // Red Flags
  if (schedule.redFlags && schedule.redFlags.length > 0) {
    doc.setFillColor(254, 242, 242)
    const flagH = schedule.redFlags.length * 5 + 8
    doc.rect(margin, y, contentW, flagH, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(192, 57, 43)
    doc.text('CRITICAL WARNINGS', margin + 3, y + 5)
    doc.setFont('helvetica', 'normal')
    schedule.redFlags.forEach((flag, i) => {
      doc.text(`⚠ ${flag}`, margin + 3, y + 10 + i * 5)
    })
    y += flagH + 3
  }

  // Schedule milestones (if provided)
  if (schedule.milestones && schedule.milestones.length > 0) {
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['DATE', 'TIME', 'ACTIVITY', 'NOTES']],
      body: schedule.milestones.map(m => [m.date || '', m.time || '', m.activity || '', m.notes || '']),
      styles: { fontSize: 7, cellPadding: 2, textColor: NAVY, lineColor: SAND, lineWidth: 0.3 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
      theme: 'grid',
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // Footer
  doc.setFontSize(6)
  doc.setTextColor(150, 150, 150)
  doc.text('INTERNAL USE ONLY — NO PRICING', pageW / 2, 270, { align: 'center' })
  doc.text('Blue Peak Tents & Events — 1020 Olympic Dr, Batavia, IL 60510', pageW / 2, 274, { align: 'center' })

  const filename = `PS_${job.cr55d_clientname || 'Draft'}_${job.cr55d_installdate?.split('T')[0] || 'undated'}.pdf`
  doc.save(filename)
  return filename
}
