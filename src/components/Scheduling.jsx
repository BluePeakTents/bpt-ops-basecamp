import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch } from '../hooks/useDataverse'

/* ── Constants ─────────────────────────────────────────────────── */
const PMS = [
  'Christhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const DEPT_CODES = [
  { code: 'I-1', name: 'Install Crew 1', color: '#3B82F6' },
  { code: 'I-2', name: 'Install Crew 2', color: '#6366F1' },
  { code: 'I-3', name: 'Install Crew 3', color: '#8B5CF6' },
  { code: 'I-4', name: 'Install Crew 4', color: '#EC4899' },
  { code: 'R-1', name: 'Removal Crew 1', color: '#EF4444' },
  { code: 'R-2', name: 'Removal Crew 2', color: '#F97316' },
  { code: 'E-1', name: 'Event Crew 1', color: '#10B981' },
  { code: 'E-2', name: 'Event Crew 2', color: '#14B8A6' },
  { code: 'W-1', name: 'Warehouse', color: '#6B7280' },
  { code: 'D-1', name: 'Delivery', color: '#D97706' },
]

const LICENSE_CLASSES = { A: 'A CDL', B: 'B CDL', C: 'Class C', D: 'Class D', TVDL: 'TVDL' }

const VEHICLE_TYPES = [
  { type: 'Box Truck (26\')', count: 10, icon: '🚛' },
  { type: 'Box Truck (16\')', count: 3, icon: '📦' },
  { type: 'Pickup (F-250/350)', count: 13, icon: '🛻' },
  { type: 'Flatbed/Stakebed', count: 6, icon: '🚚' },
  { type: 'Ox (Articulating Loader)', count: 11, icon: '🏗️' },
  { type: 'Semi Tractor', count: 1, icon: '🚜' },
]

/* ── Helpers ───────────────────────────────────────────────────── */
function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
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

function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function formatWeekRange(dates) {
  if (!dates || dates.length < 7) return ''
  return `${formatDateShort(dates[0])} – ${formatDateShort(dates[6])}, ${dates[0].getFullYear()}`
}

function getPMInitials(name) {
  return name.split(' ').map(n => n[0]).join('')
}

function shortDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}`
}

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

/* ── Main Component ────────────────────────────────────────────── */
export default function Scheduling({ onSelectJob }) {
  const [subTab, setSubTab] = useState('crew')
  const [weekDate, setWeekDate] = useState(new Date())
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState(null)
  const [selectedPM, setSelectedPM] = useState('')
  const [expandedPool, setExpandedPool] = useState(null)
  const [error, setError] = useState(null)
  const [assigning, setAssigning] = useState(false)

  const weekDates = getWeekDates(weekDate)

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const data = await dvFetch(`cr55d_jobs?$select=cr55d_jobid,cr55d_jobname,cr55d_clientname,cr55d_eventdate,cr55d_installdate,cr55d_strikedate,cr55d_quotedamount,cr55d_venuename,cr55d_venueaddress,cr55d_salesrep,cr55d_jobstatus,cr55d_eventtype,cr55d_pmassigned,cr55d_crewcount,cr55d_trucksneeded&$filter=cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002&$orderby=cr55d_installdate asc&$top=200`)
      setJobs(data || [])
    } catch (e) { console.error('[Scheduling] Load failed:', e); setError(e.message) }
    finally { setLoading(false) }
  }

  const unassignedJobs = jobs.filter(j => !j.cr55d_pmassigned)
  const assignedJobs = jobs.filter(j => !!j.cr55d_pmassigned)

  function getJobsForPM(pmName) {
    return assignedJobs.filter(j => j.cr55d_pmassigned === pmName)
  }

  function jobOverlapsWeek(job, dates) {
    if (!job.cr55d_installdate) return false
    const install = new Date(job.cr55d_installdate.split('T')[0] + 'T12:00:00')
    const strike = job.cr55d_strikedate ? new Date(job.cr55d_strikedate.split('T')[0] + 'T12:00:00') : install
    const weekStart = new Date(dates[0]); weekStart.setHours(0,0,0,0)
    const weekEnd = new Date(dates[6]); weekEnd.setHours(23,59,59,999)
    return install <= weekEnd && strike >= weekStart
  }

  function jobOnDate(job, date) {
    if (!job.cr55d_installdate) return false
    const d = toLocalISO(date)
    const install = job.cr55d_installdate.split('T')[0]
    const strike = job.cr55d_strikedate?.split('T')[0] || install
    return d >= install && d <= strike
  }

  async function handleAssignPM(jobId, pmName) {
    if (assigning) return
    setAssigning(true)
    // Optimistic update
    const prevJobs = jobs
    setJobs(prev => prev.map(j => j.cr55d_jobid === jobId ? { ...j, cr55d_pmassigned: pmName } : j))
    setAssignModal(null)
    setSelectedPM('')
    try {
      await dvPatch(`cr55d_jobs(${jobId})`, { cr55d_pmassigned: pmName })
    } catch (e) {
      console.error('[Scheduling] Assign PM failed:', e)
      setJobs(prevJobs) // Rollback
      setError(`Failed to assign PM: ${e.message}`)
    } finally {
      setAssigning(false)
    }
  }

  /* ── Sub-tab Pills ───────────────────────────────────────────── */
  const tabs = [
    { id: 'crew', label: 'Crew Schedule', icon: '👥' },
    { id: 'truck', label: 'Truck Schedule', icon: '🚚' },
    { id: 'pm', label: 'PM Capacity', icon: '📊' },
    { id: 'eventtech', label: 'Event Techs', icon: '🎤' },
    { id: 'leader', label: 'Leader Sheet', icon: '📋' },
    { id: 'travel', label: 'Travel', icon: '✈️' },
  ]

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Scheduling</h1><div className="sub">Crew, trucks, PMs, event techs</div></div>
        <div className="flex gap-6">
          <button className="cal-nav-btn" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })}>‹</button>
          <span style={{fontSize:'13px',fontWeight:600,color:'var(--bp-navy)',minWidth:'180px',textAlign:'center'}}>{formatWeekRange(weekDates)}</span>
          <button className="cal-nav-btn" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekDate(new Date())}>This Week</button>
        </div>
      </div>

      <div className="flex gap-6 mb-16">
        {tabs.map(t => (
          <button key={t.id} className={`pill${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>
            <span style={{fontSize:'12px'}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">⚠️</span>
          <div>
            {error}
            <button className="btn btn-ghost btn-xs" style={{marginLeft:'8px'}} onClick={() => { setError(null); loadJobs() }}>Retry</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner" style={{marginBottom:'12px'}}></div>Loading schedule data...</div></div>
      ) : (
        <>
          {/* ── Crew Schedule ───────────────────────────────────────── */}
          {subTab === 'crew' && <CrewSchedule weekDates={weekDates} />}

          {/* ── Truck Schedule ──────────────────────────────────────── */}
          {subTab === 'truck' && <TruckSchedule weekDates={weekDates} jobs={jobs} />}

          {/* ── PM Capacity Calendar ───────────────────────────────── */}
          {subTab === 'pm' && (
            <PMCapacity
              weekDates={weekDates}
              jobs={jobs}
              unassignedJobs={unassignedJobs}
              assignedJobs={assignedJobs}
              getJobsForPM={getJobsForPM}
              jobOverlapsWeek={jobOverlapsWeek}
              jobOnDate={jobOnDate}
              handleAssignPM={handleAssignPM}
              assignModal={assignModal}
              setAssignModal={setAssignModal}
              selectedPM={selectedPM}
              setSelectedPM={setSelectedPM}
              expandedPool={expandedPool}
              setExpandedPool={setExpandedPool}
              onSelectJob={onSelectJob}
            />
          )}

          {/* ── Event Techs ────────────────────────────────────────── */}
          {subTab === 'eventtech' && <EventTechSchedule />}

          {/* ── Leader Sheet ───────────────────────────────────────── */}
          {subTab === 'leader' && <LeaderSheet jobs={jobs} weekDates={weekDates} onSelectJob={onSelectJob} />}

          {/* ── Travel ─────────────────────────────────────────────── */}
          {subTab === 'travel' && <TravelTracker jobs={jobs} />}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CREW SCHEDULE
   ═══════════════════════════════════════════════════════════════════ */
function CrewSchedule({ weekDates }) {
  const [activeDepts, setActiveDepts] = useState(DEPT_CODES.slice(0, 6).map(d => d.code))
  const [employees, setEmployees] = useState(() => generateMockEmployees())

  function toggleDept(code) {
    setActiveDepts(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  return (
    <div>
      {/* Department toggles */}
      <div className="card mb-12" style={{padding:'12px 16px'}}>
        <div className="flex-between mb-8">
          <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--bp-muted)'}}>Active Departments</span>
          <div className="flex gap-4">
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts(DEPT_CODES.map(d => d.code))}>All</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts([])}>None</button>
          </div>
        </div>
        <div className="flex gap-6 flex-wrap">
          {DEPT_CODES.map(d => (
            <button key={d.code} className={`pill${activeDepts.includes(d.code) ? ' active' : ''}`}
              style={{fontSize:'10px',padding:'4px 10px',borderColor: activeDepts.includes(d.code) ? d.color : undefined, background: activeDepts.includes(d.code) ? d.color : undefined}}
              onClick={() => toggleDept(d.code)}>
              {d.code} · {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule grid */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div className="crew-grid">
          <div className="crew-header-row" style={{gridTemplateColumns:'200px 60px repeat(7,1fr)'}}>
            <div className="crew-header-cell" style={{textAlign:'left'}}>Employee</div>
            <div className="crew-header-cell">License</div>
            {weekDates.map((d, i) => {
              const isToday = d.toDateString() === new Date().toDateString()
              return (
                <div key={i} className="crew-header-cell" style={{background: isToday ? 'rgba(255,255,255,.15)' : ''}}>
                  {DAYS_SHORT[i]}<br/><span style={{fontSize:'9px',opacity:.7}}>{formatDateShort(d)}</span>
                </div>
              )
            })}
          </div>

          {activeDepts.map(deptCode => {
            const dept = DEPT_CODES.find(d => d.code === deptCode)
            const deptEmployees = employees.filter(e => e.defaultDept === deptCode)
            return (
              <div key={deptCode}>
                <div style={{gridColumn:'1/-1',background:dept.color,color:'#fff',padding:'5px 12px',fontSize:'10px',fontWeight:700,letterSpacing:'.04em',textTransform:'uppercase'}}>
                  {dept.code} — {dept.name} ({deptEmployees.length})
                </div>
                {deptEmployees.map((emp, ei) => {
                  const dayCount = emp.schedule.filter(Boolean).length
                  return (
                    <div key={ei} className="crew-row" style={{gridTemplateColumns:'200px 60px repeat(7,1fr)'}}>
                      <div className="crew-name-cell">
                        <span style={{width:'24px',height:'24px',borderRadius:'6px',background:'rgba(29,58,107,.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'var(--bp-navy)',flexShrink:0}}>
                          {emp.name.split(' ').map(n => n[0]).join('')}
                        </span>
                        <div>
                          <div style={{fontSize:'12px',fontWeight:600}}>{emp.name}</div>
                          {emp.isLead && <span style={{fontSize:'8px',fontWeight:700,color:'var(--bp-green)',textTransform:'uppercase'}}>Lead</span>}
                        </div>
                        {dayCount >= 6 && <span className="crew-warning">⚠️ {dayCount}d</span>}
                      </div>
                      <div className="crew-day-cell">
                        <span className="crew-license">{emp.license}</span>
                      </div>
                      {emp.schedule.map((assigned, di) => (
                        <div key={di} className="crew-day-cell">
                          <div className={`crew-toggle${assigned ? ' active' : ''}`}
                            onClick={() => {
                              setEmployees(prev => prev.map(e =>
                                e.name === emp.name
                                  ? { ...e, schedule: e.schedule.map((s, si) => si === di ? !s : s) }
                                  : e
                              ))
                            }}>
                            {assigned && '✓'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Export */}
      <div className="flex-between mt-12">
        <div style={{fontSize:'11px',color:'var(--bp-muted)'}}>
          {employees.filter(e => activeDepts.includes(e.defaultDept)).length} employees across {activeDepts.length} departments
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => alert('Schedule save coming soon — will persist crew assignments to Dataverse.')}>Save Schedule</button>
          <button className="btn btn-primary btn-sm" onClick={() => alert('Paylocity CSV export coming soon — will generate a CSV formatted for Paylocity import.')}>Export Paylocity CSV</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TRUCK SCHEDULE
   ═══════════════════════════════════════════════════════════════════ */
function TruckSchedule({ weekDates, jobs }) {
  return (
    <div>
      {/* Vehicle type summary */}
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(6,1fr)'}}>
        {VEHICLE_TYPES.map((v, i) => (
          <div key={i} className="kpi">
            <div className="kpi-icon">{v.icon}</div>
            <div className="kpi-label">{v.type}</div>
            <div className="kpi-val">{v.count}</div>
            <div className="kpi-sub">in fleet</div>
          </div>
        ))}
      </div>

      {/* Daily allocation */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'180px'}}>Vehicle Type</th>
              <th style={{width:'60px'}}>Fleet</th>
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString()
                return <th key={i} style={{textAlign:'center', background: isToday ? 'rgba(37,99,235,.06)' : ''}}>{DAYS_SHORT[i]}<br/><span style={{fontSize:'8px',fontWeight:400}}>{formatDateShort(d)}</span></th>
              })}
            </tr>
          </thead>
          <tbody>
            {VEHICLE_TYPES.map((v, i) => {
              const dailyNeeds = weekDates.map((date, di) => {
                // Count jobs active on this day as a proxy for vehicle demand
                const dateStr = toLocalISO(date)
                const activeJobs = jobs.filter(j => {
                  const install = j.cr55d_installdate?.split('T')[0]
                  const strike = j.cr55d_strikedate?.split('T')[0] || install
                  return install && dateStr >= install && dateStr <= strike
                }).length
                // Scale demand by vehicle type (rough heuristic until real data)
                const scale = v.type.includes('Box') ? 0.8 : v.type.includes('Pickup') ? 0.5 : v.type.includes('Ox') ? 0.3 : 0.2
                return Math.min(Math.round(activeJobs * scale), v.count + 2)
              })
              return (
                <tr key={i}>
                  <td style={{fontWeight:600}}><span style={{marginRight:'6px'}}>{v.icon}</span>{v.type}</td>
                  <td className="mono" style={{fontWeight:700,textAlign:'center'}}>{v.count}</td>
                  {dailyNeeds.map((need, di) => {
                    const overCapacity = need > v.count
                    return (
                      <td key={di} style={{textAlign:'center'}}>
                        <span style={{
                          display:'inline-flex',alignItems:'center',justifyContent:'center',
                          width:'28px',height:'28px',borderRadius:'6px',fontSize:'12px',fontWeight:700,fontFamily:'var(--bp-mono)',
                          background: overCapacity ? 'var(--bp-red-bg)' : need >= v.count ? 'var(--bp-amber-bg)' : need > 0 ? 'var(--bp-green-bg)' : 'var(--bp-alt)',
                          color: overCapacity ? 'var(--bp-red)' : need >= v.count ? '#92400e' : need > 0 ? 'var(--bp-green)' : 'var(--bp-light)',
                        }}>
                          {need}
                        </span>
                        {overCapacity && <div style={{fontSize:'8px',color:'var(--bp-red)',fontWeight:700,marginTop:'2px'}}>+{need - v.count} over</div>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Validation alerts */}
      <div className="callout callout-amber mt-12">
        <span className="callout-icon">⚡</span>
        <div>
          <strong>Truck validation</strong> cross-references with the crew scheduler. When crews are planned for a day, the system validates enough trucks are available. Alerts will appear here when demand exceeds supply.
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PM CAPACITY CALENDAR
   ═══════════════════════════════════════════════════════════════════ */
function PMCapacity({ weekDates, jobs, unassignedJobs, assignedJobs, getJobsForPM, jobOverlapsWeek, jobOnDate, handleAssignPM, assignModal, setAssignModal, selectedPM, setSelectedPM, expandedPool, setExpandedPool, onSelectJob }) {

  function getPMLoad(pmName) {
    const pmJobs = getJobsForPM(pmName).filter(j => jobOverlapsWeek(j, weekDates))
    const totalDays = pmJobs.reduce((sum, j) => {
      let days = 0
      weekDates.forEach(d => { if (jobOnDate(j, d)) days++ })
      return sum + days
    }, 0)
    if (totalDays >= 6) return 'red'
    if (totalDays >= 4) return 'amber'
    return 'green'
  }

  return (
    <div>
      {/* Unassigned Pool */}
      <div className="pool animate-in">
        <div className="pool-header">
          <div className="pool-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bp-navy)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>
            Unassigned Jobs
            {unassignedJobs.length > 0 && <span className="pool-count">{unassignedJobs.length}</span>}
          </div>
          <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>Drag to a PM row or click to assign</span>
        </div>

        {unassignedJobs.length === 0 ? (
          <div style={{textAlign:'center',padding:'12px',fontSize:'12px',color:'var(--bp-light)'}}>
            All jobs have been assigned to PMs ✓
          </div>
        ) : (
          <div className="pool-grid">
            {unassignedJobs.map((j, i) => (
              <div key={j.cr55d_jobid} className="pool-card"
                draggable="true"
                onDragStart={(e) => e.dataTransfer.setData('jobId', j.cr55d_jobid)}
                onClick={() => expandedPool === j.cr55d_jobid ? setExpandedPool(null) : setExpandedPool(j.cr55d_jobid)}>
                <div className="pool-card-title">{j.cr55d_clientname || j.cr55d_jobname}</div>
                <div className="pool-card-meta">
                  <span>{j.cr55d_venuename || ''}</span>
                </div>
                <div className="pool-card-dates">
                  {shortDate(j.cr55d_installdate?.split('T')[0])} → {shortDate(j.cr55d_strikedate?.split('T')[0] || j.cr55d_eventdate?.split('T')[0])}
                </div>
                {j.cr55d_crewcount && <span className="pool-card-crew">{j.cr55d_crewcount} crew</span>}
                {j.cr55d_quotedamount && <span style={{fontSize:'10px',fontFamily:'var(--bp-mono)',color:'var(--bp-muted)',marginLeft:'6px'}}>{fmtCurrency(j.cr55d_quotedamount)}</span>}

                {/* Expanded detail */}
                {expandedPool === j.cr55d_jobid && (
                  <div style={{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid var(--bp-border-lt)'}}>
                    <div style={{fontSize:'11px',color:'var(--bp-muted)',marginBottom:'6px'}}>
                      <div>Type: {j.cr55d_eventtype ? (['Wedding','Corporate','Social','Festival','Fundraiser'][j.cr55d_eventtype - 987650000] || '') : '—'}</div>
                      <div>Sales: {j.cr55d_salesrep || '—'}</div>
                      <div>Trucks: {j.cr55d_trucksneeded || '—'}</div>
                    </div>
                    <button className="btn btn-primary btn-sm w-full" onClick={(e) => { e.stopPropagation(); setAssignModal(j) }}>
                      Assign PM
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PM Calendar Grid */}
      <div className="pm-cal animate-in-1">
        <div className="pm-cal-header" style={{gridTemplateColumns:'160px repeat(7,1fr)'}}>
          <div style={{textAlign:'left',paddingLeft:'12px'}}>PM</div>
          {weekDates.map((d, i) => {
            const isToday = d.toDateString() === new Date().toDateString()
            return (
              <div key={i} style={{background: isToday ? 'rgba(37,99,235,.08)' : ''}}>
                {DAYS_SHORT[i]}<br/><span style={{fontSize:'9px',opacity:.7}}>{formatDateShort(d)}</span>
              </div>
            )
          })}
        </div>

        {PMS.map((pm, pi) => {
          const pmJobs = getJobsForPM(pm).filter(j => jobOverlapsWeek(j, weekDates))
          const load = getPMLoad(pm)
          const colors = { light: '#DBEAFE', medium: '#FEF3C7', heavy: '#FEE2E2' }

          return (
            <div key={pm} className="pm-row" style={{gridTemplateColumns:'160px repeat(7,1fr)'}}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const jobId = e.dataTransfer.getData('jobId'); if (jobId) handleAssignPM(jobId, pm) }}>
              <div className="pm-name">
                <span style={{width:'28px',height:'28px',borderRadius:'8px',background:'rgba(29,58,107,.08)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'var(--bp-navy)'}}>
                  {getPMInitials(pm)}
                </span>
                <div>
                  <div style={{fontSize:'12px'}}>{pm.split(' ')[0]}</div>
                  <div className={`pm-load ${load}`}>
                    {load === 'green' ? 'Available' : load === 'amber' ? 'Busy' : 'Heavy'}
                  </div>
                </div>
              </div>

              {weekDates.map((date, di) => {
                const dayJobs = pmJobs.filter(j => jobOnDate(j, date))
                return (
                  <div key={di} className={`pm-cell${dayJobs.length > 0 ? ' has-job' : ''}`}>
                    {dayJobs.map((j, ji) => {
                      const complexity = (j.cr55d_quotedamount || 0) > 30000 ? 'heavy' : (j.cr55d_quotedamount || 0) > 10000 ? 'medium' : 'light'
                      return (
                        <div key={ji} className={`pm-job-block ${complexity}`}
                          onClick={() => onSelectJob && onSelectJob(j)}
                          title={`${j.cr55d_clientname} — ${j.cr55d_jobname}`}>
                          {j.cr55d_clientname?.split(' ')[0] || j.cr55d_jobname?.substring(0, 12)}
                        </div>
                      )
                    })}
                    {dayJobs.length > 1 && (
                      <div style={{fontSize:'8px',color:'var(--bp-amber)',fontWeight:700,textAlign:'center'}}>⚠️ overlap</div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="modal-overlay open" onClick={() => setAssignModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'420px'}}>
            <div className="modal-header">
              <h3>Assign PM</h3>
              <button className="modal-close" onClick={() => setAssignModal(null)}>×</button>
            </div>
            <div style={{fontSize:'13px',marginBottom:'12px'}}>
              <strong>{assignModal.cr55d_clientname}</strong> — {assignModal.cr55d_jobname}
              <div style={{fontSize:'11px',color:'var(--bp-muted)',marginTop:'4px'}}>
                {shortDate(assignModal.cr55d_installdate?.split('T')[0])} → {shortDate(assignModal.cr55d_strikedate?.split('T')[0] || assignModal.cr55d_eventdate?.split('T')[0])}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Select PM</label>
              <select className="form-select" value={selectedPM} onChange={e => setSelectedPM(e.target.value)}>
                <option value="">Choose a PM...</option>
                {PMS.map(pm => <option key={pm} value={pm}>{pm}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!selectedPM || assigning} onClick={() => handleAssignPM(assignModal.cr55d_jobid, selectedPM)}>
                Assign to {selectedPM ? selectedPM.split(' ')[0] : '...'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="callout callout-blue mt-12 animate-in-2">
        <span className="callout-icon">💡</span>
        <div>Drag unassigned job cards onto a PM's row to assign them. Click a job card to assign via dropdown. PM assignments cascade to the Dashboard delivery schedule and crew scheduler.</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT TECH SCHEDULE (Shell)
   ═══════════════════════════════════════════════════════════════════ */
function EventTechSchedule() {
  const specializations = ['Lighting', 'Power / Generator', 'HVAC', 'Audio / Visual', 'Flooring', 'Draping']
  return (
    <div>
      <div className="callout callout-blue mb-16">
        <span className="callout-icon">ℹ️</span>
        <div>Event Tech Schedule is ready for data. Tech roster and specializations will be populated as techs are added to Dataverse.</div>
      </div>
      <div className="card">
        <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--bp-muted)',marginBottom:'12px'}}>Specializations</div>
        <div className="flex gap-6 flex-wrap">
          {specializations.map((s, i) => (
            <span key={i} className="badge badge-navy" style={{fontSize:'11px',padding:'4px 12px'}}>{s}</span>
          ))}
        </div>
      </div>
      <div className="card mt-12">
        <div className="empty-state">
          <div className="empty-state-icon">🎤</div>
          <div className="empty-state-title">Event Tech Roster</div>
          <div className="empty-state-sub">Add event techs and their specializations to begin scheduling. Integration with main crew scheduler for general field crew days.</div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   LEADER SHEET
   ═══════════════════════════════════════════════════════════════════ */
function LeaderSheet({ jobs, weekDates, onSelectJob }) {
  const upcomingJobs = jobs.filter(j => {
    if (!j.cr55d_installdate) return false
    const install = new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    return install <= twoWeeks && install >= new Date()
  }).sort((a, b) => (a.cr55d_installdate || '').localeCompare(b.cr55d_installdate || ''))

  return (
    <div>
      <div className="flex-between mb-12">
        <div style={{fontSize:'12px',color:'var(--bp-muted)'}}>Next 2 weeks — {upcomingJobs.length} jobs</div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨️ Print</button>
          <button className="btn btn-primary btn-sm" onClick={() => alert('PDF download coming soon — will generate a printable leader sheet via the PDF service.')}>📥 Download PDF</button>
        </div>
      </div>

      {upcomingJobs.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-title">No upcoming jobs</div><div className="empty-state-sub">Jobs installing in the next 2 weeks will appear here</div></div></div>
      ) : (
        upcomingJobs.map((j, i) => (
          <div key={j.cr55d_jobid} className="card mb-8 card-interactive" onClick={() => onSelectJob && onSelectJob(j)} style={{animation: `slideUp .3s ease ${i * 50}ms both`}}>
            <div className="flex-between mb-4">
              <div>
                <span style={{fontSize:'14px',fontWeight:700,color:'var(--bp-navy)'}}>{j.cr55d_clientname || j.cr55d_jobname}</span>
                <span className="badge badge-blue" style={{marginLeft:'8px'}}>{j.cr55d_pmassigned || 'No PM'}</span>
              </div>
              <span style={{fontSize:'12px',fontFamily:'var(--bp-mono)',fontWeight:700,color:'var(--bp-navy)'}}>
                {shortDate(j.cr55d_installdate?.split('T')[0])}
              </span>
            </div>
            <div className="grid-3" style={{fontSize:'11px',color:'var(--bp-muted)'}}>
              <div><strong>Venue:</strong> {j.cr55d_venuename || '—'}</div>
              <div><strong>Crew:</strong> {j.cr55d_crewcount || '—'} people</div>
              <div><strong>Trucks:</strong> {j.cr55d_trucksneeded || '—'}</div>
            </div>
            {j.cr55d_venueaddress && (
              <div style={{fontSize:'10px',color:'var(--bp-light)',marginTop:'4px'}}>📍 {j.cr55d_venueaddress}</div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TRAVEL TRACKER (Hotels, Flights, Rental Cars)
   ═══════════════════════════════════════════════════════════════════ */
function TravelTracker({ jobs }) {
  const [travelTab, setTravelTab] = useState('hotels')

  return (
    <div>
      <div className="flex gap-6 mb-12">
        {[
          {id:'hotels', label:'Hotels', icon:'🏨'},
          {id:'flights', label:'Flights', icon:'✈️'},
          {id:'rentals', label:'Rental Cars', icon:'🚗'},
        ].map(t => (
          <button key={t.id} className={`pill${travelTab === t.id ? ' active' : ''}`} onClick={() => setTravelTab(t.id)}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">{travelTab === 'hotels' ? '🏨' : travelTab === 'flights' ? '✈️' : '🚗'}</div>
          <div className="empty-state-title">{travelTab === 'hotels' ? 'Hotel' : travelTab === 'flights' ? 'Flight' : 'Rental Car'} Tracker</div>
          <div className="empty-state-sub">
            {travelTab === 'hotels' ? 'Out-of-town jobs auto-flag based on distance from Batavia. Track reservations, room counts, costs, and Ramp deposit holds.' :
             travelTab === 'flights' ? 'Track airline bookings, confirmation numbers, passenger names, and costs per job.' :
             'Track rental car bookings, pickup/return dates, vehicle types, and daily rates.'}
          </div>
        </div>
      </div>

      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>Blue Peak expects ~6 travel instances in 2026. Jobs will be auto-flagged as overnight based on job location distance from Batavia. Integrated with Ramp API for spend visibility.</div>
      </div>
    </div>
  )
}

/* ── Mock Data Generator ───────────────────────────────────────── */
function generateMockEmployees() {
  const names = [
    'Carlos Rosales','Anthony Devereux','Nate Gorski','Jeremy Pask','Jorge Hernandez',
    'Silvano Eugenio','Brendon French','Tim Lasfalk','Zach Schmitt','Christhian Benitez',
    'Miguel Torres','Andre Williams','David Chen','Marcus Johnson','Ryan Mitchell',
    'Tyler Brooks','Juan Garcia','Sam Rivera','Alex Coleman','Brandon Hayes',
    'Pedro Sanchez','Jake Wilson','Luis Morales','Chris Anderson','Daniel Lee',
    'Kevin Thompson','Ricardo Flores','James Martin','Derek Cooper','Sean Murphy',
  ]
  const licenses = ['A','A','B','B','B','C','C','C','C','D','D','D','TVDL','TVDL','C']
  const depts = DEPT_CODES.map(d => d.code)

  return names.map((name, i) => ({
    name,
    license: licenses[i % licenses.length],
    isLead: i < 6,
    defaultDept: depts[i % depts.length],
    schedule: Array.from({length: 7}, () => Math.random() > 0.35),
    daysThisWeek: Math.floor(Math.random() * 3 + 3),
  }))
}
