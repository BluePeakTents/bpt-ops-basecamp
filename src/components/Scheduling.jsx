import { useState, useEffect, useMemo, useRef } from 'react'
import { dvFetch, dvPatch, dvPost } from '../hooks/useDataverse'
import { generateLeaderSheet } from '../utils/generateLeaderSheet'
import { generateDriverSheets, generateProductionSchedulePDF } from '../utils/generateDriverSheet'
import { parseCalendarFile, parseWeeklySchedule } from '../utils/calendarImport'
import { EMPLOYEES, EMPLOYEE_CATEGORIES, TRUCK_TYPES, LEADERS, LEADER_COLORS, canDrive, validateCrewCDL } from '../data/crewConstants'
import ManageEmployees from './ManageEmployees'
import { toLocalISO, getWeekDates as safeGetWeekDates, isoDate } from '../utils/dateUtils'
import { JOB_FIELDS, ACTIVE_JOBS_FILTER } from '../constants/dataverseFields'

/* ── Constants ─────────────────────────────────────────────────── */
const PMS = [
  'Cristhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']


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
// toLocalISO and getWeekDates imported from ../utils/dateUtils (as safeGetWeekDates)
// Local alias to avoid renaming all call sites
const getWeekDates = safeGetWeekDates

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
  if (isNaN(dt.getTime()) || dt.getFullYear() < 2024) return ''
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const yr = dt.getFullYear()
  const suffix = yr !== new Date().getFullYear() ? ` '${String(yr).slice(-2)}` : ''
  return `${m[dt.getMonth()]} ${dt.getDate()}${suffix}`
}

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

function getStaffInitials(name) {
  if (!name) return '?'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return (parts[1][0] || '') + (parts[0][0] || '')
  return name.split(' ').map(n => n[0]).join('').substring(0, 2)
}

