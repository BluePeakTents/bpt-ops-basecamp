import { useMemo } from 'react'
import { isoDate } from '../../utils/dateUtils'

/* ── Constants ─────────────────────────────────────────────────── */
const PMS = [
  'Cristhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const LICENSE_CLASSES = { A: 'A CDL', B: 'B CDL', C: 'Class C', D: 'Class D', TVDL: 'TVDL' }

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/* ── Component ─────────────────────────────────────────────────── */
export default function ValidationGrid({ weekDates, jobs, staff }) {
  // Derive leaders from Dataverse staff data (department 306280010 = Crew Leader), fallback to PMs
  const leaders = useMemo(() => {
    if (staff && staff.length > 0) {
      const derived = [...new Set(staff.filter(s => s.cr55d_islead || s.cr55d_department === 306280010).map(s => {
        const name = s.cr55d_name || ''
        // Handle "Last, First" format
        if (name.includes(',')) return name.split(',')[1]?.trim().split(' ')[0] || ''
        return name.split(' ')[0]
      }).filter(Boolean))]
      if (derived.length > 0) return derived
    }
    return PMS.map(n => n.split(' ')[0])
  }, [staff])

  function getJobsForLeaderDay(leader, date) {
    const dateStr = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
    return jobs.filter(j => {
      const pm = (j.cr55d_pmassigned || '').split(' ')[0]
      if (pm !== leader) return false
      const install = isoDate(j.cr55d_installdate)
      const strike = isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate) || install
      return install && dateStr >= install && dateStr <= strike
    })
  }

  return (
    <div>
      <div className="callout callout-blue mb-12">
        <span className="callout-icon">✅</span>
        <div>Validation grid: crew needed vs assigned per leader per day. <strong>Green</strong> = fully staffed. <strong>Red</strong> = short crew or missing CDL. Auto-generates warnings when CDL cascade rules aren't met.</div>
      </div>

      <div className="card card-flush">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'100px',position:'sticky',left:0,zIndex:2,background:'var(--bp-white)'}}>Leader</th>
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString()
                return (
                  <th key={i} style={{textAlign:'center',background: isToday ? 'rgba(37,99,235,.06)' : ''}}>
                    {DAYS_SHORT[i]}<br/>
                    <span style={{fontSize:'10px',opacity:.7}}>{formatDateShort(d)}</span>
                  </th>
                )
              })}
              <th style={{width:'200px'}}>Auto Notes</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((leader, li) => {
              const rowWarnings = []
              return (
                <tr key={leader}>
                  <td className="font-semibold color-navy text-base" style={{position:'sticky',left:0,zIndex:1,background:'var(--bp-white)'}}>
                    {leader}
                  </td>
                  {weekDates.map((date, di) => {
                    const dayJobs = getJobsForLeaderDay(leader, date)
                    const crewNeeded = dayJobs.reduce((s, j) => s + (j.cr55d_crewcount || 0), 0)
                    // Use crewplanned (actual assigned) if available, otherwise 0
                    const crewAssigned = dayJobs.reduce((s, j) => s + (j.cr55d_crewplanned || 0), 0)
                    const isFull = crewNeeded === 0 || crewAssigned >= crewNeeded
                    const shortBy = Math.max(0, crewNeeded - crewAssigned)

                    if (shortBy > 0) rowWarnings.push(`${DAYS_SHORT[di]}: Short ${shortBy}`)

                    return (
                      <td key={di} className="text-md font-mono text-center" style={{
                        background: dayJobs.length === 0 ? '' : isFull ? 'var(--bp-green-bg)' : 'var(--bp-red-bg)',
                        color: dayJobs.length === 0 ? 'var(--bp-light)' : isFull ? 'var(--bp-green)' : 'var(--bp-red)',
                        fontWeight: dayJobs.length > 0 ? 700 : 400,
                      }}>
                        {dayJobs.length === 0 ? '—' : (
                          <div>
                            <div>{crewAssigned}/{crewNeeded}</div>
                            <div className="font-semibold" style={{fontSize:'10px'}}>{isFull ? 'FULL' : `SHORT ${shortBy}`}</div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-sm" style={{color: rowWarnings.length > 0 ? 'var(--bp-red)' : 'var(--bp-light)',fontWeight: rowWarnings.length > 0 ? 600 : 400}}>
                    {rowWarnings.length > 0 ? rowWarnings.join(' · ') : 'No issues'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
