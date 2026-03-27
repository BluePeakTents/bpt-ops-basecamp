import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Footer, PageNumber, Tab, TabStopType } from 'docx'
import { saveAs } from 'file-saver'
import { LEADERS, ACCOUNT_MANAGERS, DAYS_FULL } from '../data/crewConstants'

/* ═══════════════════════════════════════════════════════════════════
   LEADER SHEET GENERATOR
   Branded .docx with bullet hierarchy:
     Day Header (underlined)
     • Crew – Leader  (start time, X crew)
        ○ Up/Down – Job Name tent-size – details (Account Mgr)
   Three sections: current week, tentative week+1, tentative week+2
   ═══════════════════════════════════════════════════════════════════ */

const NAVY = '1D3A6B'
const BLUE = '7996AA'
const SAND = 'D1BEA4'

function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
}

function formatDayHeader(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`
}

function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return Array.from({length: 7}, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return dt
  })
}

function getAcctMgrShort(salesRep) {
  if (!salesRep) return ''
  const r = salesRep.toLowerCase()
  if (r.includes('cesar') || r.includes('dave') || r.includes('david')) return 'Dave'
  if (r.includes('turriff') || r.includes('kyle')) return 'Kyle'
  if (r.includes('pearson') || r.includes('desiree')) return 'Desiree'
  if (r.includes('hansen') || r.includes('glen')) return 'Glen'
  if (r.includes('henington') || r.includes('larrisa')) return 'Larrisa'
  return salesRep.split(' ')[0]
}

function getJobsForDay(jobs, date) {
  const dateStr = toLocalISO(date)
  return jobs.filter(j => {
    const install = j.cr55d_installdate?.split('T')[0]
    const strike = j.cr55d_strikedate?.split('T')[0] || j.cr55d_eventdate?.split('T')[0] || install
    return install && dateStr >= install && dateStr <= strike
  })
}

function groupJobsByLeader(dayJobs) {
  const groups = {}
  for (const j of dayJobs) {
    const leader = (j.cr55d_pmassigned || 'Unassigned').split(' ')[0]
    if (!groups[leader]) groups[leader] = []
    groups[leader].push(j)
  }
  return groups
}

function buildWeekSection(weekDates, jobs, label, isTentative) {
  const paragraphs = []

  // Section header
  paragraphs.push(new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: NAVY, font: 'Century Gothic' }),
      ...(isTentative ? [new TextRun({ text: '  (subject to change)', italics: true, size: 18, color: BLUE, font: 'Century Gothic' })] : []),
    ],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
  }))

  for (const date of weekDates) {
    const dayJobs = getJobsForDay(jobs, date)
    if (dayJobs.length === 0) continue

    // Day header (underlined)
    paragraphs.push(new Paragraph({
      spacing: { before: 200, after: 60 },
      children: [
        new TextRun({ text: formatDayHeader(date), bold: true, underline: {}, size: 22, color: NAVY, font: 'Century Gothic' }),
      ],
    }))

    // Group by leader
    const leaderGroups = groupJobsByLeader(dayJobs)

    for (const [leader, leaderJobs] of Object.entries(leaderGroups)) {
      const crewCount = leaderJobs.reduce((s, j) => s + (j.cr55d_crewcount || 0), 0)

      // • Crew – Leader  (start time, X crew)
      paragraphs.push(new Paragraph({
        spacing: { before: 40, after: 20 },
        indent: { left: 360 },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `Crew – ${leader}`, bold: true, size: 20, font: 'Century Gothic' }),
          new TextRun({ text: `  (${crewCount || '?'} crew)`, size: 18, color: '666666', font: 'Century Gothic' }),
        ],
      }))

      for (const j of leaderJobs) {
        const dateStr = toLocalISO(date)
        const install = j.cr55d_installdate?.split('T')[0]
        const strike = j.cr55d_strikedate?.split('T')[0]
        const isInstall = dateStr === install
        const isStrike = dateStr === strike
        const upDown = isStrike ? 'Down' : 'Up'
        const jobName = j.cr55d_jobname || j.cr55d_clientname || 'Job'
        const acctMgr = getAcctMgrShort(j.cr55d_salesrep)

        //    ○ Up/Down – Job Name – details (Account Mgr)
        paragraphs.push(new Paragraph({
          spacing: { before: 10, after: 10 },
          indent: { left: 720 },
          bullet: { level: 1 },
          children: [
            new TextRun({ text: `${upDown} – `, bold: true, size: 18, font: 'Century Gothic' }),
            new TextRun({ text: jobName, size: 18, font: 'Century Gothic' }),
            ...(j.cr55d_venuename ? [new TextRun({ text: ` – ${j.cr55d_venuename}`, size: 18, color: '666666', font: 'Century Gothic' })] : []),
            ...(acctMgr ? [new TextRun({ text: ` (${acctMgr})`, size: 18, color: BLUE, font: 'Century Gothic' })] : []),
          ],
        }))
      }
    }
  }

  return paragraphs
}

export async function generateLeaderSheet(jobs, currentWeekDate) {
  const week0 = getWeekDates(currentWeekDate)
  const week1Start = new Date(week0[6]); week1Start.setDate(week1Start.getDate() + 1)
  const week1 = getWeekDates(week1Start)
  const week2Start = new Date(week1[6]); week2Start.setDate(week2Start.getDate() + 1)
  const week2 = getWeekDates(week2Start)

  const formatRange = (dates) => {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${m[dates[0].getMonth()]} ${dates[0].getDate()} – ${m[dates[6].getMonth()]} ${dates[6].getDate()}, ${dates[0].getFullYear()}`
  }

  const sections = [
    ...buildWeekSection(week0, jobs, `Current Week: ${formatRange(week0)}`, false),
    ...buildWeekSection(week1, jobs, `Tentative Week +1: ${formatRange(week1)}`, true),
    ...buildWeekSection(week2, jobs, `Tentative Week +2: ${formatRange(week2)}`, true),
  ]

  // Notes section
  sections.push(new Paragraph({ spacing: { before: 400 }, children: [] }))
  sections.push(new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text: 'Notes', bold: true, size: 24, color: NAVY, font: 'Century Gothic' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
  }))
  for (let i = 0; i < 8; i++) {
    sections.push(new Paragraph({
      spacing: { before: 60 },
      children: [new TextRun({ text: '_'.repeat(80), color: SAND, size: 18, font: 'Century Gothic' })],
    }))
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Century Gothic', size: 20 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      headers: {
        default: {
          options: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({ text: 'BLUE PEAK TENTS & EVENTS', bold: true, size: 20, color: NAVY, font: 'Century Gothic' }),
                new TextRun({ text: '    Leader Sheet', size: 18, color: BLUE, font: 'Century Gothic' }),
              ],
            }),
          ],
        },
      },
      footers: {
        default: {
          options: {},
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Blue Peak Tents & Events — 1020 Olympic Dr, Batavia, IL 60510 — ', size: 14, color: '999999', font: 'Century Gothic' }),
                new TextRun({ text: 'Page ', size: 14, color: '999999', font: 'Century Gothic' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '999999', font: 'Century Gothic' }),
              ],
            }),
          ],
        },
      },
      children: [
        // Title
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Leader Sheet', bold: true, size: 36, color: NAVY, font: 'Century Gothic' }),
            new TextRun({ text: `\nGenerated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, size: 18, color: BLUE, font: 'Century Gothic', break: 1 }),
          ],
        }),
        ...sections,
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const filename = `Leader_Sheet_${toLocalISO(week0[0])}.docx`
  saveAs(blob, filename)
  return filename
}
