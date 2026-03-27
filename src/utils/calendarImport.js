import * as XLSX from 'xlsx'
import { ACCT_CODES, LEADERS } from '../data/crewConstants'

/* ═══════════════════════════════════════════════════════════════════
   PM CAPACITY CALENDAR IMPORT
   Reads 2026_Project_Manager_Calendar.xlsx format:
   - Each day = 2 rows (AM/PM)
   - Weeks separated by blank rows
   - Leader columns with 3 sub-columns each: workers count, account code, description
   - Account codes: DC=Dave, GH=Glen, DP=Desiree, KT=Kyle, LB=Larrisa
   - Auto-detect job type from Up/Down/Install/Remove keywords
   ═══════════════════════════════════════════════════════════════════ */

// PM Calendar column layout: leader columns start at col 3
// Each leader has 3 sub-columns: workers, acct code, description
const LEADER_COLS = {
  'Dev':        { start: 3 },
  'Jeremy':     { start: 6 },
  'Cristhian':  { start: 9 },
  'Jorge':      { start: 12 },
  'Zach':       { start: 15 },
  'Silvano':    { start: 18 },
  'Nate':       { start: 21 },
  'Brendon':    { start: 24 },
  'Carlos R':   { start: 27 },
}

function detectJobType(desc) {
  if (!desc) return 'Setup'
  const d = desc.toLowerCase()
  if (d.includes('down') || d.includes('remove') || d.includes('removal') || d.includes('strike')) return 'Takedown'
  if (d.includes('up') || d.includes('install') || d.includes('setup') || d.includes('set up')) return 'Setup'
  if (d.includes('tech') || d.includes('event')) return 'Event Tech'
  return 'Setup'
}

function resolveAcctMgr(code) {
  if (!code) return ''
  const upper = code.toString().trim().toUpperCase()
  return ACCT_CODES[upper] || code
}

/**
 * Parse a PM Calendar xlsx file and extract jobs.
 * @param {File} file - The xlsx file from file input
 * @param {string} monthTab - The month tab name to read (e.g., "April", "March")
 * @returns {Promise<Array>} Array of parsed job objects
 */
export async function parseCalendarFile(file, monthTab) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })

        // Find the month tab
        const sheetName = wb.SheetNames.find(n =>
          n.toLowerCase().includes((monthTab || '').toLowerCase())
        ) || wb.SheetNames[0]

        const ws = wb.Sheets[sheetName]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const jobs = []
        let currentDate = null
        let rowInDay = 0 // 0 = AM, 1 = PM

        for (let r = 0; r < data.length; r++) {
          const row = data[r]
          if (!row || row.length === 0 || !row.some(cell => cell !== '')) continue

          // Check if this row has a date in column 0 or 1
          const dateCell = row[0] || row[1] || ''
          const dateStr = dateCell.toString().trim()

          // Try to parse as date
          if (dateStr && !isNaN(Date.parse(dateStr))) {
            currentDate = new Date(dateStr)
            rowInDay = 0
          } else if (dateStr.match(/^\d{1,2}$/)) {
            // Just a day number — need month context
            rowInDay++
          }

          if (!currentDate) continue

          // Scan each leader's columns
          for (const [leader, config] of Object.entries(LEADER_COLS)) {
            const workers = row[config.start] || ''
            const acctCode = row[config.start + 1] || ''
            const description = row[config.start + 2] || ''

            if (!workers && !description) continue
            if (workers === '' && !description.toString().trim()) continue

            const crewCount = parseInt(workers) || 0
            const acctMgr = resolveAcctMgr(acctCode)
            const jobType = detectJobType(description.toString())

            jobs.push({
              date: currentDate.toISOString().split('T')[0],
              leader,
              crewCount,
              acctMgr,
              jobType,
              description: description.toString().trim(),
              amPm: rowInDay === 0 ? 'AM' : 'PM',
            })
          }
        }

        resolve(jobs)
      } catch (err) {
        reject(new Error('Failed to parse calendar file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Parse a Weekly Schedule xlsx file.
 * Column mapping: A(0)=Day, B(1)=Leader, C(2)=StartTime, D(3)=ArrivalWindow,
 * E(4)=JobType, F(5)=Status, G(6)=AcctMgr, H(7)=JobName, I(8)=FullAddress,
 * J(9)=TentSize, K(10)=Details, L(11)=EstDrive, M(12)=CrewNotes
 * O-W = truck columns
 */
export async function parseWeeklySchedule(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]] // Weekly Jobs is first tab
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const jobs = []
        // Skip header rows (typically first 5)
        for (let r = 5; r < data.length; r++) {
          const row = data[r]
          if (!row || !row[0] || !row[1]) continue // need day and leader

          const dayDate = row[0]?.toString().trim()
          if (!dayDate) continue

          jobs.push({
            dayDate,
            leader: row[1]?.toString().trim() || '',
            startTime: row[2]?.toString().trim() || '',
            arrivalWindow: row[3]?.toString().trim() || '',
            jobType: row[4]?.toString().trim() || 'Setup',
            deliveryStatus: row[5]?.toString().trim() || 'Confirmed',
            acctMgr: row[6]?.toString().trim() || '',
            jobName: row[7]?.toString().trim() || '',
            fullAddress: row[8]?.toString().trim() || '',
            tentStructure: row[9]?.toString().trim() || '',
            additionalDetails: row[10]?.toString().trim() || '',
            estDrive: row[11]?.toString().trim() || '',
            crewNotes: row[12]?.toString().trim() || '',
            // Truck requirements (O=14, P=15, Q=16, R=17, S=18, T=19, U=20, V=21, W=22)
            trucks: {
              semi: parseInt(row[14]) || 0,
              tandem: parseInt(row[15]) || 0,
              '750': parseInt(row[16]) || 0,
              cstake: parseInt(row[17]) || 0,
              bigbox: parseInt(row[18]) || 0,
              smbox: parseInt(row[19]) || 0,
              '250': parseInt(row[20]) || 0,
              ox: parseInt(row[21]) || 0,
              crew: parseInt(row[22]) || 0,
            },
          })
        }

        resolve(jobs)
      } catch (err) {
        reject(new Error('Failed to parse weekly schedule: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}