function getStaffDisplayName(name) {
  if (!name) return '\u2014'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

/* ── Main Component ────────────────────────────────────────────── */
export default function Scheduling({ onSelectJob }) {
  const [subTab, setSubTab] = useState('pm')
  const [weekDate, setWeekDate] = useState(new Date())
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [assigning, setAssigning] = useState(false)
  const [staff, setStaff] = useState([])
  const [departments, setDepartments] = useState([])
  const [showManageModal, setShowManageModal] = useState(false)
  const [calendarImports, setCalendarImports] = useState([])

  const weekDates = getWeekDates(weekDate)

  const initialLoadRef = useRef(true)
  const failCountRef = useRef(0)

  useEffect(() => {
    loadJobs()
    loadStaff()
    loadDepartments()
    let pollTimer = null
    function schedulePoll() {
      const delay = failCountRef.current > 0 ? Math.min(30000 * Math.pow(2, failCountRef.current), 300000) : 30000
      pollTimer = setTimeout(() => { if (!document.hidden) loadJobs().finally(schedulePoll); else schedulePoll() }, delay)
    }
    schedulePoll()
    const onVisible = () => { if (!document.hidden && !initialLoadRef.current) loadJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(pollTimer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  async function loadJobs() {
    if (initialLoadRef.current) setLoading(true)
    try {
      const data = await dvFetch(`cr55d_jobs?$select=${JOB_FIELDS}&$filter=${ACTIVE_JOBS_FILTER}&$orderby=cr55d_installdate asc&$top=200`)
      setJobs(data || [])
      setError(null)
      failCountRef.current = 0
    } catch (e) { console.error('[Scheduling] Load failed:', e); setError(e.message); failCountRef.current = Math.min(failCountRef.current + 1, 5) }
    finally { setLoading(false); initialLoadRef.current = false }
  }

  async function loadStaff() {
    try {
      const data = await dvFetch(`cr55d_stafflists?$select=cr55d_stafflistid,cr55d_name,cr55d_department,cr55d_licensetype,cr55d_islead,cr55d_isoperational,cr55d_status,cr55d_employeeid,cr55d_email,cr55d_phone&$filter=cr55d_status eq 306280000&$orderby=cr55d_name asc&$top=500`)
      setStaff(data || [])
    } catch (e) { console.error('[Scheduling] Staff load failed:', e) }
  }

  async function loadDepartments() {
    try {
      const data = await dvFetch(`cr55d_opsdepartments?$select=cr55d_opsdepartmentid,cr55d_departmentname,cr55d_budgetgroup,cr55d_isoperational&$orderby=cr55d_departmentname asc`)
      setDepartments(data || [])
    } catch (e) { console.error('[Scheduling] Dept load failed:', e) }
  }

  // Derive PM list from Dataverse staff (leaders) with fallback to hardcoded
  const activePMs = useMemo(() => {
    if (staff.length > 0) {
      const leaders = staff.filter(s => s.cr55d_islead).map(s => s.cr55d_name).filter(Boolean)
      if (leaders.length > 0) return leaders
    }
    return PMS
  }, [staff])

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
    const install = isoDate(job.cr55d_installdate)
    const strike = isoDate(job.cr55d_strikedate) || install
    return d >= install && d <= strike
  }

  async function handleAssignPM(jobId, pmName) {
    if (assigning) return
    setAssigning(true)
    // Optimistic update
    const prevJobs = jobs
    setJobs(prev => prev.map(j => j.cr55d_jobid === jobId ? { ...j, cr55d_pmassigned: pmName } : j))
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      await dvPatch(`cr55d_jobs(${safeId})`, { cr55d_pmassigned: pmName })
      // Notify Sales Hub of PM assignment change
      const job = jobs.find(j => j.cr55d_jobid === jobId)
      const jobName = job?.cr55d_clientname || job?.cr55d_jobname || 'Job'
      dvPost('cr55d_notifications', {
        cr55d_name: `PM Assigned: ${jobName}`,
        cr55d_description: `${pmName} assigned as PM for ${jobName}.${job?.cr55d_installdate ? ' Install: ' + job.cr55d_installdate.split('T')[0] : ''}`,
        cr55d_notificationtype: 'pm_calendar',
        cr55d_author: 'Ops Base Camp',
        'cr55d_jobid@odata.bind': job ? `/cr55d_jobs(${safeId})` : undefined,
        cr55d_installdate: job?.cr55d_installdate || null,
      }).catch(e => console.warn('[Scheduling] Notification write failed:', e.message))
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
    { id: 'pm', label: 'PM Capacity', icon: '📊' },
    { id: 'crew', label: 'Crew Schedule', icon: '👥' },
    { id: 'truck', label: 'Truck Schedule', icon: '🚚' },
    { id: 'validation', label: 'Validation', icon: '✅' },
    { id: 'leader', label: 'Leader Sheet', icon: '📋' },
    { id: 'eventtech', label: 'Event Techs', icon: '🎤' },
    { id: 'travel', label: 'Travel', icon: '✈️' },
  ]

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Scheduling</h1><div className="sub">Crew, trucks, PMs, event techs</div><div className="page-head-accent"></div></div>
        <div className="flex gap-6">
          <button className="cal-nav-btn" aria-label="Previous week" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })}>‹</button>
          <span className="text-lg font-semibold color-navy" style={{minWidth:'180px',textAlign:'center'}}>{formatWeekRange(weekDates)}</span>
          <button className="cal-nav-btn" aria-label="Next week" onClick={() => setWeekDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekDate(new Date())}>This Week</button>
          <div className="divider-v"></div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowManageModal(true)}>👥 Manage Employees</button>
          <label className="btn btn-outline btn-sm" style={{cursor:'pointer'}}>
            📥 Import Calendar
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const imported = await parseCalendarFile(file, new Date().toLocaleString('en-US', {month:'long'}))
                if (imported && imported.length > 0) {
                  setCalendarImports(imported)
                  console.log(`[Calendar Import] ${imported.length} entries imported and stored`)
                } else {
                  setError('No entries found in imported file')
                }
              } catch (err) {
                setError('Import error: ' + err.message)
              }
              e.target.value = ''
            }} />
          </label>
        </div>
      </div>

      <div className="flex gap-6 mb-16">
        {tabs.map(t => (
          <button key={t.id} className={`pill${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>
            <span className="text-base">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">⚠️</span>
          <div>
            {error}
            <button className="btn btn-ghost btn-xs ml-8" onClick={() => { setError(null); loadJobs() }}>Retry</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading schedule data...</div></div>
      ) : (
        <>
          {/* ── Crew Schedule ───────────────────────────────────────── */}
          {subTab === 'crew' && <CrewSchedule weekDates={weekDates} staff={staff} departments={departments} onRefreshStaff={loadStaff} />}

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
              pmList={activePMs}
            />
          )}

          {/* ── Event Techs ────────────────────────────────────────── */}
          {subTab === 'eventtech' && <EventTechSchedule staff={staff} jobs={jobs} weekDates={weekDates} onSelectJob={onSelectJob} />}

          {/* ── Validation ──────────────────────────────────────────── */}
          {subTab === 'validation' && <ValidationGrid weekDates={weekDates} jobs={jobs} staff={staff} />}

          {/* ── Leader Sheet ───────────────────────────────────────── */}
          {subTab === 'leader' && <LeaderSheet jobs={jobs} staff={staff} weekDates={weekDates} onSelectJob={onSelectJob} />}

          {/* ── Travel ─────────────────────────────────────────────── */}
          {subTab === 'travel' && <TravelTracker jobs={jobs} staff={staff} />}
        </>
      )}
      <ManageEmployees open={showManageModal} onClose={() => setShowManageModal(false)} onRefresh={loadStaff} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CREW SCHEDULE
   ═══════════════════════════════════════════════════════════════════ */
function CrewSchedule({ weekDates, staff, departments, onRefreshStaff }) {
  const DEPT_LABELS = { 306280000: 'Executive', 306280001: 'Ops Mgmt', 306280002: 'Sales', 306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member', 306280006: 'Warehouse', 306280007: 'Admin', 306280008: 'Marketing', 306280009: 'Finance', 306280010: 'Crew Leader' }
  const OPS_DEPTS = new Set([306280001, 306280003, 306280004, 306280005, 306280006, 306280010])
  const DEPT_COLORS = { 306280001: '#1D3A6B', 306280003: '#8B5CF6', 306280004: '#D97706', 306280005: '#2B4F8A', 306280006: '#6B7280', 306280010: '#2E7D52' }

  const deptList = useMemo(() => {
    const deptSet = new Set(staff.map(s => s.cr55d_department).filter(Boolean))
    return Array.from(deptSet).filter(d => OPS_DEPTS.has(d)).sort((a, b) => (DEPT_LABELS[a] || '').localeCompare(DEPT_LABELS[b] || ''))
  }, [staff])

  const [activeDepts, setActiveDepts] = useState([])
  const [schedules, setSchedules] = useState(() => {
    try {
      const saved = localStorage.getItem('bpt_schedule_draft')
      if (saved) { const parsed = JSON.parse(saved); if (parsed.schedules) return parsed.schedules }
    } catch {}
    return {}
  })
  const [toast, setToast] = useState(null)
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    if (deptList.length > 0 && activeDepts.length === 0) setActiveDepts(deptList)
  }, [deptList])

  // Local schedule state keyed by stafflistid
  function getSchedule(id) { return schedules[id] || Array(7).fill(false) }
  function toggleDay(id, di) {
    setSchedules(prev => {
      const cur = prev[id] || Array(7).fill(false)
      return { ...prev, [id]: cur.map((v, i) => i === di ? !v : v) }
    })
  }

  const todayIndex = useMemo(() => {
    const today = new Date()
    return weekDates.findIndex(d => d.toDateString() === today.toDateString())
  }, [weekDates])

  const activeStaff = useMemo(() => staff.filter(s => activeDepts.includes(s.cr55d_department)), [staff, activeDepts])

  const stats = useMemo(() => {
    const scheduledToday = todayIndex >= 0 ? activeStaff.filter(s => getSchedule(s.cr55d_stafflistid)[todayIndex]).length : 0
    const totalDays = activeStaff.reduce((s, e) => s + getSchedule(e.cr55d_stafflistid).filter(Boolean).length, 0)
    const avgDays = activeStaff.length ? (totalDays / activeStaff.length).toFixed(1) : 0
    const overloaded = activeStaff.filter(e => getSchedule(e.cr55d_stafflistid).filter(Boolean).length >= 6).length
    return { total: activeStaff.length, scheduledToday, avgDays, overloaded }
  }, [activeStaff, schedules, todayIndex])

  function toggleDept(code) {
    setActiveDepts(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const GRID_COLS = '240px 50px 44px repeat(7,1fr)'

  if (staff.length === 0) {
    return <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading crew roster...</div></div>
  }

  return (
    <div>
      {/* Department toggles */}
      <div className="card mb-12" style={{padding:'12px 16px'}}>
        <div className="flex-between mb-8">
          <span className="text-md font-bold color-muted text-upper">Departments ({activeStaff.length} crew)</span>
          <div className="flex gap-4">
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts(deptList)}>All</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts([])}>None</button>
          </div>
        </div>
        <div className="flex gap-6 flex-wrap">
          {deptList.map(deptVal => {
            const count = staff.filter(s => s.cr55d_department === deptVal).length
            const color = DEPT_COLORS[deptVal] || '#6B7280'
            const isActive = activeDepts.includes(deptVal)
            return (
              <button key={deptVal} className={`pill${isActive ? ' active' : ''}`}
                style={{padding:'5px 14px',borderColor: isActive ? color : undefined, background: isActive ? color : undefined}}
                onClick={() => toggleDept(deptVal)}>
                <span className="dept-pill-dot" style={{background: isActive ? '#fff' : color}}></span>
                {DEPT_LABELS[deptVal] || 'Unknown'} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Headcount</div><div className="kpi-val">{stats.total}</div><div className="kpi-sub">in {activeDepts.length} depts</div></div>
        <div className="kpi"><div className="kpi-label">Scheduled Today</div><div className="kpi-val color-green">{stats.scheduledToday}</div><div className="kpi-sub">of {stats.total} active</div></div>
        <div className="kpi"><div className="kpi-label">Avg Days / Person</div><div className="kpi-val">{stats.avgDays}</div><div className="kpi-sub">this week</div></div>
        <div className="kpi"><div className="kpi-label">Overloaded</div><div className="kpi-val" style={{color: stats.overloaded > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{stats.overloaded}</div><div className="kpi-sub">6+ days scheduled</div></div>
      </div>

      {/* Schedule grid */}
      <div className="card card-flush">
        <div className="crew-grid">
          <div className="crew-header-row" style={{gridTemplateColumns:GRID_COLS}}>
            <div className="crew-header-cell" style={{textAlign:'left'}}>Employee</div>
            <div className="crew-header-cell">License</div>
            <div className="crew-header-cell">Days</div>
            {weekDates.map((d, i) => (
              <div key={i} className={`crew-header-cell${i === todayIndex ? ' today' : ''}`}>
                {DAYS_SHORT[i]}<br/><span className="text-2xs" style={{opacity:.7}}>{formatDateShort(d)}</span>
              </div>
            ))}
          </div>

          {activeDepts.map(deptVal => {
            const deptStaff = staff.filter(s => s.cr55d_department === deptVal)
            const color = DEPT_COLORS[deptVal] || '#6B7280'
            const deptAvg = deptStaff.length ? (deptStaff.reduce((s, e) => s + getSchedule(e.cr55d_stafflistid).filter(Boolean).length, 0) / deptStaff.length).toFixed(1) : 0
            return (
              <div key={deptVal}>
                <div className="text-sm font-bold" style={{gridColumn:'1/-1',background:color,color:'var(--bp-white)',padding:'6px 14px',letterSpacing:'.04em',textTransform:'uppercase',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>{DEPT_LABELS[deptVal] || 'Unknown'} ({deptStaff.length} crew)</span>
                  <span className="text-2xs font-medium" style={{opacity:.8,textTransform:'none'}}>avg {deptAvg} days</span>
                </div>
                {deptStaff.map(emp => {
                  const sched = getSchedule(emp.cr55d_stafflistid)
                  const dayCount = sched.filter(Boolean).length
                  const dayColor = dayCount >= 7 ? 'red' : dayCount >= 6 ? 'amber' : dayCount <= 2 ? 'light' : 'green'
                  return (
                    <div key={emp.cr55d_stafflistid} className="crew-row" style={{gridTemplateColumns:GRID_COLS}}>
                      <div className="crew-name-cell">
                        <span className="text-2xs font-bold color-navy" style={{width:'26px',height:'26px',borderRadius:'6px',background:'var(--bp-navy-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {getStaffInitials(emp.cr55d_name)}
                        </span>
                        <div style={{minWidth:0}}>
                          <div className="text-base font-semibold" style={{display:'flex',alignItems:'center',gap:'5px'}}>
                            {getStaffDisplayName(emp.cr55d_name)}
                            {emp.cr55d_islead && <span className="font-bold" style={{fontSize:'10px',color:'var(--bp-white)',background:'var(--bp-green)',padding:'1px 4px',borderRadius:'3px',textTransform:'uppercase'}}>Lead</span>}
                          </div>
                          <div style={{display:'flex',gap:'4px',marginTop:'1px'}}>
                            {emp.cr55d_employeeid && <span className="color-muted font-mono" style={{fontSize:'10px'}}>#{emp.cr55d_employeeid}</span>}
                          </div>
                        </div>
                        {dayCount >= 6 && <span className="crew-warning ml-auto">&#9888; {dayCount}d</span>}
                      </div>
                      <div className="crew-day-cell">
                        <span className="crew-license">{emp.cr55d_licensetype || '\u2014'}</span>
                      </div>
                      <div className={`crew-days-cell ${dayColor}`}>
                        {dayCount}/7
                      </div>
                      {sched.map((assigned, di) => (
                        <div key={di} className={`crew-day-cell${di === todayIndex ? ' today' : ''}`}>
                          <div className={`crew-toggle${assigned ? ' active' : ''}`}
                            onClick={() => toggleDay(emp.cr55d_stafflistid, di)}>
                            {assigned && '\u2713'}
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

      {/* Footer */}
      <div className="flex-between mt-12">
        <div className="text-md color-muted">
          {activeStaff.length} employees across {activeDepts.length} departments
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" disabled={savingSchedule} onClick={() => {
            setSavingSchedule(true)
            const weekKey = toLocalISO(weekDates[0])
            localStorage.setItem('bpt_schedule_draft', JSON.stringify({ saved: new Date().toISOString(), weekKey, schedules }))
            setTimeout(() => setSavingSchedule(false), 2000)
          }}>{savingSchedule ? '✓ Saved' : 'Save Schedule'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            const rows = [['Employee','Department','License','Mon','Tue','Wed','Thu','Fri','Sat','Sun','Days']]
            activeStaff.forEach(emp => {
              const sched = getSchedule(emp.cr55d_stafflistid)
              const dayCount = sched.filter(Boolean).length
              const deptLabel = DEPT_LABELS[emp.cr55d_department] || ''
              rows.push([
                getStaffDisplayName(emp.cr55d_name), deptLabel, emp.cr55d_licensetype || '',
                ...sched.map(v => v ? 'Y' : ''), String(dayCount)
              ])
            })
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
            const link = document.createElement('a'); const blob = new Blob([csv], {type:'text/csv'})
            link.href = URL.createObjectURL(blob); link.download = `crew_schedule_${toLocalISO(weekDates[0])}.csv`; link.click(); URL.revokeObjectURL(link.href)
          }}>Export CSV</button>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="toast show success"><span>{toast}</span></div>}

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
      <div className="kpi-row-6">
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
      <div className="card card-flush">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'180px'}}>Vehicle Type</th>
              <th style={{width:'60px'}}>Fleet</th>
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString()
                return <th key={i} style={{textAlign:'center', background: isToday ? 'rgba(37,99,235,.06)' : ''}}>{DAYS_SHORT[i]}<br/><span style={{fontSize:'10px'}}>{formatDateShort(d)}</span></th>
              })}
            </tr>
          </thead>
          <tbody>
            {VEHICLE_TYPES.map((v, i) => {
              const dailyNeeds = weekDates.map((date, di) => {
                // Count jobs active on this day as a proxy for vehicle demand
                const dateStr = toLocalISO(date)
                const activeJobs = jobs.filter(j => {
                  const install = isoDate(j.cr55d_installdate)
                  const strike = isoDate(j.cr55d_strikedate) || install
                  return install && dateStr >= install && dateStr <= strike
                }).length
                // Scale demand by vehicle type (rough heuristic until real data)
                const scale = v.type.includes('Box') ? 0.8 : v.type.includes('Pickup') ? 0.5 : v.type.includes('Ox') ? 0.3 : 0.2
                return Math.min(Math.round(activeJobs * scale), v.count + 2)
              })
              return (
                <tr key={i}>
                  <td className="font-semibold"><span style={{marginRight:'6px'}}>{v.icon}</span>{v.type}</td>
                  <td className="mono font-bold text-center">{v.count}</td>
                  {dailyNeeds.map((need, di) => {
                    const overCapacity = need > v.count
                    return (
                      <td key={di} style={{textAlign:'center'}}>
                        <span className="text-base font-bold font-mono" style={{
                          display:'inline-flex',alignItems:'center',justifyContent:'center',
                          width:'28px',height:'28px',borderRadius:'6px',
                          background: overCapacity ? 'var(--bp-red-bg)' : need >= v.count ? 'var(--bp-amber-bg)' : need > 0 ? 'var(--bp-green-bg)' : 'var(--bp-alt)',
                          color: overCapacity ? 'var(--bp-red)' : need >= v.count ? '#92400e' : need > 0 ? 'var(--bp-green)' : 'var(--bp-light)',
                        }}>
                          {need}
                        </span>
                        {overCapacity && <div className="font-bold color-red" style={{fontSize:'10px',marginTop:'2px'}}>+{need - v.count} over</div>}
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
function PMCapacity({ weekDates, jobs, unassignedJobs, assignedJobs, getJobsForPM, jobOverlapsWeek, jobOnDate, handleAssignPM, onSelectJob, assigning, pmList }) {
  // Use Dataverse-derived PM list, fall back to hardcoded PMS
  const PMS_ACTIVE = pmList && pmList.length > 0 ? pmList : PMS
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [selectedJob, setSelectedJob] = useState(null)
  const [toast, setToast] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [viewMode, setViewMode] = useState('month') // 'week' or 'month'
  const [currentWeekIdx, setCurrentWeekIdx] = useState(null) // null = auto-detect
  const [workersAvailableOverrides, setWorkersAvailableOverrides] = useState({})
  const [cellEdits, setCellEdits] = useState({})
  const [hoveredChip, setHoveredChip] = useState(null)
  const [dragOverCell, setDragOverCell] = useState(null)
  const [jumpToDate, setJumpToDate] = useState(null) // pending date to scroll to after month change

  /* ── Account Manager initials map ──────────────────────────── */
  const AM_INITIALS = { 'David Cesar': 'DC', 'Glen Hansen': 'GH', 'Kyle Turriff': 'KT', 'Desiree Pearson': 'DP', 'Larrisa Henington': 'LH' }

  function salesRepToInitials(rep) {
    if (!rep) return ''
    if (AM_INITIALS[rep]) return AM_INITIALS[rep]
    const entry = Object.entries(AM_INITIALS).find(([name]) => rep.toLowerCase().includes(name.split(' ')[1].toLowerCase()))
    if (entry) return entry[1]
    return rep.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)
  }

  /* ── Month label ───────────────────────────────────────────── */
  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  /* ── Generate weeks that overlap the selected month ────────── */
  const weeksInMonth = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Find the Monday on or before the 1st
    const startDow = firstDay.getDay()
    const mondayOffset = startDow === 0 ? -6 : 1 - startDow
    const firstMonday = new Date(year, month, 1 + mondayOffset)

    const weeks = []
    let cursor = new Date(firstMonday)
    while (cursor <= lastDay) {
      const weekDays = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor)
        d.setDate(cursor.getDate() + i)
        weekDays.push(d)
      }
      weeks.push(weekDays)
      cursor.setDate(cursor.getDate() + 7)
    }
    return weeks
  }, [currentMonth])

  /* ── Rolling 5-week view for month mode (current week + next 4) */
  const monthViewWeeks = useMemo(() => {
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset)
    const weeks = []
    for (let w = 0; w < 5; w++) {
      const weekDays = []
      for (let d = 0; d < 7; d++) {
        const dt = new Date(thisMonday)
        dt.setDate(thisMonday.getDate() + w * 7 + d)
        weekDays.push(dt)
      }
      weeks.push(weekDays)
    }
    return weeks
  }, [])

  /* ── All days across all weeks (flat) ──────────────────────── */
  const allDays = useMemo(() => {
    const calDays = weeksInMonth.flat()
    if (viewMode === 'month') {
      // Merge rolling month-view days so capacity data covers them
      const calSet = new Set(calDays.map(d => toLocalISO(d)))
      const merged = [...calDays]
      monthViewWeeks.flat().forEach(d => {
        if (!calSet.has(toLocalISO(d))) merged.push(d)
      })
      return merged
    }
    return calDays
  }, [weeksInMonth, monthViewWeeks, viewMode])

  /* ── Auto-detect current week index within this month ──────── */
  const activeWeekIdx = useMemo(() => {
    if (currentWeekIdx !== null && currentWeekIdx < weeksInMonth.length) return currentWeekIdx
    const todayStr = toLocalISO(new Date())
    const idx = weeksInMonth.findIndex(week => {
      const start = toLocalISO(week[0])
      const end = toLocalISO(week[6])
      return todayStr >= start && todayStr <= end
    })
    return idx >= 0 ? idx : 0
  }, [currentWeekIdx, weeksInMonth])

  // When a jumpToDate is pending, find the correct week index after month/weeks recalculate
  useEffect(() => {
    if (!jumpToDate) return
    const dateStr = toLocalISO(jumpToDate)
    const wIdx = weeksInMonth.findIndex(week => dateStr >= toLocalISO(week[0]) && dateStr <= toLocalISO(week[6]))
    setCurrentWeekIdx(wIdx >= 0 ? wIdx : 0)
    setJumpToDate(null)
  }, [jumpToDate, weeksInMonth])

  // Reset week index when month changes (unless a jump is pending)
  useEffect(() => { if (!jumpToDate) setCurrentWeekIdx(null) }, [currentMonth])

  function goWeek(delta) {
    const next = activeWeekIdx + delta
    if (next < 0) {
      // Go to previous month, last week
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
      setCurrentWeekIdx(999) // will clamp in next render
    } else if (next >= weeksInMonth.length) {
      // Go to next month, first week
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
      setCurrentWeekIdx(0)
    } else {
      setCurrentWeekIdx(next)
    }
  }

  // Clamp week index if it overflows (e.g. going to prev month last week)
  useEffect(() => {
    if (currentWeekIdx !== null && currentWeekIdx >= weeksInMonth.length) {
      setCurrentWeekIdx(weeksInMonth.length - 1)
    }
  }, [weeksInMonth, currentWeekIdx])

  /* ── Default workers available by day of week ──────────────── */
  function getDefaultWorkersAvailable(date) {
    const dow = date.getDay()
    if (dow === 0) return 32
    if (dow === 6) return 34
    return 40
  }

  function getWorkersAvailable(dateStr) {
    if (workersAvailableOverrides[dateStr] !== undefined) return workersAvailableOverrides[dateStr]
    const date = new Date(dateStr + 'T12:00:00')
    return getDefaultWorkersAvailable(date)
  }

  /* ── Build slot data: for each day+half, each PM's assignment ─ */
  const slotData = useMemo(() => {
    const assigned = jobs.filter(j => !!j.cr55d_pmassigned)
    const data = {}
    allDays.forEach(date => {
      const dateStr = toLocalISO(date)
      data[dateStr] = { am: {}, pm: {} }
      PMS_ACTIVE.forEach(pmName => {
        const pmJobs = assigned.filter(j => j.cr55d_pmassigned === pmName)
        pmJobs.forEach(j => {
          if (!j.cr55d_installdate) return
          const install = isoDate(j.cr55d_installdate)
          const strike = isoDate(j.cr55d_strikedate) || install
          if (dateStr >= install && dateStr <= strike) {
            const isStrikeDay = dateStr === strike && dateStr !== install
            const slotInfo = {
              workers: j.cr55d_crewcount || 0,
              acctMgr: salesRepToInitials(j.cr55d_salesrep),
              desc: (j.cr55d_clientname || j.cr55d_jobname || '').trim(),
              jobId: j.cr55d_jobid,
              auto: true,
              isStrike: isStrikeDay,
              isInstall: !isStrikeDay
            }
            // Fill AM first, then PM for second job on same day
            if (!data[dateStr].am[pmName]) {
              data[dateStr].am[pmName] = slotInfo
            } else if (!data[dateStr].pm[pmName]) {
              data[dateStr].pm[pmName] = slotInfo
            }
          }
        })
      })
    })
    // Apply manual cell edits
    Object.entries(cellEdits).forEach(([key, val]) => {
      const [dateStr, half, pmName] = key.split('|')
      if (data[dateStr] && data[dateStr][half]) {
        data[dateStr][half][pmName] = { ...val, auto: false }
      }
    })
    return data
  }, [allDays, jobs, PMS_ACTIVE, cellEdits])

  /* ── Capacity calculations per day ─────────────────────────── */
  const capacityData = useMemo(() => {
    const result = {}
    allDays.forEach(date => {
      const dateStr = toLocalISO(date)
      const daySlots = slotData[dateStr]
      if (!daySlots) return
      const available = getWorkersAvailable(dateStr)
      let totalNeeded = 0

      ;['am', 'pm'].forEach(half => {
        let needed = 0
        PMS_ACTIVE.forEach(pmName => {
          const slot = daySlots[half]?.[pmName]
          if (slot && slot.workers) needed += Number(slot.workers) || 0
        })
        if (!result[dateStr]) result[dateStr] = {}
        result[dateStr][half] = { needed, available, pct: available > 0 ? Math.round((needed / available) * 100) : 0 }
        totalNeeded += needed
      })
      const totalAvail = available * 2
      result[dateStr].daily = { needed: totalNeeded, available: totalAvail, pct: totalAvail > 0 ? Math.round((totalNeeded / totalAvail) * 100) : 0 }
    })
    return result
  }, [allDays, slotData, workersAvailableOverrides])

  /* ── Weekly summaries ──────────────────────────────────────── */
  const weekSummaries = useMemo(() => {
    return weeksInMonth.map(weekDays => {
      let needed = 0, avail = 0
      weekDays.forEach(date => {
        const dateStr = toLocalISO(date)
        const cap = capacityData[dateStr]
        if (cap) {
          needed += (cap.am?.needed || 0) + (cap.pm?.needed || 0)
          avail += getWorkersAvailable(dateStr) * 2
        }
      })
      return { needed, available: avail, pct: avail > 0 ? Math.round((needed / avail) * 100) : 0 }
    })
  }, [weeksInMonth, capacityData, workersAvailableOverrides])

  /* ── Rolling month-view weekly summaries ──────────────────── */
  const monthViewSummaries = useMemo(() => {
    return monthViewWeeks.map(weekDays => {
      let needed = 0, avail = 0
      weekDays.forEach(date => {
        const dateStr = toLocalISO(date)
        const cap = capacityData[dateStr]
        if (cap) {
          needed += (cap.am?.needed || 0) + (cap.pm?.needed || 0)
          avail += getWorkersAvailable(dateStr) * 2
        }
      })
      return { needed, available: avail, pct: avail > 0 ? Math.round((needed / avail) * 100) : 0 }
    })
  }, [monthViewWeeks, capacityData, workersAvailableOverrides])

  /* ── Helpers ─────────────────────────────────────────────────── */
  function getCapacityColor(pct) {
    if (pct > 110) return 'var(--bp-red)'
    if (pct >= 100) return 'var(--bp-blue)'
    if (pct >= 80) return 'var(--bp-amber)'
    return 'var(--bp-green)'
  }

  function getCapacityBg(pct) {
    if (pct > 110) return 'var(--bp-red-bg)'
    if (pct >= 100) return 'var(--bp-info-bg)'
    if (pct >= 80) return 'var(--bp-amber-bg)'
    return 'var(--bp-green-bg)'
  }

  function getCapacityBarColor(pct) {
    if (pct > 110) return 'var(--bp-red)'
    if (pct >= 100) return 'var(--bp-blue)'
    if (pct >= 80) return 'var(--bp-amber)'
    return 'var(--bp-green)'
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
    setDragOverCell(null)
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
  useEffect(() => {
    if (selectedJob && !unassignedJobs.find(j => j.cr55d_jobid === selectedJob.cr55d_jobid)) {
      setSelectedJob(null)
    }
  }, [unassignedJobs, selectedJob])

  /* ── PM load indicators (jobs this month) ──────────────────── */
  const pmLoadMap = useMemo(() => {
    const loads = {}
    PMS_ACTIVE.forEach(pm => {
      let totalDays = 0
      allDays.forEach(date => {
        const dateStr = toLocalISO(date)
        const daySlots = slotData[dateStr]
        if (daySlots?.am?.[pm] || daySlots?.pm?.[pm]) totalDays++
      })
      const pct = allDays.length > 0 ? Math.round((totalDays / allDays.length) * 100) : 0
      loads[pm] = { totalDays, pct }
    })
    return loads
  }, [slotData, allDays])

  function getPMLoadColor(pct) {
    if (pct >= 80) return 'var(--bp-red)'
    if (pct >= 50) return 'var(--bp-amber)'
    return 'var(--bp-green)'
  }

  /* ── Inline styles ─────────────────────────────────────────── */
  const styles = {
    wrapper: {
      display: 'flex', flexDirection: 'column', gap: '0px', animation: 'fadeIn .3s ease',
    },
    toolbar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
      background: 'var(--bp-white)', borderBottom: '1px solid var(--bp-border)',
      borderRadius: 'var(--bp-r) var(--bp-r) 0 0',
    },
    monthNav: {
      display: 'flex', alignItems: 'center', gap: '8px',
    },
    monthLabel: {
      fontSize: '15px', fontWeight: 700, color: 'var(--bp-navy)', minWidth: '180px', textAlign: 'center',
      fontFamily: 'var(--bp-font)',
    },
    navBtn: {
      width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid var(--bp-border)', borderRadius: 'var(--bp-r-sm)', background: 'var(--bp-white)',
      cursor: 'pointer', fontSize: '16px', fontWeight: 700, color: 'var(--bp-navy)',
      transition: 'var(--bp-transition)',
    },
    todayBtn: {
      fontSize: '12px', padding: '5px 14px', marginLeft: '8px', border: '1px solid var(--bp-border)',
      borderRadius: 'var(--bp-r-sm)', background: 'var(--bp-white)', cursor: 'pointer', fontWeight: 600,
      color: 'var(--bp-navy)', transition: 'var(--bp-transition)', fontFamily: 'var(--bp-font)',
    },
    drawerBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px',
      background: 'var(--bp-egg)', borderBottom: '1px solid var(--bp-border-lt)', cursor: 'pointer',
      userSelect: 'none', transition: 'var(--bp-transition)',
    },
    drawerLabel: {
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700,
      color: 'var(--bp-navy)', fontFamily: 'var(--bp-font)',
    },
    drawerChevron: {
      fontSize: '14px', color: 'var(--bp-muted)', transition: 'transform .2s ease',
    },
    drawerBody: {
      display: 'flex', gap: '10px', padding: '12px 16px', overflowX: 'auto', overflowY: 'hidden',
      background: 'var(--bp-egg)', borderBottom: '1px solid var(--bp-border)',
      scrollbarWidth: 'thin',
    },
    jobCard: {
      minWidth: '200px', maxWidth: '220px', flexShrink: 0, padding: '12px 14px',
      background: 'var(--bp-white)', borderRadius: 'var(--bp-r-sm)',
      border: '1px solid var(--bp-border)', cursor: 'grab',
      transition: 'box-shadow .15s ease, border-color .15s ease',
      fontFamily: 'var(--bp-font)',
    },
    jobCardSelected: {
      borderColor: 'var(--bp-blue)', boxShadow: '0 0 0 2px rgba(37,99,235,.2)',
    },
    jobCardName: {
      fontSize: '12px', fontWeight: 700, color: 'var(--bp-navy)', marginBottom: '4px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    jobCardDates: {
      fontSize: '11px', color: 'var(--bp-muted)', marginBottom: '6px',
    },
    jobCardMeta: {
      display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
    },
    weekCard: {
      background: 'var(--bp-white)', borderRadius: 'var(--bp-r)', border: '1px solid var(--bp-border)',
      overflow: 'hidden', marginBottom: '12px', boxShadow: 'var(--bp-shadow)',
    },
    weekHeader: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px',
      background: 'var(--bp-navy)', color: 'var(--bp-ivory)',
    },
    weekTitle: {
      fontSize: '13px', fontWeight: 700, fontFamily: 'var(--bp-font)',
    },
    capacityPill: {
      fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px',
      fontFamily: 'var(--bp-mono)',
    },
    gridWrapper: {
      overflowX: 'auto', padding: '0',
    },
    pmRow: {
      display: 'grid', borderBottom: '1px solid var(--bp-border-lt)', minHeight: '56px',
      transition: 'background .1s ease',
    },
    pmLabel: {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
      borderRight: '1px solid var(--bp-border-lt)', minWidth: '140px',
    },
    avatar: {
      width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--bp-ivory)',
      background: 'var(--bp-navy)', flexShrink: 0, fontFamily: 'var(--bp-mono)',
    },
    pmName: {
      fontSize: '12px', fontWeight: 600, color: 'var(--bp-text)', fontFamily: 'var(--bp-font)',
    },
    loadDot: {
      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
    },
    dayCell: {
      position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px',
      padding: '4px', minWidth: '110px', minHeight: '52px',
      borderRight: '1px solid var(--bp-border-lt)', transition: 'background .1s ease',
    },
    dayCellDropTarget: {
      background: 'rgba(37,99,235,.06)', border: '2px dashed var(--bp-blue)',
    },
    emptyCellHalf: {
      flex: 1, borderRadius: '4px', border: '1px dashed var(--bp-border-lt)',
      minHeight: '22px',
    },
    chip: {
      flex: 1, display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px',
      borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      transition: 'box-shadow .15s ease, transform .1s ease',
      fontFamily: 'var(--bp-font)', minHeight: '22px',
    },
    chipInstall: {
      background: 'rgba(29,58,107,.1)', color: 'var(--bp-navy)', border: '1px solid rgba(29,58,107,.18)',
    },
    chipStrike: {
      background: 'rgba(182,162,130,.15)', color: '#6B5A3E', border: '1px solid rgba(182,162,130,.25)',
    },
    chipOther: {
      background: 'rgba(107,114,128,.08)', color: 'var(--bp-muted)', border: '1px solid rgba(107,114,128,.15)',
    },
    chipHovered: {
      boxShadow: 'var(--bp-shadow-md)', transform: 'translateY(-1px)',
    },
    crewBadge: {
      fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px',
      fontFamily: 'var(--bp-mono)', flexShrink: 0,
    },
    dayHeader: {
      textAlign: 'center', padding: '6px 4px', fontSize: '11px', fontWeight: 700,
      color: 'var(--bp-muted)', borderRight: '1px solid var(--bp-border-lt)',
      borderBottom: '1px solid var(--bp-border)', fontFamily: 'var(--bp-font)',
      minWidth: '110px', background: 'var(--bp-alt)',
    },
    dayHeaderToday: {
      color: 'var(--bp-blue)', background: 'rgba(37,99,235,.06)',
    },
    dayHeaderWeekend: {
      color: 'var(--bp-amber)', background: 'rgba(213,167,42,.04)',
    },
    summaryBar: {
      display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px',
      background: 'var(--bp-alt)', borderTop: '1px solid var(--bp-border-lt)',
      fontSize: '12px', fontFamily: 'var(--bp-font)', flexWrap: 'wrap',
    },
    summaryLabel: {
      fontSize: '11px', fontWeight: 600, color: 'var(--bp-muted)', textTransform: 'uppercase',
      letterSpacing: '.04em',
    },
    summaryValue: {
      fontSize: '13px', fontWeight: 700, color: 'var(--bp-navy)', fontFamily: 'var(--bp-mono)',
    },
    progressTrack: {
      flex: 1, minWidth: '120px', maxWidth: '300px', height: '8px', borderRadius: '4px',
      background: 'var(--bp-border-lt)', overflow: 'hidden',
    },
    progressFill: {
      height: '100%', borderRadius: '4px', transition: 'width .4s ease',
    },
  }

  /* ── Day column header sub-row ─────────────────────────────── */
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const gridCols = `140px repeat(7, minmax(110px, 1fr))`

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <>
      <div style={styles.wrapper} className="animate-in">

        {/* ── Toolbar ──────────────────────────────────────── */}
        <div style={styles.toolbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--bp-alt)', borderRadius: '8px', padding: '2px', border: '1px solid var(--bp-border-lt)', marginRight: '10px' }}>
              {['week', 'month'].map(v => (
                <button key={v} onClick={() => setViewMode(v)} className="text-md font-semibold" style={{
                  padding: '4px 12px', borderRadius: '6px', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--bp-font)', transition: 'all .15s',
                  background: viewMode === v ? 'var(--bp-navy)' : 'transparent',
                  color: viewMode === v ? 'var(--bp-ivory)' : 'var(--bp-muted)',
                }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
              ))}
            </div>

            {/* Week nav (only in week view) */}
            {viewMode === 'week' && (
              <>
                <button style={styles.navBtn} onClick={() => goWeek(-1)} title="Previous week">&lsaquo;</button>
                <span className="text-lg font-bold color-navy" style={{ minWidth: '200px', textAlign: 'center', fontFamily: 'var(--bp-font)' }}>
                  {weeksInMonth[activeWeekIdx] ? `${formatDateShort(weeksInMonth[activeWeekIdx][0])} \u2013 ${formatDateShort(weeksInMonth[activeWeekIdx][6])}` : monthLabel}
                </span>
                <button style={styles.navBtn} onClick={() => goWeek(1)} title="Next week">&rsaquo;</button>
              </>
            )}

            {/* Rolling 5-week label in month view */}
            {viewMode === 'month' && (
              <span style={styles.monthLabel}>
                {formatDateShort(monthViewWeeks[0][0])} &ndash; {formatDateShort(monthViewWeeks[4][6])}
              </span>
            )}

            <button style={styles.todayBtn} onClick={() => { goToday(); setCurrentWeekIdx(null) }}>Today</button>

            {/* Month label in week view for context */}
            {viewMode === 'week' && (
              <span className="text-md color-muted ml-8" style={{ fontFamily: 'var(--bp-font)' }}>{monthLabel}</span>
            )}
          </div>

          <div className="text-md color-muted" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Week dots (mini nav) */}
            {viewMode === 'week' && (
              <div style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
                {weeksInMonth.map((_, wi) => (
                  <button key={wi} onClick={() => setCurrentWeekIdx(wi)} style={{
                    width: '8px', height: '8px', borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                    background: wi === activeWeekIdx ? 'var(--bp-navy)' : 'var(--bp-border)',
                    transition: 'all .15s',
                  }} title={`Week ${wi + 1}`} />
                ))}
              </div>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(29,58,107,.1)', border: '1px solid rgba(29,58,107,.18)', display: 'inline-block' }}></span>
              Install
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgba(182,162,130,.15)', border: '1px solid rgba(182,162,130,.25)', display: 'inline-block' }}></span>
              Strike
            </span>
          </div>
        </div>

        {/* ── Unassigned Jobs Drawer ─────────────────────────── */}
        <div>
          <div style={styles.drawerBar} onClick={() => setDrawerOpen(prev => !prev)}>
            <div style={styles.drawerLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bp-navy)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M12 8v8m-4-4h8"/>
              </svg>
              {drawerOpen ? 'Unassigned Jobs' : `${unassignedJobs.length} unassigned job${unassignedJobs.length !== 1 ? 's' : ''}`}
              {drawerOpen && unassignedJobs.length > 0 && (
                <span className="badge badge-navy text-sm" style={{ padding: '2px 8px', marginLeft: '2px' }}>{unassignedJobs.length}</span>
              )}
            </div>
            <span style={{ ...styles.drawerChevron, transform: drawerOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>&#x25BE;</span>
          </div>

          {drawerOpen && (
            <div style={styles.drawerBody}>
              {unassignedJobs.length === 0 ? (
                <div className="text-base color-muted" style={{ padding: '8px 0', fontStyle: 'italic' }}>
                  All jobs assigned
                </div>
              ) : (
                [...unassignedJobs]
                  .sort((a, b) => (a.cr55d_installdate || '9999').localeCompare(b.cr55d_installdate || '9999'))
                  .map(j => {
                    const isSelected = selectedJob?.cr55d_jobid === j.cr55d_jobid
                    return (
                      <div key={j.cr55d_jobid}
                        style={{
                          ...styles.jobCard,
                          ...(isSelected ? styles.jobCardSelected : {}),
                        }}
                        draggable="true"
                        onDragStart={e => {
                          e.dataTransfer.setData('jobId', j.cr55d_jobid)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedJob(null)
                          } else {
                            setSelectedJob(j)
                            // Auto-navigate calendar to the job's install date
                            if (j.cr55d_installdate) {
                              const jobDate = new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
                              if (jobDate.getFullYear() >= 2024) {
                                setCurrentMonth(new Date(jobDate.getFullYear(), jobDate.getMonth(), 1))
                                setJumpToDate(jobDate)
                              }
                            }
                          }
                        }}
                      >
                        <div style={styles.jobCardName} title={j.cr55d_clientname || j.cr55d_jobname}>
                          {j.cr55d_clientname || j.cr55d_jobname}
                        </div>
                        <div style={styles.jobCardDates}>
                          {shortDate(isoDate(j.cr55d_installdate))} &rarr; {shortDate(isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate))}
                        </div>
                        <div style={styles.jobCardMeta}>
                          {j.cr55d_crewcount && (
                            <span className="badge text-sm" style={{ padding: '2px 7px', background: 'var(--bp-navy)', color: 'var(--bp-ivory)' }}>
                              {j.cr55d_crewcount} crew
                            </span>
                          )}
                          {j.cr55d_quotedamount && (
                            <span className="text-md font-mono color-muted">
                              {fmtCurrency(j.cr55d_quotedamount)}
                            </span>
                          )}
                        </div>
                        {isSelected && (() => {
                          return (
                            <div className="text-md mt-8" style={{ paddingTop: '8px', borderTop: '1px solid var(--bp-border-lt)', lineHeight: '1.6' }}>
                              <div>Sales: {j.cr55d_salesrep || '--'}</div>
                              <div>Venue: {j.cr55d_venuename || '--'}</div>
                              <div className="text-md font-semibold color-navy text-center" style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(37,99,235,.06)' }}>
                                Drag to a PM cell below, or click any empty cell to assign
                              </div>
                              <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {PMS_ACTIVE.map(pm => (
                                  <button key={pm}
                                    className="text-sm font-semibold color-navy"
                                    style={{ padding: '3px 8px', borderRadius: '12px', border: '1px solid var(--bp-border)', background: 'var(--bp-white)', cursor: 'pointer', fontFamily: 'var(--bp-font)', transition: 'all .15s' }}
                                    onClick={e => { e.stopPropagation(); handleOneClickAssign(j, pm) }}
                                    title={`Assign to ${pm}`}
                                  >
                                    {pm.split(' ')[0]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })
              )}
            </div>
          )}
        </div>

        {/* ── Assignment Mode Banner ──────────────────────── */}
        {selectedJob && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', background: 'rgba(37,99,235,.08)', borderBottom: '2px solid var(--bp-blue)',
            fontSize: '12px', fontWeight: 600, color: 'var(--bp-navy)', fontFamily: 'var(--bp-font)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--bp-blue)', animation: 'pulse 1.5s ease-in-out infinite' }}></span>
              Assigning: <strong>{selectedJob.cr55d_clientname || selectedJob.cr55d_jobname}</strong>
              <span className="text-md color-muted" style={{ fontWeight: 400 }}>
                ({shortDate(isoDate(selectedJob.cr55d_installdate))} &rarr; {shortDate(isoDate(selectedJob.cr55d_strikedate) || isoDate(selectedJob.cr55d_eventdate))})
              </span>
            </div>
            <button
              className="text-md font-semibold color-muted"
              style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--bp-border)', background: 'var(--bp-white)', cursor: 'pointer', fontFamily: 'var(--bp-font)' }}
              onClick={() => setSelectedJob(null)}
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Month Overview (compact) ──────────────────────── */}
        {viewMode === 'month' && (
          <div style={{ padding: '12px 16px' }}>
            {/* Capacity heat strip per week */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {monthViewWeeks.map((weekDays, wi) => {
                const summary = monthViewSummaries[wi] || { needed: 0, available: 0, pct: 0 }
                const capColor = getCapacityBarColor(summary.pct)
                return (
                  <div key={wi}
                    onClick={() => {
                      // Navigate to the correct month/week for week view
                      const mon = weekDays[0]
                      const targetMonth = new Date(mon.getFullYear(), mon.getMonth(), 1)
                      setCurrentMonth(targetMonth)
                      // Find the week index by matching the Monday date
                      const monStr = toLocalISO(mon)
                      // Build target month's weeks to find the right index
                      const yr = targetMonth.getFullYear(), mo = targetMonth.getMonth()
                      const first = new Date(yr, mo, 1)
                      const startDow = first.getDay()
                      const mOff = startDow === 0 ? -6 : 1 - startDow
                      const firstMon = new Date(yr, mo, 1 + mOff)
                      const lastDay = new Date(yr, mo + 1, 0)
                      let idx = 0, cursor = new Date(firstMon)
                      while (cursor <= lastDay) {
                        if (toLocalISO(cursor) === monStr) break
                        cursor.setDate(cursor.getDate() + 7)
                        idx++
                      }
                      setCurrentWeekIdx(idx)
                      setViewMode('week')
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                      background: 'var(--bp-white)', border: '1px solid var(--bp-border)', borderRadius: 'var(--bp-r-sm)',
                      cursor: 'pointer', transition: 'all .15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--bp-blue)'; e.currentTarget.style.boxShadow = 'var(--bp-shadow)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--bp-border)'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ minWidth: '160px' }}>
                      {wi === 0 && <div className="text-sm font-bold" style={{ color: 'var(--bp-blue)', marginBottom: '2px' }}>This Week</div>}
                      {wi === 1 && <div className="text-sm font-bold color-muted" style={{ marginBottom: '2px' }}>Next Week</div>}
                      <span className="text-base font-bold color-navy" style={{ fontFamily: 'var(--bp-font)' }}>
                        {formatDateShort(weekDays[0])} &ndash; {formatDateShort(weekDays[6])}
                      </span>
                    </div>

                    {/* Day cells mini */}
                    <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
                      {weekDays.map((date, di) => {
                        const dateStr = toLocalISO(date)
                        const cap = capacityData[dateStr]
                        const dailyPct = cap?.daily?.pct || 0
                        const isToday = date.toDateString() === new Date().toDateString()
                        // Count jobs on this day
                        const daySlots = slotData[dateStr] || { am: {}, pm: {} }
                        let jobCount = 0
                        PMS_ACTIVE.forEach(pm => { if (daySlots.am?.[pm]) jobCount++; if (daySlots.pm?.[pm]) jobCount++ })

                        return (
                          <div key={di} style={{
                            flex: 1, textAlign: 'center', padding: '4px 2px', borderRadius: '4px', fontSize: '10px',
                            background: dailyPct > 0 ? getCapacityBg(dailyPct) : 'var(--bp-alt)',
                            border: isToday ? '2px solid var(--bp-blue)' : '1px solid var(--bp-border-lt)',
                            fontFamily: 'var(--bp-font)',
                          }}>
                            <div className="text-sm font-bold color-muted">
                              {DAY_NAMES[date.getDay()]}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--bp-text)' }}>{date.getDate()}</div>
                            {jobCount > 0 && (
                              <div className="text-2xs font-bold" style={{ color: dailyPct > 0 ? getCapacityColor(dailyPct) : 'var(--bp-muted)', marginTop: '2px' }}>
                                {jobCount} job{jobCount !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Capacity bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bp-border-lt)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '4px', width: Math.min(summary.pct, 100) + '%', background: capColor, transition: 'width .3s ease' }}></div>
                      </div>
                      <span className="text-base font-bold font-mono text-right" style={{ color: capColor, minWidth: '36px' }}>
                        {summary.pct}%
                      </span>
                    </div>

                    {/* Drill-in arrow */}
                    <span className="text-xl color-muted ml-4">&rsaquo;</span>
                  </div>
                )
              })}
            </div>

            {/* PM utilization summary for the month */}
            <div style={{ background: 'var(--bp-white)', border: '1px solid var(--bp-border)', borderRadius: 'var(--bp-r)', padding: '14px 16px' }}>
              <div className="text-md font-bold color-muted" style={{ textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '10px' }}>PM Utilization — Next 5 Weeks</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {PMS_ACTIVE.map(pm => {
                  const load = pmLoadMap[pm] || { pct: 0, totalDays: 0 }
                  return (
                    <div key={pm} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bp-alt)', border: '1px solid var(--bp-border-lt)' }}>
                      <div style={styles.avatar}>{getPMInitials(pm)}</div>
                      <div style={{ flex: 1 }}>
                        <div className="text-md font-semibold">{pm.split(' ')[0]}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bp-border-lt)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: '2px', width: load.pct + '%', background: getPMLoadColor(load.pct), transition: 'width .3s ease' }}></div>
                          </div>
                          <span className="text-sm font-bold font-mono" style={{ color: getPMLoadColor(load.pct) }}>{load.pct}%</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Week Cards (single week in week view) ────────────────── */}
        {viewMode === 'week' && (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {weeksInMonth.filter((_, wi) => wi === activeWeekIdx).map((weekDays) => {
            const weekMon = weekDays[0]
            const weekSun = weekDays[6]
            const summary = weekSummaries[activeWeekIdx] || { needed: 0, available: 0, pct: 0 }
            const capColor = getCapacityBarColor(summary.pct)
            const today = new Date()

            return (
              <div key={activeWeekIdx} style={styles.weekCard}>
                {/* Week header */}
                <div style={styles.weekHeader}>
                  <span style={styles.weekTitle}>
                    Week of {formatDateShort(weekMon)} &ndash; {formatDateShort(weekSun)}
                  </span>
                  <span style={{
                    ...styles.capacityPill,
                    background: summary.pct === 0 ? 'rgba(255,255,255,.15)' : getCapacityBg(summary.pct),
                    color: summary.pct === 0 ? 'var(--bp-ivory)' : getCapacityColor(summary.pct),
                  }}>
                    {summary.pct}% capacity
                  </span>
                </div>

                {/* Day column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid var(--bp-border)' }}>
                  <div className="text-md font-bold color-navy" style={{ ...styles.dayHeader, textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'left', padding: '6px 12px' }}>
                    PM
                  </div>
                  {weekDays.map((date, di) => {
                    const dateStr = toLocalISO(date)
                    const dow = date.getDay()
                    const isToday = date.toDateString() === today.toDateString()
                    const isWeekend = dow === 0 || dow === 6
                    const available = getWorkersAvailable(dateStr)
                    const cap = capacityData[dateStr]
                    const dailyPct = cap?.daily?.pct || 0

                    return (
                      <div key={di} style={{
                        ...styles.dayHeader,
                        ...(isToday ? styles.dayHeaderToday : {}),
                        ...(isWeekend ? styles.dayHeaderWeekend : {}),
                      }}>
                        <div className="text-md font-bold">{DAY_NAMES[dow]}</div>
                        <div className="text-md font-medium" style={{ marginTop: '1px' }}>{formatDateShort(date)}</div>
                        <div className="text-sm font-mono" style={{
                          marginTop: '3px', cursor: 'pointer',
                          color: dailyPct > 80 ? getCapacityColor(dailyPct) : 'var(--bp-muted)',
                        }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const val = prompt(`Workers available for ${formatDateShort(date)}:`, available)
                            if (val !== null && !isNaN(Number(val)) && Number(val) >= 0) {
                              setWorkersAvailableOverrides(prev => ({ ...prev, [dateStr]: Math.round(Number(val)) }))
                            }
                          }}
                          title="Click to edit available workers"
                        >
                          Avail: {available}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* PM rows */}
                {PMS_ACTIVE.map((pm, pi) => {
                  const load = pmLoadMap[pm] || { pct: 0 }
                  return (
                    <div key={pi} style={{
                      ...styles.pmRow,
                      gridTemplateColumns: gridCols,
                      background: pi % 2 === 0 ? 'var(--bp-white)' : 'var(--bp-alt)',
                    }}>
                      {/* PM label */}
                      <div style={styles.pmLabel}>
                        <div style={styles.avatar}>{getPMInitials(pm)}</div>
                        <div>
                          <div style={styles.pmName}>{pm.split(' ')[0]}</div>
                        </div>
                        <div style={{ ...styles.loadDot, background: getPMLoadColor(load.pct) }} title={`${load.pct}% loaded this month`}></div>
                      </div>

                      {/* 7 day cells */}
                      {weekDays.map((date, di) => {
                        const dateStr = toLocalISO(date)
                        const daySlots = slotData[dateStr] || { am: {}, pm: {} }
                        const amSlot = daySlots.am?.[pm]
                        const pmSlot = daySlots.pm?.[pm]
                        const isToday = date.toDateString() === today.toDateString()
                        const cellKey = `${dateStr}|${pm}`
                        const isDropTarget = dragOverCell === cellKey
                        // Highlight cells in the selected job's date range
                        const jobInRange = selectedJob && (() => {
                          const ji = isoDate(selectedJob.cr55d_installdate)
                          const js = isoDate(selectedJob.cr55d_strikedate) || ji
                          return ji && dateStr >= ji && dateStr <= js
                        })()

                        return (
                          <div key={di} style={{
                            ...styles.dayCell,
                            ...(isToday ? { background: 'rgba(37,99,235,.03)' } : {}),
                            ...(isDropTarget ? styles.dayCellDropTarget : {}),
                            ...(jobInRange && !amSlot && !pmSlot ? { background: 'rgba(37,99,235,.06)', borderColor: 'rgba(37,99,235,.2)' } : {}),
                            ...(selectedJob && !amSlot ? { cursor: 'pointer' } : {}),
                          }}
                            onDragOver={e => { e.preventDefault(); setDragOverCell(cellKey) }}
                            onDragLeave={() => setDragOverCell(null)}
                            onDrop={e => handleDrop(e, pm, dateStr, 'am')}
                            onClick={() => { if (selectedJob) handleOneClickAssign(selectedJob, pm) }}
                          >
                            {/* AM half */}
                            {amSlot ? (
                              <div
                                style={{
                                  ...styles.chip,
                                  ...(amSlot.isStrike ? styles.chipStrike : amSlot.isInstall ? styles.chipInstall : styles.chipOther),
                                  ...(hoveredChip === `${dateStr}|am|${pm}` ? styles.chipHovered : {}),
                                }}
                                onMouseEnter={() => setHoveredChip(`${dateStr}|am|${pm}`)}
                                onMouseLeave={() => setHoveredChip(null)}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (amSlot.jobId && onSelectJob) {
                                    const job = jobs.find(j => j.cr55d_jobid === amSlot.jobId)
                                    if (job) onSelectJob(job)
                                  }
                                }}
                                title={`AM: ${amSlot.desc}${amSlot.acctMgr ? ' (' + amSlot.acctMgr + ')' : ''} - ${amSlot.workers} crew`}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{amSlot.desc}</span>
                                {amSlot.workers > 0 && (
                                  <span style={{
                                    ...styles.crewBadge,
                                    background: amSlot.isStrike ? 'rgba(182,162,130,.25)' : 'rgba(29,58,107,.15)',
                                    color: amSlot.isStrike ? '#6B5A3E' : 'var(--bp-navy)',
                                  }}>{amSlot.workers}</span>
                                )}
                              </div>
                            ) : (
                              <div style={styles.emptyCellHalf} title={`${pm.split(' ')[0]} - AM`}></div>
                            )}

                            {/* PM half */}
                            {pmSlot ? (
                              <div
                                style={{
                                  ...styles.chip,
                                  ...(pmSlot.isStrike ? styles.chipStrike : pmSlot.isInstall ? styles.chipInstall : styles.chipOther),
                                  ...(hoveredChip === `${dateStr}|pm|${pm}` ? styles.chipHovered : {}),
                                }}
                                onMouseEnter={() => setHoveredChip(`${dateStr}|pm|${pm}`)}
                                onMouseLeave={() => setHoveredChip(null)}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (pmSlot.jobId && onSelectJob) {
                                    const job = jobs.find(j => j.cr55d_jobid === pmSlot.jobId)
                                    if (job) onSelectJob(job)
                                  }
                                }}
                                title={`PM: ${pmSlot.desc}${pmSlot.acctMgr ? ' (' + pmSlot.acctMgr + ')' : ''} - ${pmSlot.workers} crew`}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{pmSlot.desc}</span>
                                {pmSlot.workers > 0 && (
                                  <span style={{
                                    ...styles.crewBadge,
                                    background: pmSlot.isStrike ? 'rgba(182,162,130,.25)' : 'rgba(29,58,107,.15)',
                                    color: pmSlot.isStrike ? '#6B5A3E' : 'var(--bp-navy)',
                                  }}>{pmSlot.workers}</span>
                                )}
                              </div>
                            ) : (
                              <div style={styles.emptyCellHalf} title={`${pm.split(' ')[0]} - PM`}></div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                {/* Week Summary Bar */}
                <div style={styles.summaryBar}>
                  <div>
                    <span style={styles.summaryLabel}>Worker-Shifts </span>
                    <span style={styles.summaryValue}>{summary.needed}</span>
                  </div>
                  <div>
                    <span style={styles.summaryLabel}>Available </span>
                    <span style={styles.summaryValue}>{summary.available}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <span style={styles.summaryLabel}>Capacity</span>
                    <div style={styles.progressTrack}>
                      <div style={{
                        ...styles.progressFill,
                        width: Math.min(summary.pct, 100) + '%',
                        background: capColor,
                      }}></div>
                    </div>
                    <span className="text-lg font-bold font-mono" style={{
                      color: capColor, minWidth: '40px',
                    }}>
                      {summary.pct}%
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        )}
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
function EventTechSchedule({ staff, jobs, weekDates, onSelectJob }) {
  const DEPT_LABELS = { 306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member', 306280006: 'Warehouse', 306280010: 'Crew Leader' }
  const opsCrew = staff.filter(s => [306280003, 306280004, 306280005, 306280006, 306280010].includes(s.cr55d_department))

  const eventJobs = jobs.filter(j => {
    if (!j.cr55d_eventdate) return false
    const evt = new Date(j.cr55d_eventdate.split('T')[0] + 'T12:00:00')
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    return evt >= new Date(new Date().setHours(0,0,0,0)) && evt <= twoWeeks
  }).sort((a, b) => (a.cr55d_eventdate || '').localeCompare(b.cr55d_eventdate || ''))


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

/* ═══════════════════════════════════════════════════════════════════
   LEADER SHEET
   ═══════════════════════════════════════════════════════════════════ */
function LeaderSheet({ jobs, staff, weekDates, onSelectJob }) {
  const leaders = staff.filter(s => s.cr55d_department === 306280010)

  const upcomingJobs = jobs.filter(j => {
    if (!j.cr55d_installdate) return false
    const install = new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    return install <= twoWeeks && install >= new Date(new Date().setHours(0,0,0,0))
  }).sort((a, b) => (a.cr55d_installdate || '').localeCompare(b.cr55d_installdate || ''))


  return (
    <div>
      <div className="flex-between mb-12">
        <div>
          <span className="text-base color-muted">Next 2 weeks \u2014 {upcomingJobs.length} jobs</span>
          <span className="text-md color-blue font-semibold ml-8">{leaders.length} crew leaders available</span>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨️ Print</button>
          <button className="btn btn-primary btn-sm" onClick={async (ev) => { const btn = ev.currentTarget; btn.textContent = 'Generating...'; btn.disabled = true; try { await generateLeaderSheet(jobs, weekDates[0]); btn.textContent = '✓ Downloaded'; setTimeout(() => { btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false }, 2000) } catch(e) { console.error('[Leader Sheet]', e); btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false } }}>📥 Leader Sheet .docx</button>
          <button className="btn btn-outline btn-sm" onClick={(ev) => {
            const activeJobs = jobs.filter(j => {
              const install = j.cr55d_installdate?.split('T')[0]
              if (!install) return false
              const now = new Date()
              const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
              const strike = j.cr55d_strikedate?.split('T')[0] || install
              return todayStr >= install && todayStr <= strike
            })
            if (activeJobs.length === 0) { const btn = ev.currentTarget; btn.textContent = 'No active jobs today'; btn.disabled = true; setTimeout(() => { btn.textContent = '📄 Production PDFs'; btn.disabled = false }, 2000); return }
            activeJobs.forEach(j => { try { generateProductionSchedulePDF(j) } catch(e) { console.error(e) } })
          }}>📄 Production PDFs</button>
        </div>
      </div>

      {/* Crew leaders quick view */}
      {leaders.length > 0 && (
        <div className="card mb-12" style={{padding:'10px 14px'}}>
          <div className="text-sm font-bold color-muted text-upper mb-6">Crew Leaders</div>
          <div className="flex gap-6 flex-wrap">
            {leaders.map(l => (
              <span key={l.cr55d_stafflistid} className="badge badge-green" style={{fontSize:'11px',padding:'3px 10px'}}>
                {getStaffDisplayName(l.cr55d_name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {upcomingJobs.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">&#128203;</div><div className="empty-state-title">No upcoming jobs</div><div className="empty-state-sub">Jobs installing in the next 2 weeks will appear here</div></div></div>
      ) : (
        upcomingJobs.map((j, i) => (
          <div key={j.cr55d_jobid} className="card mb-8 card-interactive" onClick={() => onSelectJob && onSelectJob(j)} style={{animation: `slideUp .3s ease ${i * 50}ms both`}}>
            <div className="flex-between mb-4">
              <div>
                <span className="text-xl font-bold color-navy">{j.cr55d_clientname || j.cr55d_jobname}</span>
                <span className={`badge ${j.cr55d_pmassigned ? 'badge-blue' : 'badge-amber'} ml-8`}>{j.cr55d_pmassigned || 'No PM'}</span>
              </div>
              <span className="text-base font-mono font-bold color-navy">
                {shortDate(isoDate(j.cr55d_installdate))}
                {j.cr55d_strikedate && <span className="color-muted" style={{fontWeight:400}}> \u2192 {shortDate(isoDate(j.cr55d_strikedate))}</span>}
              </span>
            </div>
            <div className="grid-3 text-md color-muted">
              <div><strong>Venue:</strong> {j.cr55d_venuename || '\u2014'}</div>
              <div><strong>Crew:</strong> {j.cr55d_crewcount || '\u2014'}</div>
              <div><strong>Trucks:</strong> {j.cr55d_trucksneeded || '\u2014'}</div>
            </div>
            {j.cr55d_venueaddress && (
              <div className="text-sm color-light mt-4">{j.cr55d_venueaddress}</div>
            )}
            <div style={{display:'flex',gap:'6px',marginTop:'6px'}}>
              <span className="badge badge-amber" style={{fontSize:'10.5px'}}>Production: Not created</span>
              <span className="badge badge-amber" style={{fontSize:'10.5px'}}>Load List: Not created</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TRAVEL TRACKER — Flights, Hotels, Rental Cars per Job
   Full CRUD against cr55d_travelbookings Dataverse table
   ═══════════════════════════════════════════════════════════════════ */
const BOOKING_TYPES = { 306280000: 'Flight', 306280001: 'Hotel', 306280002: 'Rental Car' }
const BOOKING_TYPE_ICONS = { 306280000: '\u2708', 306280001: '\u{1F3E8}', 306280002: '\u{1F697}' }
const BOOKING_STATUSES = { 306280000: 'Booked', 306280001: 'Confirmed', 306280002: 'Cancelled', 306280003: 'Completed' }
const BOOKING_STATUS_BADGE = { 306280000: 'badge-amber', 306280001: 'badge-green', 306280002: 'badge-red', 306280003: 'badge-navy' }
const BOOKING_FIELDS = 'cr55d_travelbookingid,cr55d_type,cr55d_jobname,cr55d_crewmember,cr55d_provider,cr55d_confirmationnumber,cr55d_startdate,cr55d_enddate,cr55d_cost,cr55d_notes,cr55d_status,cr55d_jobid'

const EMPTY_BOOKING = {
  cr55d_type: 306280000,
  cr55d_jobname: '',
  cr55d_jobid: '',
  cr55d_crewmember: '',
  cr55d_provider: '',
  cr55d_confirmationnumber: '',
  cr55d_startdate: '',
  cr55d_enddate: '',
  cr55d_cost: '',
  cr55d_notes: '',
  cr55d_status: 306280000,
}

function TravelTracker({ jobs, staff }) {
  const [bookings, setBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_BOOKING })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const activeJobs = useMemo(() =>
    jobs.filter(j => j.cr55d_venuename || j.cr55d_venueaddress)
      .sort((a, b) => (a.cr55d_jobname || '').localeCompare(b.cr55d_jobname || '')),
    [jobs]
  )

  const crewNames = useMemo(() => {
    if (!staff?.length) return []
    return staff
      .filter(s => s.cr55d_status === 306280000 || s.cr55d_status == null)
      .map(s => {
        const n = s.cr55d_name || ''
        if (n.includes(',')) { const p = n.split(','); return `${p[1]?.trim()} ${p[0]?.trim()}` }
        return n
      })
      .filter(Boolean)
      .sort()
  }, [staff])

  async function loadBookings() {
    setLoadingBookings(true)
    setLoadError(null)
    try {
      const data = await dvFetch(`cr55d_travelbookings?$select=${BOOKING_FIELDS}&$orderby=cr55d_startdate asc`)
      setBookings(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('[Travel] Load failed:', e.message)
      setLoadError(e.message)
      setBookings([])
    } finally {
      setLoadingBookings(false)
    }
  }

  useEffect(() => { loadBookings() }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openAdd() {
    setEditId(null)
    setForm({ ...EMPTY_BOOKING })
    setShowModal(true)
  }

  function openEdit(b) {
    setEditId(b.cr55d_travelbookingid)
    setForm({
      cr55d_type: b.cr55d_type ?? 306280000,
      cr55d_jobname: b.cr55d_jobname || '',
      cr55d_jobid: b.cr55d_jobid || '',
      cr55d_crewmember: b.cr55d_crewmember || '',
      cr55d_provider: b.cr55d_provider || '',
      cr55d_confirmationnumber: b.cr55d_confirmationnumber || '',
      cr55d_startdate: b.cr55d_startdate ? b.cr55d_startdate.split('T')[0] : '',
      cr55d_enddate: b.cr55d_enddate ? b.cr55d_enddate.split('T')[0] : '',
      cr55d_cost: b.cr55d_cost ?? '',
      cr55d_notes: b.cr55d_notes || '',
      cr55d_status: b.cr55d_status ?? 306280000,
    })
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditId(null); setConfirmDelete(null) }

  function updateForm(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleSave() {
    if (!form.cr55d_jobname.trim()) { showToast('Job is required', 'error'); return }
    if (!form.cr55d_crewmember.trim()) { showToast('Crew member is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        cr55d_type: Number(form.cr55d_type),
        cr55d_jobname: form.cr55d_jobname.trim(),
        cr55d_jobid: form.cr55d_jobid || null,
        cr55d_crewmember: form.cr55d_crewmember.trim(),
        cr55d_provider: form.cr55d_provider.trim(),
        cr55d_confirmationnumber: form.cr55d_confirmationnumber.trim(),
        cr55d_startdate: form.cr55d_startdate || null,
        cr55d_enddate: form.cr55d_enddate || null,
        cr55d_cost: form.cr55d_cost ? Number(form.cr55d_cost) : null,
        cr55d_notes: form.cr55d_notes.trim(),
        cr55d_status: Number(form.cr55d_status),
      }
      if (editId) {
        await dvPatch(`cr55d_travelbookings(${editId})`, payload)
        showToast('Booking updated')
      } else {
        await dvPost('cr55d_travelbookings', payload)
        showToast('Booking added')
      }
      closeModal()
      await loadBookings()
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    setSaving(true)
    try {
      await dvPatch(`cr55d_travelbookings(${id})`, { cr55d_status: 306280002 })
      showToast('Booking cancelled')
      setConfirmDelete(null)
      closeModal()
      await loadBookings()
    } catch (e) {
      showToast('Cancel failed: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings.filter(b => b.cr55d_status !== 306280002)
    if (filter === 'cancelled') return bookings.filter(b => b.cr55d_status === 306280002)
    return bookings.filter(b => b.cr55d_type === Number(filter) && b.cr55d_status !== 306280002)
  }, [bookings, filter])

  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(b => {
      const key = b.cr55d_jobname || 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(b)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const totalSpend = useMemo(() => bookings.filter(b => b.cr55d_status !== 306280002).reduce((s, b) => s + (b.cr55d_cost || 0), 0), [bookings])
  const activeCount = bookings.filter(b => b.cr55d_status !== 306280002).length
  const upcomingCount = bookings.filter(b => {
    if (b.cr55d_status === 306280002) return false
    const start = b.cr55d_startdate?.split('T')[0]
    return start && start >= new Date().toISOString().split('T')[0]
  }).length

  const typeLabel = Number(form.cr55d_type) === 306280000 ? 'Flight' : Number(form.cr55d_type) === 306280001 ? 'Hotel' : 'Rental Car'
  const startLabel = Number(form.cr55d_type) === 306280000 ? 'Departure' : Number(form.cr55d_type) === 306280001 ? 'Check-in' : 'Pickup'
  const endLabel = Number(form.cr55d_type) === 306280000 ? 'Return' : Number(form.cr55d_type) === 306280001 ? 'Check-out' : 'Return'

  return (
    <div>
      {toast && (
        <div style={{position:'fixed',top:'16px',right:'16px',zIndex:500,padding:'10px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:600,color:'#fff',background:toast.type==='error'?'var(--bp-red)':'var(--bp-green)',boxShadow:'var(--bp-shadow-lg)',animation:'slideUp .25s ease'}}>
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-row-3 mb-12">
        <div className="kpi"><div className="kpi-label">Active Bookings</div><div className="kpi-val">{activeCount}</div><div className="kpi-sub">flights, hotels, rentals</div></div>
        <div className="kpi"><div className="kpi-label">Upcoming</div><div className="kpi-val color-blue">{upcomingCount}</div><div className="kpi-sub">future travel dates</div></div>
        <div className="kpi"><div className="kpi-label">Total Spend</div><div className="kpi-val">{fmtCurrency(totalSpend)}</div><div className="kpi-sub">across all bookings</div></div>
      </div>

      {/* Toolbar */}
      <div className="flex-between mb-12">
        <div className="flex gap-6">
          {[{ id: 'all', label: 'All' }, { id: '306280000', label: '\u2708 Flights' }, { id: '306280001', label: '\u{1F3E8} Hotels' }, { id: '306280002', label: '\u{1F697} Rentals' }, { id: 'cancelled', label: 'Cancelled' }].map(f => (
            <button key={f.id} className={`pill${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Booking</button>
      </div>

      {/* Content */}
      {loadingBookings ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading travel bookings...</div></div>
      ) : loadError ? (
        <div className="callout callout-amber mb-12">
          <span className="callout-icon">\u26A0</span>
          <div>
            <div className="font-semibold mb-4">Travel bookings table not available</div>
            <div className="text-md">The <code>cr55d_travelbookings</code> table needs to be created in Dataverse. Once created, bookings will load here automatically.</div>
            <button className="btn btn-ghost btn-xs mt-8" onClick={loadBookings}>Retry</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">{filter === 'cancelled' ? '\u274C' : '\u2708'}</div><div className="empty-state-title">{filter === 'cancelled' ? 'No Cancelled Bookings' : 'No Travel Bookings'}</div><div className="empty-state-sub">{filter === 'cancelled' ? 'Cancelled bookings will appear here.' : 'Click "+ Add Booking" to create a flight, hotel, or rental car booking.'}</div></div></div>
      ) : (
        grouped.map(([jobName, items]) => (
          <div key={jobName} className="card card-flush mb-8">
            <div style={{padding:'10px 14px 6px',borderBottom:'1px solid var(--bp-border)'}}>
              <span className="font-semibold color-navy">{jobName}</span>
              <span className="badge badge-blue ml-8" style={{fontSize:'10.5px'}}>{items.length} booking{items.length !== 1 ? 's' : ''}</span>
              <span className="mono text-sm color-muted ml-8">{fmtCurrency(items.reduce((s, b) => s + (b.cr55d_cost || 0), 0))}</span>
            </div>
            <table className="tbl">
              <thead><tr><th style={{width:'32px'}}></th><th>Type</th><th>Crew Member</th><th>Provider</th><th>Confirmation</th><th>Dates</th><th className="r">Cost</th><th>Status</th><th style={{width:'40px'}}></th></tr></thead>
              <tbody>
                {items.map(b => (
                  <tr key={b.cr55d_travelbookingid} className="row-interactive" onClick={() => openEdit(b)} style={{cursor:'pointer'}}>
                    <td style={{textAlign:'center',fontSize:'15px'}}>{BOOKING_TYPE_ICONS[b.cr55d_type] || '\u2708'}</td>
                    <td className="font-semibold">{BOOKING_TYPES[b.cr55d_type] || 'Other'}</td>
                    <td>{b.cr55d_crewmember || '\u2014'}</td>
                    <td>{b.cr55d_provider || '\u2014'}</td>
                    <td className="mono text-md">{b.cr55d_confirmationnumber || '\u2014'}</td>
                    <td className="mono text-md">
                      {shortDate(b.cr55d_startdate?.split('T')[0])}
                      {b.cr55d_enddate && <span className="color-muted"> \u2192 {shortDate(b.cr55d_enddate?.split('T')[0])}</span>}
                    </td>
                    <td className="mono r">{b.cr55d_cost ? fmtCurrency(b.cr55d_cost) : '\u2014'}</td>
                    <td><span className={`badge ${BOOKING_STATUS_BADGE[b.cr55d_status] || 'badge-sand'}`}>{BOOKING_STATUSES[b.cr55d_status] || 'Unknown'}</span></td>
                    <td style={{textAlign:'center'}}><span className="color-muted text-md">\u270E</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay open" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'580px'}}>
            <div className="modal-header">
              <h3>{editId ? `Edit ${typeLabel} Booking` : `New Booking`}</h3>
              <button className="modal-close" onClick={closeModal}>\u00D7</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <div>
                <label className="form-label">Booking Type</label>
                <select className="form-input" value={form.cr55d_type} onChange={e => updateForm('cr55d_type', Number(e.target.value))}>
                  {Object.entries(BOOKING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.cr55d_status} onChange={e => updateForm('cr55d_status', Number(e.target.value))}>
                  {Object.entries(BOOKING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Job</label>
                <select className="form-input" value={form.cr55d_jobname} onChange={e => {
                  const j = activeJobs.find(j => j.cr55d_jobname === e.target.value)
                  updateForm('cr55d_jobname', e.target.value)
                  if (j) updateForm('cr55d_jobid', j.cr55d_jobid)
                }}>
                  <option value="">Select a job...</option>
                  {activeJobs.map(j => <option key={j.cr55d_jobid} value={j.cr55d_jobname}>{j.cr55d_jobname}{j.cr55d_clientname ? ` \u2014 ${j.cr55d_clientname}` : ''}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Crew Member</label>
                {crewNames.length > 0 ? (
                  <select className="form-input" value={form.cr55d_crewmember} onChange={e => updateForm('cr55d_crewmember', e.target.value)}>
                    <option value="">Select crew member...</option>
                    {crewNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={form.cr55d_crewmember} onChange={e => updateForm('cr55d_crewmember', e.target.value)} placeholder="Crew member name" />
                )}
              </div>
              <div>
                <label className="form-label">Provider</label>
                <input className="form-input" value={form.cr55d_provider} onChange={e => updateForm('cr55d_provider', e.target.value)} placeholder={Number(form.cr55d_type) === 306280000 ? 'e.g., United Airlines' : Number(form.cr55d_type) === 306280001 ? 'e.g., Hampton Inn' : 'e.g., Enterprise'} />
              </div>
              <div>
                <label className="form-label">Confirmation #</label>
                <input className="form-input" value={form.cr55d_confirmationnumber} onChange={e => updateForm('cr55d_confirmationnumber', e.target.value)} placeholder="ABC123" />
              </div>
              <div>
                <label className="form-label">{startLabel} Date</label>
                <input className="form-input" type="date" value={form.cr55d_startdate} onChange={e => updateForm('cr55d_startdate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">{endLabel} Date</label>
                <input className="form-input" type="date" value={form.cr55d_enddate} onChange={e => updateForm('cr55d_enddate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Cost ($)</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.cr55d_cost} onChange={e => updateForm('cr55d_cost', e.target.value)} placeholder="0.00" />
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.cr55d_notes} onChange={e => updateForm('cr55d_notes', e.target.value)} placeholder="Flight details, room type, vehicle class, etc." style={{resize:'vertical'}} />
              </div>
            </div>

            {/* Delete confirmation */}
            {confirmDelete && (
              <div className="callout callout-red mt-12">
                <span className="callout-icon">{'\u26A0'}</span>
                <div style={{flex:1}}>
                  <div className="font-semibold mb-4">Cancel this booking?</div>
                  <div className="text-md mb-8">This will mark the booking as cancelled.</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-sm" style={{background:'var(--bp-red)',color:'#fff',borderColor:'var(--bp-red)'}} disabled={saving} onClick={() => handleDelete(confirmDelete)}>{saving ? 'Cancelling...' : 'Confirm Cancel'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Keep Booking</button>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {editId && !confirmDelete && (
                <button className="btn btn-ghost btn-sm" style={{marginRight:'auto',color:'var(--bp-red)'}} onClick={() => setConfirmDelete(editId)}>Cancel Booking</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Close</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !form.cr55d_jobname || !form.cr55d_crewmember} onClick={handleSave}>{saving ? 'Saving...' : editId ? 'Update Booking' : 'Save Booking'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════════════════════════════
   VALIDATION GRID — 12 leaders × 7 days
   Crew needed vs assigned, CDL cascade checks, auto warnings
   ═══════════════════════════════════════════════════════════════════ */
function ValidationGrid({ weekDates, jobs, staff }) {
  // Derive leaders from Dataverse staff data (department 306280010 = Crew Leader), fallback to PMs
  const leaders = staff && staff.length > 0
    ? [...new Set(staff.filter(s => s.cr55d_islead || s.cr55d_department === 306280010).map(s => {
        const name = s.cr55d_name || ''
        // Handle "Last, First" format
        if (name.includes(',')) return name.split(',')[1]?.trim().split(' ')[0] || ''
        return name.split(' ')[0]
      }).filter(Boolean))]
    : PMS.map(n => n.split(' ')[0])

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
