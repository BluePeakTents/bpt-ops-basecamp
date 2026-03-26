import React, { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch } from '../hooks/useDataverse'

/* ── Constants ─────────────────────────────────────────────────── */
const PMS = [
  'Christhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const DEPT_CODES = [
  { code: 'I-1', name: 'Install Crew 1', color: '#1D3A6B' },
  { code: 'I-2', name: 'Install Crew 2', color: '#2B4F8A' },
  { code: 'I-3', name: 'Install Crew 3', color: '#3A6BAE' },
  { code: 'I-4', name: 'Install Crew 4', color: '#4A7FBF' },
  { code: 'R-1', name: 'Removal Crew 1', color: '#7996AA' },
  { code: 'R-2', name: 'Removal Crew 2', color: '#6A87A0' },
  { code: 'E-1', name: 'Event Crew 1', color: '#2E7D52' },
  { code: 'E-2', name: 'Event Crew 2', color: '#3A8F60' },
  { code: 'W-1', name: 'Warehouse', color: '#6B7280' },
  { code: 'D-1', name: 'Delivery', color: '#8B7355' },
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
  const [error, setError] = useState(null)
  const [assigning, setAssigning] = useState(false)

  const weekDates = getWeekDates(weekDate)

  useEffect(() => {
    loadJobs()
    const poll = setInterval(() => { if (!document.hidden) loadJobs() }, 30000)
    const onVisible = () => { if (!document.hidden) loadJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

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
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      await dvPatch(`cr55d_jobs(${safeId})`, { cr55d_pmassigned: pmName })
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
        <div><h1>Scheduling</h1><div className="sub">Crew, trucks, PMs, event techs</div><div className="page-head-accent"></div></div>
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
              onSelectJob={onSelectJob}
              assigning={assigning}
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
function PMCapacity({ weekDates, jobs, unassignedJobs, assignedJobs, getJobsForPM, jobOverlapsWeek, jobOnDate, handleAssignPM, onSelectJob, assigning }) {
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [collapsedBuckets, setCollapsedBuckets] = useState(new Set(['thisWeek','nextWeek','later']))
  const [toast, setToast] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [workersAvailableOverrides, setWorkersAvailableOverrides] = useState({})
  const [cellEdits, setCellEdits] = useState({})
  const [editingCell, setEditingCell] = useState(null)

  /* ── Account Manager initials map ──────────────────────────── */
  const AM_INITIALS = { 'David Cesar': 'DC', 'Glen Hansen': 'GH', 'Kyle Turriff': 'KT', 'Desiree Pearson': 'DP', 'Larrisa Henington': 'LH' }

  function salesRepToInitials(rep) {
    if (!rep) return ''
    if (AM_INITIALS[rep]) return AM_INITIALS[rep]
    // Try to match partial
    const entry = Object.entries(AM_INITIALS).find(([name]) => rep.toLowerCase().includes(name.split(' ')[1].toLowerCase()))
    if (entry) return entry[1]
    // Fallback: first letters
    return rep.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
  }

  /* ── Month days generation ─────────────────────────────────── */
  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d))
    }
    return days
  }, [currentMonth])

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  /* ── Default workers available by day of week ──────────────── */
  function getDefaultWorkersAvailable(date) {
    const dow = date.getDay()
    if (dow === 0) return 32  // Sunday
    if (dow === 6) return 34  // Saturday
    return 40                  // Weekday
  }

  function getWorkersAvailable(dateStr) {
    if (workersAvailableOverrides[dateStr] !== undefined) return workersAvailableOverrides[dateStr]
    const date = new Date(dateStr + 'T12:00:00')
    return getDefaultWorkersAvailable(date)
  }

  /* ── Build slot data: for each day+half, each PM's assignment ─ */
  const slotData = useMemo(() => {
    const data = {}
    monthDays.forEach(date => {
      const dateStr = toLocalISO(date)
      data[dateStr] = { am: {}, pm: {} }
      // Auto-populate from jobs
      PMS.forEach(pmName => {
        const pmJobs = getJobsForPM(pmName)
        pmJobs.forEach(j => {
          if (!j.cr55d_installdate) return
          const install = j.cr55d_installdate.split('T')[0]
          const strike = j.cr55d_strikedate?.split('T')[0] || install
          if (dateStr >= install && dateStr <= strike) {
            // Put auto-populated jobs in AM slot
            if (!data[dateStr].am[pmName]) {
              data[dateStr].am[pmName] = {
                workers: j.cr55d_crewcount || 0,
                acctMgr: salesRepToInitials(j.cr55d_salesrep),
                desc: ((j.cr55d_clientname || '') + ' ' + (j.cr55d_jobname || '')).trim(),
                jobId: j.cr55d_jobid,
                auto: true
              }
            }
          }
        })
      })
    })
    // Apply manual cell edits on top
    Object.entries(cellEdits).forEach(([key, val]) => {
      // key format: dateStr|half|pmName
      const [dateStr, half, pmName] = key.split('|')
      if (data[dateStr] && data[dateStr][half]) {
        data[dateStr][half][pmName] = { ...val, auto: false }
      }
    })
    return data
  }, [monthDays, assignedJobs, getJobsForPM, cellEdits])

  /* ── Capacity calculations per half-day ────────────────────── */
  const capacityData = useMemo(() => {
    const result = {}
    monthDays.forEach(date => {
      const dateStr = toLocalISO(date)
      const daySlots = slotData[dateStr]
      if (!daySlots) return
      const available = getWorkersAvailable(dateStr)

      ;['am','pm'].forEach(half => {
        let needed = 0
        PMS.forEach(pmName => {
          const slot = daySlots[half]?.[pmName]
          if (slot && slot.workers) needed += Number(slot.workers) || 0
        })
        if (!result[dateStr]) result[dateStr] = {}
        result[dateStr][half] = { needed, available, pct: available > 0 ? Math.round((needed / available) * 100) : 0 }
      })
      // Daily combined
      const amNeeded = result[dateStr].am.needed
      const pmNeeded = result[dateStr].pm.needed
      const totalNeeded = amNeeded + pmNeeded
      const totalAvail = available * 2
      result[dateStr].daily = { needed: totalNeeded, available: totalAvail, pct: totalAvail > 0 ? Math.round((totalNeeded / totalAvail) * 100) : 0 }
    })
    return result
  }, [monthDays, slotData, workersAvailableOverrides])

  /* ── Week boundaries for summary rows ──────────────────────── */
  const weekSummaries = useMemo(() => {
    const summaries = []
    let weekStart = null
    let weekNeeded = 0
    let weekAvail = 0
    monthDays.forEach((date, i) => {
      const dateStr = toLocalISO(date)
      if (!weekStart) weekStart = dateStr
      const cap = capacityData[dateStr]
      if (cap) {
        weekNeeded += (cap.am?.needed || 0) + (cap.pm?.needed || 0)
        weekAvail += getWorkersAvailable(dateStr) * 2
      }
      const dow = date.getDay()
      if (dow === 0 || i === monthDays.length - 1) {
        summaries.push({
          afterDate: dateStr,
          needed: weekNeeded,
          available: weekAvail,
          pct: weekAvail > 0 ? Math.round((weekNeeded / weekAvail) * 100) : 0
        })
        weekStart = null
        weekNeeded = 0
        weekAvail = 0
      }
    })
    return summaries
  }, [monthDays, capacityData, workersAvailableOverrides])

  /* ── Time bucketing for unassigned panel ────────────────────── */
  const buckets = useMemo(() => {
    const weekStart = weekDates[0]
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const nextWeekEnd = new Date(weekStart)
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 13)

    const result = { thisWeek: [], nextWeek: [], later: [] }
    const sorted = [...unassignedJobs].sort((a, b) => {
      const da = a.cr55d_installdate || '9999'
      const db = b.cr55d_installdate || '9999'
      return da.localeCompare(db)
    })

    sorted.forEach(j => {
      const install = j.cr55d_installdate
        ? new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
        : null
      if (!install) { result.later.push(j); return }
      if (install <= weekEnd) result.thisWeek.push(j)
      else if (install <= nextWeekEnd) result.nextWeek.push(j)
      else result.later.push(j)
    })
    return result
  }, [unassignedJobs, weekDates])

  /* ── Helpers ─────────────────────────────────────────────────── */
  const EVENT_TYPES = { 987650000: 'Wedding', 987650001: 'Corporate', 987650002: 'Social', 987650003: 'Festival', 987650004: 'Fundraiser' }

  function getCapacityColor(pct) {
    if (pct > 110) return '#C0392B'    // red
    if (pct >= 100) return '#2563EB'   // blue
    if (pct >= 80) return '#D97706'    // amber
    return '#2E7D52'                   // green
  }

  function getCapacityBg(pct) {
    if (pct > 110) return '#fef2f2'
    if (pct >= 100) return '#eff6ff'
    if (pct >= 80) return '#fffbeb'
    return '#ecfdf5'
  }

  function toggleBucket(key) {
    setCollapsedBuckets(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function showToast(opts) {
    if (toast?.timer) clearTimeout(toast.timer)
    const timer = setTimeout(() => setToast(null), 5000)
    setToast({ ...opts, timer })
  }

  function handleUndo() {
    if (toast?.undoFn) toast.undoFn()
    if (toast?.timer) clearTimeout(toast.timer)
    setToast(null)
  }

  function handleDrop(e, pmName, dateStr, half) {
    e.preventDefault()
    const jobId = e.dataTransfer.getData('jobId')
    if (!jobId || assigning) return
    const droppedJob = unassignedJobs.find(j => j.cr55d_jobid === jobId)
    handleAssignPM(jobId, pmName)
    setSelectedJob(null)
    if (droppedJob) {
      showToast({
        message: `Assigned ${droppedJob.cr55d_clientname || droppedJob.cr55d_jobname} to ${pmName.split(' ')[0]}`,
        type: 'success',
        undoFn: () => handleAssignPM(jobId, '')
      })
    }
  }

  function handleOneClickAssign(job, pmName) {
    if (assigning) return
    handleAssignPM(job.cr55d_jobid, pmName)
    setSelectedJob(null)
    showToast({
      message: `Assigned ${job.cr55d_clientname || job.cr55d_jobname} to ${pmName.split(' ')[0]}`,
      type: 'success',
      undoFn: () => handleAssignPM(job.cr55d_jobid, '')
    })
  }

  function goToday() {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  function goPrevMonth() {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  function goNextMonth() {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  // Clear selection if the selected job got assigned
  if (selectedJob && !unassignedJobs.find(j => j.cr55d_jobid === selectedJob.cr55d_jobid)) {
    setSelectedJob(null)
  }

  /* ── Shared inline styles ──────────────────────────────────── */
  const sCell = { padding: '1px 3px', fontSize: '10px', borderRight: '1px solid var(--bp-border)', borderBottom: '1px solid var(--bp-border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const sHeader = { ...sCell, fontWeight: 700, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.03em', background: 'var(--bp-navy)', color: 'var(--bp-ivory)', textAlign: 'center', padding: '3px 2px', position: 'sticky', top: 0, zIndex: 2 }
  const sPmGroup = { borderLeft: '2px solid var(--bp-navy)' }

  /* ── Pool Card ───────────────────────────────────────────────── */
  function PoolCard({ j }) {
    const isSelected = selectedJob?.cr55d_jobid === j.cr55d_jobid
    return (
      <div className={`pool-card${isSelected ? ' selected' : ''}`}
        draggable="true"
        onDragStart={e => e.dataTransfer.setData('jobId', j.cr55d_jobid)}
        onClick={() => setSelectedJob(isSelected ? null : j)}>
        <div className="pool-card-title">{j.cr55d_clientname || j.cr55d_jobname}</div>
        <div className="pool-card-dates">
          {shortDate(j.cr55d_installdate?.split('T')[0])} &rarr; {shortDate(j.cr55d_strikedate?.split('T')[0] || j.cr55d_eventdate?.split('T')[0])}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'3px',flexWrap:'wrap'}}>
          {j.cr55d_crewcount && <span className="pool-card-crew">{j.cr55d_crewcount} crew</span>}
          {j.cr55d_quotedamount && <span style={{fontSize:'10px',fontFamily:'var(--bp-mono)',color:'var(--bp-muted)'}}>{fmtCurrency(j.cr55d_quotedamount)}</span>}
        </div>
        {isSelected && (
          <div className="pool-card-detail">
            <div>Type: {j.cr55d_eventtype ? (EVENT_TYPES[j.cr55d_eventtype] || '—') : '—'}</div>
            <div>Sales: {j.cr55d_salesrep || '—'}</div>
            <div>Venue: {j.cr55d_venuename || '—'}</div>
            <div>Trucks: {j.cr55d_trucksneeded || '—'}</div>
          </div>
        )}
      </div>
    )
  }

  /* ── Bucket Section ──────────────────────────────────────────── */
  function BucketSection({ id, label, jobs: bucketJobs }) {
    if (bucketJobs.length === 0) return null
    const isCollapsed = collapsedBuckets.has(id)
    return (
      <div className="collapse-card">
        <div className="sec-bar-light" onClick={() => toggleBucket(id)}>
          <span>{label}</span>
          <span style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span className="sec-count">{bucketJobs.length}</span>
            <span className={`sec-chevron${isCollapsed ? ' collapsed' : ''}`}>&#x25BE;</span>
          </span>
        </div>
        {!isCollapsed && (
          <div className="collapse-body" style={{padding:'12px'}}>
            <div className="pm-bucket-cards">
              {bucketJobs.map(j => <PoolCard key={j.cr55d_jobid} j={j} />)}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Day name helper ───────────────────────────────────────── */
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  /* ── Total PM columns = PMS.length * 3 (workers, acctMgr, desc) */
  const pmColCount = PMS.length * 3

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <>
      <div className={`pm-split animate-in${panelCollapsed ? ' panel-collapsed' : ''}`}>
        {/* ── Left Panel: Unassigned Jobs ──────────────────────── */}
        <div className="pm-panel">
          <div className="pm-panel-toggle" onClick={() => setPanelCollapsed(true)} title="Collapse panel">&#8249;</div>

          <div style={{padding:'12px 14px 8px',borderBottom:'1px solid var(--bp-border-lt)'}}>
            <div className="pool-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bp-navy)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8m-4-4h8"/></svg>
              Unassigned
              {unassignedJobs.length > 0 && <span className="pool-count">{unassignedJobs.length}</span>}
            </div>
            {selectedJob && (
              <div style={{fontSize:'9.5px',color:'var(--bp-blue)',marginTop:'4px',fontWeight:600}}>
                Drag onto a PM column to assign &rarr;
              </div>
            )}
          </div>

          {unassignedJobs.length === 0 ? (
            <div className="pm-panel-empty">All jobs assigned &#10003;</div>
          ) : (
            <>
              <BucketSection id="thisWeek" label="This Week" jobs={buckets.thisWeek} />
              <BucketSection id="nextWeek" label="Next Week" jobs={buckets.nextWeek} />
              <BucketSection id="later" label="Later" jobs={buckets.later} />
            </>
          )}
        </div>

        {/* ── Right Panel: PM Capacity Grid ────────────────────── */}
        <div className="pm-right" style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
          {panelCollapsed && (
            <button className="pm-panel-right-toggle" onClick={() => setPanelCollapsed(false)} title="Show unassigned jobs">&#8250;</button>
          )}

          {/* Month navigation */}
          <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 12px',borderBottom:'1px solid var(--bp-border)',background:'var(--bp-white)',flexShrink:0}}>
            <button className="btn btn-ghost" onClick={goPrevMonth} style={{padding:'2px 8px',fontSize:'14px',fontWeight:700}}>&lsaquo;</button>
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--bp-navy)',minWidth:'160px',textAlign:'center'}}>{monthLabel}</span>
            <button className="btn btn-ghost" onClick={goNextMonth} style={{padding:'2px 8px',fontSize:'14px',fontWeight:700}}>&rsaquo;</button>
            <button className="btn btn-outline" onClick={goToday} style={{fontSize:'10px',padding:'2px 10px',marginLeft:'6px'}}>Today</button>
          </div>

          {/* Scrollable capacity grid */}
          <div style={{overflow:'auto',flex:1}}>
            <table style={{borderCollapse:'collapse',fontSize:'10px',fontFamily:'var(--bp-mono)',minWidth: (3 + pmColCount + 3) * 60 + 'px'}}>
              {/* ── Header Row 1: Group labels ─────────────────── */}
              <thead>
                <tr>
                  <th style={{...sHeader,minWidth:'62px',position:'sticky',left:0,zIndex:4}}>Date</th>
                  <th style={{...sHeader,minWidth:'34px',position:'sticky',left:'62px',zIndex:4}}>Day</th>
                  <th style={{...sHeader,minWidth:'18px',position:'sticky',left:'96px',zIndex:4}}></th>
                  {PMS.map((pm, pi) => (
                    <th key={pi} colSpan={3} style={{...sHeader,...sPmGroup,minWidth:'150px'}}>
                      {pm.split(' ')[0]}
                    </th>
                  ))}
                  <th style={{...sHeader,minWidth:'50px',background:'#152d56'}}>Needed</th>
                  <th style={{...sHeader,minWidth:'50px',background:'#152d56'}}>Avail</th>
                  <th style={{...sHeader,minWidth:'56px',background:'#152d56'}}>Cap %</th>
                </tr>
                {/* ── Header Row 2: Sub-columns ────────────────── */}
                <tr>
                  <th style={{...sHeader,position:'sticky',left:0,zIndex:4,fontSize:'8px'}}></th>
                  <th style={{...sHeader,position:'sticky',left:'62px',zIndex:4,fontSize:'8px'}}></th>
                  <th style={{...sHeader,position:'sticky',left:'96px',zIndex:4,fontSize:'8px'}}>Half</th>
                  {PMS.map((pm, pi) => (
                    <React.Fragment key={pi}>
                      <th style={{...sHeader,...sPmGroup,fontSize:'8px',minWidth:'30px'}}>#</th>
                      <th style={{...sHeader,fontSize:'8px',minWidth:'28px'}}>AM</th>
                      <th style={{...sHeader,fontSize:'8px',minWidth:'90px'}}>Job</th>
                    </React.Fragment>
                  ))}
                  <th style={{...sHeader,fontSize:'8px',background:'#152d56'}}></th>
                  <th style={{...sHeader,fontSize:'8px',background:'#152d56'}}></th>
                  <th style={{...sHeader,fontSize:'8px',background:'#152d56'}}></th>
                </tr>
              </thead>
              <tbody>
                {monthDays.map((date, di) => {
                  const dateStr = toLocalISO(date)
                  const dow = date.getDay()
                  const dayName = DAY_NAMES[dow]
                  const isToday = date.toDateString() === new Date().toDateString()
                  const isWeekend = dow === 0 || dow === 6
                  const daySlots = slotData[dateStr] || { am: {}, pm: {} }
                  const cap = capacityData[dateStr] || {}
                  const available = getWorkersAvailable(dateStr)
                  const isSunday = dow === 0
                  const weekSummary = isSunday || di === monthDays.length - 1
                    ? weekSummaries.find(ws => ws.afterDate === dateStr)
                    : null

                  const rowBg = isToday ? 'rgba(37,99,235,.04)' : isWeekend ? 'rgba(29,58,107,.02)' : 'transparent'
                  const stickyDate = { ...sCell, position:'sticky', left:0, zIndex:1, background: isToday ? '#e8f0fe' : isWeekend ? '#f8f8f6' : 'var(--bp-white)', fontWeight: 600, minWidth:'62px' }
                  const stickyDay = { ...sCell, position:'sticky', left:'62px', zIndex:1, background: isToday ? '#e8f0fe' : isWeekend ? '#f8f8f6' : 'var(--bp-white)', textAlign:'center', minWidth:'34px' }
                  const stickyHalf = { ...sCell, position:'sticky', left:'96px', zIndex:1, background: isToday ? '#e8f0fe' : isWeekend ? '#f8f8f6' : 'var(--bp-white)', textAlign:'center', fontWeight:600, fontSize:'9px', minWidth:'18px' }

                  const halves = ['am', 'pm']

                  return halves.map((half, hi) => {
                    const halfNeeded = cap[half]?.needed || 0
                    const halfPct = available > 0 ? Math.round((halfNeeded / available) * 100) : 0
                    const capColor = getCapacityColor(halfPct)
                    const capBg = getCapacityBg(halfPct)

                    return (
                      <React.Fragment key={dateStr + half}>
                        <tr style={{background: rowBg}}>
                          {/* Date - only on AM row */}
                          {hi === 0 ? (
                            <td rowSpan={2} style={{...stickyDate, verticalAlign:'middle'}}>
                              {formatDateShort(date)}
                            </td>
                          ) : null}
                          {/* Day name - only on AM row */}
                          {hi === 0 ? (
                            <td rowSpan={2} style={{...stickyDay, verticalAlign:'middle', fontWeight: isWeekend ? 700 : 400, color: isWeekend ? 'var(--bp-amber)' : 'var(--bp-text)'}}>
                              {dayName}
                            </td>
                          ) : null}
                          {/* AM/PM label */}
                          <td style={{...stickyHalf, color: half === 'am' ? 'var(--bp-navy)' : 'var(--bp-muted)'}}>
                            {half.toUpperCase()}
                          </td>
                          {/* PM columns */}
                          {PMS.map((pm, pi) => {
                            const slot = daySlots[half]?.[pm]
                            const hasData = slot && (slot.workers || slot.desc)
                            const cellBg = hasData ? (slot.auto ? 'rgba(46,125,82,.06)' : 'rgba(37,99,235,.05)') : 'transparent'
                            return (
                              <React.Fragment key={pi}>
                                <td style={{...sCell,...sPmGroup, textAlign:'center', fontFamily:'var(--bp-mono)', fontWeight:600, background: cellBg, color: slot?.workers ? 'var(--bp-navy)' : 'var(--bp-muted)', cursor:'pointer'}}
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={e => handleDrop(e, pm, dateStr, half)}
                                  onClick={() => {
                                    if (selectedJob) {
                                      handleOneClickAssign(selectedJob, pm)
                                    }
                                  }}
                                  title={`${pm.split(' ')[0]} - Workers`}>
                                  {slot?.workers || ''}
                                </td>
                                <td style={{...sCell, textAlign:'center', fontSize:'9px', fontWeight:600, background: cellBg, color:'var(--bp-muted)'}}
                                  title={`${pm.split(' ')[0]} - Acct Mgr`}>
                                  {slot?.acctMgr || ''}
                                </td>
                                <td style={{...sCell, fontSize:'9.5px', maxWidth:'110px', overflow:'hidden', textOverflow:'ellipsis', background: cellBg, cursor: hasData ? 'pointer' : 'default'}}
                                  onClick={e => {
                                    if (slot?.jobId && onSelectJob) {
                                      const job = jobs.find(j => j.cr55d_jobid === slot.jobId)
                                      if (job) { e.stopPropagation(); onSelectJob(job) }
                                    }
                                  }}
                                  title={slot?.desc || `${pm.split(' ')[0]} - Job`}>
                                  {slot?.desc || ''}
                                </td>
                              </React.Fragment>
                            )
                          })}
                          {/* Workers Needed */}
                          <td style={{...sCell, textAlign:'center', fontWeight:700, fontFamily:'var(--bp-mono)', color: halfNeeded > 0 ? 'var(--bp-navy)' : 'var(--bp-muted)'}}>
                            {halfNeeded || ''}
                          </td>
                          {/* Workers Available - editable, only on AM row */}
                          {hi === 0 ? (
                            <td rowSpan={2} style={{...sCell, textAlign:'center', fontFamily:'var(--bp-mono)', verticalAlign:'middle', cursor:'pointer', background:'rgba(29,58,107,.03)'}}
                              onClick={() => {
                                const val = prompt(`Workers available for ${formatDateShort(date)}:`, available)
                                if (val !== null && !isNaN(Number(val))) {
                                  setWorkersAvailableOverrides(prev => ({...prev, [dateStr]: Number(val)}))
                                }
                              }}
                              title="Click to edit">
                              {available}
                            </td>
                          ) : null}
                          {/* Daily Capacity % */}
                          <td style={{...sCell, textAlign:'center', fontWeight:700, fontFamily:'var(--bp-mono)', background: halfNeeded > 0 ? capBg : 'transparent', color: halfNeeded > 0 ? capColor : 'var(--bp-muted)'}}>
                            {halfNeeded > 0 ? halfPct + '%' : ''}
                          </td>
                        </tr>
                        {/* Week Summary Row - after Sunday PM or last day PM */}
                        {half === 'pm' && weekSummary && (
                          <tr style={{background:'rgba(29,58,107,.06)',borderTop:'2px solid var(--bp-navy)',borderBottom:'2px solid var(--bp-navy)'}}>
                            <td colSpan={3} style={{...sCell, position:'sticky', left:0, zIndex:1, fontWeight:700, fontSize:'9px', textTransform:'uppercase', letterSpacing:'.04em', color:'var(--bp-navy)', background:'rgba(29,58,107,.06)', padding:'3px 6px'}}>
                              Week Summary
                            </td>
                            <td colSpan={pmColCount} style={{...sCell, textAlign:'center', fontWeight:600, fontSize:'9.5px', color:'var(--bp-navy)', background:'rgba(29,58,107,.06)'}}>
                              {weekSummary.needed} total worker-shifts needed
                            </td>
                            <td style={{...sCell, textAlign:'center', fontWeight:700, fontFamily:'var(--bp-mono)', background:'rgba(29,58,107,.06)', color:'var(--bp-navy)'}}>
                              {weekSummary.needed}
                            </td>
                            <td style={{...sCell, textAlign:'center', fontFamily:'var(--bp-mono)', background:'rgba(29,58,107,.06)', color:'var(--bp-navy)'}}>
                              {weekSummary.available}
                            </td>
                            <td style={{...sCell, textAlign:'center', fontWeight:700, fontFamily:'var(--bp-mono)', background: getCapacityBg(weekSummary.pct), color: getCapacityColor(weekSummary.pct)}}>
                              {weekSummary.pct}%
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Undo Toast */}
      {toast && (
        <div className={`toast show ${toast.type || 'success'}`}>
          <span>{toast.message}</span>
          {toast.undoFn && <button className="btn-undo" onClick={handleUndo}>Undo</button>}
        </div>
      )}
    </>
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
    id: crypto.randomUUID(),
    name,
    license: licenses[i % licenses.length],
    isLead: i < 6,
    defaultDept: depts[i % depts.length],
    schedule: Array.from({length: 7}, () => Math.random() > 0.35),
    daysThisWeek: Math.floor(Math.random() * 3 + 3),
  }))
}
