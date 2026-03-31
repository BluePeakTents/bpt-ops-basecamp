import { useMemo } from 'react'
import { isoDate, shortDate } from '../../utils/dateUtils'

/* ── Helpers ───────────────────────────────────────────────────── */
function getStaffDisplayName(name) {
  if (!name) return '\u2014'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

/* ── Component ─────────────────────────────────────────────────── */
export default function EventTechSchedule({ staff, jobs, weekDates, onSelectJob }) {
  const DEPT_LABELS = { 306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member', 306280006: 'Warehouse', 306280010: 'Crew Leader' }
  const opsCrew = staff.filter(s => [306280003, 306280004, 306280005, 306280006, 306280010].includes(s.cr55d_department))

  const eventJobs = useMemo(() => jobs.filter(j => {
    if (!j.cr55d_eventdate) return false
    const evt = new Date(j.cr55d_eventdate.split('T')[0] + 'T12:00:00')
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    return evt >= new Date(new Date().setHours(0,0,0,0)) && evt <= twoWeeks
  }).sort((a, b) => (a.cr55d_eventdate || '').localeCompare(b.cr55d_eventdate || '')), [jobs])


  return (
    <div>
      <div className="kpi-row-3 mb-12">
        <div className="kpi"><div className="kpi-label">Upcoming Events</div><div className="kpi-val">{eventJobs.length}</div><div className="kpi-sub">next 2 weeks</div></div>
        <div className="kpi"><div className="kpi-label">Available Crew</div><div className="kpi-val">{opsCrew.length}</div><div className="kpi-sub">operational staff</div></div>
        <div className="kpi"><div className="kpi-label">Crew Leaders</div><div className="kpi-val color-green">{staff.filter(s => s.cr55d_department === 306280010).length}</div><div className="kpi-sub">available to lead</div></div>
      </div>

      {eventJobs.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">&#127908;</div><div className="empty-state-title">No Upcoming Events</div><div className="empty-state-sub">Jobs with event dates in the next 2 weeks will appear here for tech assignment.</div></div></div>
      ) : (
        <div className="card card-flush">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Event Date</th><th>Venue</th><th>Crew Needed</th><th>PM</th></tr></thead>
            <tbody>
              {eventJobs.map(j => (
                <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                  <td className="font-semibold color-navy">{j.cr55d_jobname || '\u2014'}</td>
                  <td>{j.cr55d_clientname || '\u2014'}</td>
                  <td className="mono">{shortDate(isoDate(j.cr55d_eventdate))}</td>
                  <td>{j.cr55d_venuename || '\u2014'}</td>
                  <td className="text-center">{j.cr55d_crewcount || '\u2014'}</td>
                  <td><span className="badge badge-blue">{j.cr55d_pmassigned || 'Unassigned'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card mt-12">
        <div className="card-head">Operational Crew Roster ({opsCrew.length})</div>
        <div className="card-sub">Active staff available for event tech assignments</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'6px',marginTop:'10px'}}>
          {opsCrew.map(s => (
            <div key={s.cr55d_stafflistid} className="text-md" style={{padding:'6px 10px',background:'var(--bp-alt)',borderRadius:'6px',display:'flex',alignItems:'center',gap:'6px'}}>
              <span className="font-bold color-navy" style={{width:'22px',height:'22px',borderRadius:'5px',background:'var(--bp-navy-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',flexShrink:0}}>
                {(s.cr55d_name || '?').split(',').map(p => p.trim()[0] || '').reverse().join('')}
              </span>
              <span className="font-semibold color-navy">{getStaffDisplayName(s.cr55d_name)}</span>
              <span className="text-2xs color-muted ml-auto">{DEPT_LABELS[s.cr55d_department] || ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
