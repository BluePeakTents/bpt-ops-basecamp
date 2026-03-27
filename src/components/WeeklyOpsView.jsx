import { useState, useMemo } from 'react'
import { LEADERS, LEADER_COLORS, DAY_COLORS, JOB_TYPE_COLORS, STATUS_COLORS, ACCT_MGR_COLORS, TRUCK_TYPES, DAYS_FULL, DAYS_SHORT } from '../data/crewConstants'
import { isoDate, shortDate } from '../utils/dateUtils'

/* ── Helpers ───────────────────────────────────────────────────── */
function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0')
}

function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return Array.from({length: 7}, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return dt
  })
}

function formatDayDate(date) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

function getDayName(date) {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()]
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

/* ── Component ─────────────────────────────────────────────────── */
export default function WeeklyOpsView({ jobs, weekDate, setWeekDate, onSelectJob }) {
  const weekDates = getWeekDates(weekDate)
  const weekStart = toLocalISO(weekDates[0])
  const weekEnd = toLocalISO(weekDates[6])

  // Group jobs by day of the week they're active
  const jobsByDay = useMemo(() => {
    const byDay = {}
    DAYS_FULL.forEach((_, i) => { byDay[i] = [] })

    jobs.forEach(j => {
      const install = isoDate(j.cr55d_installdate)
      const strike = isoDate(j.cr55d_strikedate)
      const event = isoDate(j.cr55d_eventdate)
      if (!install) return

      // Check each day of the week
      weekDates.forEach((date, dayIdx) => {
        const dateStr = toLocalISO(date)
        // Job active this day if between install and strike
        const start = install
        const end = strike || event || install
        if (dateStr >= start && dateStr <= end) {
          byDay[dayIdx].push({
            ...j,
            _dayDate: date,
            _dayName: getDayName(date),
            _isInstallDay: dateStr === install,
            _isStrikeDay: dateStr === strike,
            _isEventDay: dateStr === event,
          })
        }
      })
    })

    return byDay
  }, [jobs, weekStart])

  const totalRows = Object.values(jobsByDay).reduce((s, d) => s + Math.max(d.length, 1), 0)
  const todayISO = toLocalISO(new Date())

  return (
    <div>
      {/* Week Navigation */}
      <div className="flex-between mb-12">
        <div className="flex gap-8">
          <button className="cal-nav-btn" aria-label="Previous week" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })}>‹</button>
          <span className="text-xl font-bold color-navy" style={{minWidth:'240px',textAlign:'center'}}>
            {shortDate(toLocalISO(weekDates[0]))} – {shortDate(toLocalISO(weekDates[6]))}, {weekDates[0].getFullYear()}
          </span>
          <button className="cal-nav-btn" aria-label="Next week" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekDate(new Date())}>This Week</button>
        </div>
        <div className="text-md color-muted">
          {totalRows} job stops this week
        </div>
      </div>

      {/* Weekly Ops Table */}
      <div className="card card-flush">
        <div style={{overflowX:'auto'}}>
          <table className="tbl" style={{minWidth:'1400px'}}>
            <thead>
              <tr>
                <th className="sticky-col-header" style={{width:'110px'}}>Day / Date</th>
                <th style={{width:'85px'}}>Leader</th>
                <th style={{width:'50px'}}>Start</th>
                <th style={{width:'85px'}}>Arrival</th>
                <th style={{width:'70px'}}>Type</th>
                <th style={{width:'95px'}}>Status</th>
                <th style={{width:'60px'}}>Acct</th>
                <th style={{width:'150px'}}>Job Name</th>
                <th style={{width:'180px'}}>Address</th>
                <th style={{width:'85px'}}>Tent</th>
                <th style={{width:'120px'}}>Details</th>
                <th style={{width:'45px'}}>Drive</th>
                <th style={{width:'130px'}}>Notes</th>
                {/* Truck columns */}
                <th style={{width:'1px',padding:0,background:'var(--bp-navy)'}}></th>
                {TRUCK_TYPES.map(t => (
                  <th key={t.key} style={{width:'42px',textAlign:'center',fontSize:'8px',padding:'6px 2px'}} title={`${t.label}${t.cdl ? ' (CDL-'+t.cdl+')' : ''}`}>
                    {t.abbrev}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS_FULL.map((dayName, dayIdx) => {
                const dayJobs = jobsByDay[dayIdx] || []
                const date = weekDates[dayIdx]
                const dateStr = toLocalISO(date)
                const isToday = dateStr === todayISO
                const dayColor = DAY_COLORS[dayName] || {}

                if (dayJobs.length === 0) {
                  return (
                    <tr key={dayIdx} className="weekly-day-boundary">
                      <td className="sticky-col font-bold text-sm" style={{background: isToday ? 'rgba(37,99,235,.06)' : dayColor.bg || 'var(--bp-white)', color: dayColor.text || 'var(--bp-muted)',verticalAlign:'top',borderBottom:'2.5px solid var(--bp-navy)'}}>
                        {formatDayDate(date)}
                      </td>
                      <td colSpan={12 + TRUCK_TYPES.length + 1} className="text-md" style={{color:'var(--bp-light)',fontStyle:'italic',borderBottom:'2.5px solid var(--bp-navy)'}}>No jobs scheduled</td>
                    </tr>
                  )
                }

                return dayJobs.map((j, ji) => {
                  const isLastOfDay = ji === dayJobs.length - 1
                  const leaderName = j.cr55d_pmassigned?.split(' ')[0] || ''
                  const leaderColor = LEADER_COLORS[leaderName] || {}
                  const acctMgr = getAcctMgrShort(j.cr55d_salesrep)
                  const acctColor = ACCT_MGR_COLORS[acctMgr] || {}
                  const jobType = j._isStrikeDay ? 'Takedown' : j._isInstallDay ? 'Setup' : 'Active'
                  const jtColor = JOB_TYPE_COLORS[jobType] || {}
                  const statusText = 'Confirmed'
                  const stColor = STATUS_COLORS[statusText] || {}
                  const borderBottom = isLastOfDay ? '2.5px solid var(--bp-navy)' : '1px solid var(--bp-border-lt)'

                  return (
                    <tr key={`${dayIdx}-${ji}`} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}
                      style={{borderBottom}}>
                      {/* Day/Date — only show on first row of day */}
                      <td className={`sticky-col text-sm ${ji === 0 ? 'font-bold' : ''}`} style={{
                        background: isToday ? 'rgba(37,99,235,.06)' : ji === 0 ? (dayColor.bg || 'var(--bp-white)') : 'var(--bp-white)',
                        color: ji === 0 ? (dayColor.text || 'var(--bp-muted)') : 'transparent',
                        verticalAlign:'top',
                        borderBottom,
                      }}>
                        {ji === 0 ? formatDayDate(date) : ''}
                      </td>
                      {/* Leader */}
                      <td className="font-semibold text-md" style={{background: leaderColor.bg, color: leaderColor.text, borderBottom}}>
                        {leaderName}
                      </td>
                      {/* Start Time */}
                      <td className="text-md font-mono" style={{textAlign:'center',borderBottom}}>
                        {j._isInstallDay ? '6:30' : '7:00'}
                      </td>
                      {/* Arrival Window */}
                      <td className="text-sm color-muted" style={{borderBottom}}>
                        {j._isInstallDay ? '8:00–10:00' : ''}
                      </td>
                      {/* Job Type */}
                      <td style={{borderBottom}}>
                        <span className="text-sm font-semibold" style={{color: jtColor.text,background: jtColor.bg,padding:'2px 6px',borderRadius:'4px'}}>
                          {jobType}
                        </span>
                      </td>
                      {/* Status */}
                      <td style={{borderBottom}}>
                        <span className={`badge ${stColor.badge || 'badge-navy'}`}>{statusText}</span>
                      </td>
                      {/* Account Mgr */}
                      <td className="text-sm font-semibold" style={{color: acctColor.text,background: acctColor.bg,borderBottom}}>
                        {acctMgr}
                      </td>
                      {/* Job Name */}
                      <td className="font-semibold color-navy text-md" style={{borderBottom}}>
                        <div className="truncate" style={{maxWidth:'150px'}}>{j.cr55d_jobname || j.cr55d_clientname || ''}</div>
                      </td>
                      {/* Address */}
                      <td className="text-sm color-muted" style={{borderBottom}}>
                        <div className="truncate" style={{maxWidth:'180px'}} title={j.cr55d_venueaddress}>{j.cr55d_venueaddress || j.cr55d_venuename || ''}</div>
                      </td>
                      {/* Tent/Structure */}
                      <td className="text-sm" style={{borderBottom}}>{''}</td>
                      {/* Details */}
                      <td className="text-sm color-muted" style={{borderBottom}}>{''}</td>
                      {/* Est Drive */}
                      <td className="text-sm font-mono" style={{textAlign:'center',borderBottom}}>{''}</td>
                      {/* Crew Notes */}
                      <td className="text-sm color-muted" style={{borderBottom}}>{''}</td>
                      {/* Truck separator */}
                      <td style={{padding:0,background:'var(--bp-navy)',width:'1px',borderBottom}}></td>
                      {/* Truck columns */}
                      {TRUCK_TYPES.map(t => (
                        <td key={t.key} className="text-sm font-mono color-muted" style={{textAlign:'center',borderBottom}}>
                          {t.key === 'crew' ? (j.cr55d_crewcount || '') : ''}
                        </td>
                      ))}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
