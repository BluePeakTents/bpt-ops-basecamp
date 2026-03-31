import { useState, useEffect, useMemo, useRef } from 'react'
import { dvFetch, dvPatch, dvPost } from '../hooks/useDataverse'
import { parseCalendarFile } from '../utils/calendarImport'
import ManageEmployees from './ManageEmployees'
import { toLocalISO, getWeekDates, isoDate } from '../utils/dateUtils'
import { JOB_FIELDS, SCHEDULING_JOBS_FILTER } from '../constants/dataverseFields'

/* ── Sub-tab Components ────────────────────────────────────────── */
import PMCapacity from './scheduling/PMCapacity'
import DeliverySchedule from './scheduling/DeliverySchedule'
import TruckSchedule from './scheduling/TruckSchedule'
import CrewSchedule from './scheduling/CrewSchedule'
import ValidationGrid from './scheduling/ValidationGrid'
import LeaderSheet from './scheduling/LeaderSheet'
import EventTech from './scheduling/EventTech'
import TravelLodging from './scheduling/TravelLodging'

/* ── Constants ─────────────────────────────────────────────────── */
const PMS = [
  'Cristhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function formatWeekRange(dates) {
  if (!dates || dates.length < 7) return ''
  return `${formatDateShort(dates[0])} – ${formatDateShort(dates[6])}, ${dates[0].getFullYear()}`
}

/* ── Main Component (thin router) ─────────────────────────────── */
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
    window.__bptRefreshJobs = loadJobs
    return () => { clearTimeout(pollTimer); document.removeEventListener('visibilitychange', onVisible); delete window.__bptRefreshJobs }
  }, [])

  async function loadJobs() {
    if (initialLoadRef.current) setLoading(true)
    try {
      const data = await dvFetch(`cr55d_jobs?$select=${JOB_FIELDS},cr55d_crewleader&$filter=${SCHEDULING_JOBS_FILTER}&$orderby=cr55d_installdate asc&$top=300`)
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
    const prevJobs = jobs
    setJobs(prev => prev.map(j => j.cr55d_jobid === jobId ? { ...j, cr55d_pmassigned: pmName } : j))
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      await dvPatch(`cr55d_jobs(${safeId})`, { cr55d_pmassigned: pmName })
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
      setJobs(prevJobs)
      setError(`Failed to assign PM: ${e.message}`)
    } finally {
      setAssigning(false)
    }
  }

  /* ── Sub-tab order per v12 spec ────────────────────────────────── */
  const tabs = [
    { id: 'pm',         label: 'PM Capacity',       icon: '📊' },
    { id: 'delivery',   label: 'Delivery Schedule',  icon: '📦' },
    { id: 'truck',      label: 'Truck Schedule',     icon: '🚚' },
    { id: 'crew',       label: 'Crew Schedule',      icon: '👥' },
    { id: 'validation', label: 'Validation',         icon: '✅' },
    { id: 'leader',     label: 'Leader Sheet',       icon: '📋' },
    { id: 'eventtech',  label: 'Event Tech',         icon: '🎤' },
    { id: 'travel',     label: 'Travel / Lodging',   icon: '✈️' },
  ]

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Scheduling</h1><div className="sub">Weekly workflow: PMs → Delivery → Trucks → Crew → Validation</div><div className="page-head-accent"></div></div>
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
                  console.log(`[Calendar Import] ${imported.length} entries imported`)
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

      <div className="flex gap-6 mb-16" style={{flexWrap:'wrap'}}>
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
          {subTab === 'delivery' && <DeliverySchedule weekDates={weekDates} jobs={jobs} staff={staff} onSelectJob={onSelectJob} />}
          {subTab === 'truck' && <TruckSchedule weekDates={weekDates} jobs={jobs} />}
          {subTab === 'crew' && <CrewSchedule weekDates={weekDates} staff={staff} departments={departments} onRefreshStaff={loadStaff} />}
          {subTab === 'validation' && <ValidationGrid weekDates={weekDates} jobs={jobs} staff={staff} />}
          {subTab === 'leader' && <LeaderSheet jobs={jobs} staff={staff} weekDates={weekDates} onSelectJob={onSelectJob} />}
          {subTab === 'eventtech' && <EventTech staff={staff} jobs={jobs} weekDates={weekDates} onSelectJob={onSelectJob} />}
          {subTab === 'travel' && <TravelLodging jobs={jobs} staff={staff} />}
        </>
      )}
      <ManageEmployees open={showManageModal} onClose={() => setShowManageModal(false)} onRefresh={loadStaff} />
    </div>
  )
}
