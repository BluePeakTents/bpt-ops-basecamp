import { useState, useMemo } from 'react'
import { toLocalISO, isoDate, shortDate } from '../../utils/dateUtils'

/* ── Helpers ───────────────────────────────────────────────────── */
function getStaffDisplayName(name) {
  if (!name) return '\u2014'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

function getStaffShortName(name) {
  if (!name) return '?'
  const parts = name.split(',').map(s => s.trim())
  return parts.length >= 2 ? parts[1].split(' ')[0] : name.split(' ')[0]
}

const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/* ═══════════════════════════════════════════════════════════════════
   EVENT TECH — Dedicated scheduling tab
   Auto-populates from invoices with event tech, shows unassigned pool,
   enforces rest rules (Saturday night = not available Sunday).
   ═══════════════════════════════════════════════════════════════════ */
export default function EventTechSchedule({ staff, jobs, weekDates, onSelectJob }) {
  const [assignments, setAssignments] = useState({}) // jobId → [staffId, ...]
  const [filter, setFilter] = useState('all') // all, unassigned, assigned

  const opsCrew = staff.filter(s => [306280003, 306280004, 306280005, 306280006, 306280010].includes(s.cr55d_department))

  // ALL event tech jobs — not just 2 weeks, show everything with an event date
  const eventJobs = useMemo(() => jobs.filter(j => {
    if (!j.cr55d_eventdate) return false
    const evt = new Date(j.cr55d_eventdate.split('T')[0] + 'T12:00:00')
    return evt >= new Date(new Date().setHours(0,0,0,0))
  }).sort((a, b) => (a.cr55d_eventdate || '').localeCompare(b.cr55d_eventdate || '')), [jobs])

  // Split into assigned vs unassigned
  const assignedJobs = eventJobs.filter(j => (assignments[j.cr55d_jobid] || []).length > 0)
  const unassignedJobs = eventJobs.filter(j => (assignments[j.cr55d_jobid] || []).length === 0)

  const filtered = filter === 'unassigned' ? unassignedJobs : filter === 'assigned' ? assignedJobs : eventJobs

  // Scheduling rules: find conflicts
  const conflicts = useMemo(() => {
    const issues = []
    // For each assigned staff member, check rest rules
    for (const [jobId, staffIds] of Object.entries(assignments)) {
      const job = jobs.find(j => j.cr55d_jobid === jobId)
      if (!job || !job.cr55d_eventdate) continue
      const evtDate = new Date(job.cr55d_eventdate.split('T')[0] + 'T12:00:00')
      const dayOfWeek = evtDate.getDay()
      const nextDay = new Date(evtDate); nextDay.setDate(nextDay.getDate() + 1)

      for (const sid of staffIds) {
        const emp = staff.find(s => s.cr55d_stafflistid === sid)
        if (!emp) continue
        // Saturday night tech → NOT available Sunday
        if (dayOfWeek === 6) {
          issues.push({
            type: 'rest', severity: 'danger',
            message: `${getStaffShortName(emp.cr55d_name)} works Saturday night event tech — NOT available Sunday`,
            jobId, staffId: sid, blockedDate: toLocalISO(nextDay)
          })
        }
      }
    }
    return issues
  }, [assignments, jobs, staff])

  function toggleAssignment(jobId, staffId) {
    setAssignments(prev => {
      const cur = prev[jobId] || []
      if (cur.includes(staffId)) return { ...prev, [jobId]: cur.filter(id => id !== staffId) }
      return { ...prev, [jobId]: [...cur, staffId] }
    })
  }

  // Time buckets
  const thisWeek = filtered.filter(j => {
    const d = isoDate(j.cr55d_eventdate)
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    return d && d <= toLocalISO(weekEnd)
  })
  const thisMonth = filtered.filter(j => {
    const d = isoDate(j.cr55d_eventdate)
    const monthEnd = new Date(); monthEnd.setDate(monthEnd.getDate() + 30)
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    return d && d > toLocalISO(weekEnd) && d <= toLocalISO(monthEnd)
  })
  const future = filtered.filter(j => {
    const d = isoDate(j.cr55d_eventdate)
    const monthEnd = new Date(); monthEnd.setDate(monthEnd.getDate() + 30)
    return d && d > toLocalISO(monthEnd)
  })

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Total Events</div><div className="kpi-val">{eventJobs.length}</div><div className="kpi-sub">upcoming</div></div>
        <div className="kpi"><div className="kpi-label">Unassigned</div><div className="kpi-val" style={{color: unassignedJobs.length > 0 ? 'var(--bp-amber)' : 'var(--bp-green)'}}>{unassignedJobs.length}</div><div className="kpi-sub">{unassignedJobs.length === 0 ? 'all covered' : 'need techs'}</div></div>
        <div className="kpi"><div className="kpi-label">Conflicts</div><div className="kpi-val" style={{color: conflicts.length > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{conflicts.length}</div><div className="kpi-sub">{conflicts.length === 0 ? 'none' : 'rest rule violations'}</div></div>
        <div className="kpi"><div className="kpi-label">Available Crew</div><div className="kpi-val">{opsCrew.length}</div><div className="kpi-sub">operational staff</div></div>
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">⚠️</span>
          <div>
            <strong>Scheduling conflicts:</strong>
            <ul style={{margin: '4px 0 0', paddingLeft: '16px', fontSize: '12px'}}>
              {conflicts.map((c, i) => <li key={i}>{c.message}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-6 mb-12">
        <button className={`pill${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All ({eventJobs.length})</button>
        <button className={`pill${filter === 'unassigned' ? ' active' : ''}`} onClick={() => setFilter('unassigned')}>Unassigned ({unassignedJobs.length})</button>
        <button className={`pill${filter === 'assigned' ? ' active' : ''}`} onClick={() => setFilter('assigned')}>Assigned ({assignedJobs.length})</button>
      </div>

      {/* Event list grouped by time bucket */}
      {[
        { label: 'This Week', jobs: thisWeek, color: 'var(--bp-red)' },
        { label: 'This Month', jobs: thisMonth, color: 'var(--bp-amber)' },
        { label: 'Future', jobs: future, color: 'var(--bp-blue)' },
      ].filter(g => g.jobs.length > 0).map(group => (
        <div key={group.label} className="mb-12">
          <div className="text-md font-bold mb-6" style={{color: group.color}}>{group.label} ({group.jobs.length})</div>
          <div className="card card-flush">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{width: '120px'}}>Event Date</th>
                  <th>Job Name</th>
                  <th>Client</th>
                  <th>Venue</th>
                  <th style={{width: '80px'}}>Techs Needed</th>
                  <th style={{width: '200px'}}>Assigned</th>
                  <th style={{width: '80px'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {group.jobs.map(j => {
                  const evtDate = new Date(j.cr55d_eventdate.split('T')[0] + 'T12:00:00')
                  const dayName = DAYS_FULL[evtDate.getDay()]
                  const techsAssigned = (assignments[j.cr55d_jobid] || []).length
                  const techsNeeded = j.cr55d_crewcount || 1
                  const isFull = techsAssigned >= techsNeeded
                  return (
                    <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob?.(j)}>
                      <td className="mono" style={{fontSize: '12px'}}>
                        <div style={{fontWeight: 600}}>{dayName}</div>
                        <div style={{color: 'var(--bp-muted)'}}>{shortDate(isoDate(j.cr55d_eventdate))}</div>
                      </td>
                      <td className="font-semibold color-navy">{j.cr55d_jobname || '\u2014'}</td>
                      <td>{j.cr55d_clientname || '\u2014'}</td>
                      <td>{j.cr55d_venuename || '\u2014'}</td>
                      <td className="text-center mono font-bold">{techsNeeded}</td>
                      <td>
                        <div className="flex gap-4 flex-wrap">
                          {(assignments[j.cr55d_jobid] || []).map(sid => {
                            const emp = staff.find(s => s.cr55d_stafflistid === sid)
                            return emp ? <span key={sid} className="badge badge-green" style={{fontSize: '10px'}}>{getStaffShortName(emp.cr55d_name)}</span> : null
                          })}
                          {techsAssigned === 0 && <span className="text-sm color-muted" style={{fontStyle: 'italic'}}>none</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${isFull ? 'badge-green' : 'badge-amber'}`}>
                          {isFull ? 'Covered' : `${techsAssigned}/${techsNeeded}`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">🎤</div><div className="empty-state-title">No Event Tech Jobs</div><div className="empty-state-sub">Jobs with event dates will appear here for tech assignment.</div></div></div>
      )}
    </div>
  )
}
