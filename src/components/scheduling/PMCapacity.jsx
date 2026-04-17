import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch, dvPost } from '../../hooks/useDataverse'
import { toLocalISO, isoDate, shortDate } from '../../utils/dateUtils'
import workersAvailable2026 from '../../data/workersAvailable2026.json'

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

function getPMInitials(name) {
  return name.split(' ').map(n => n[0]).join('')
}

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

/* ── Component ─────────────────────────────────────────────────── */
export default function PMCapacity({ weekDates, jobs, unassignedJobs, assignedJobs, getJobsForPM, jobOverlapsWeek, jobOnDate, handleAssignPM, onSelectJob, assigning, pmList }) {
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
  const [workersAvailableOverrides, setWorkersAvailableOverrides] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bp_workers_overrides') || '{}') } catch { return {} }
  })
  const [cellEdits, setCellEdits] = useState({})
  const [hoveredChip, setHoveredChip] = useState(null)
  const [dragOverCell, setDragOverCell] = useState(null)
  const [jumpToDate, setJumpToDate] = useState(null) // pending date to scroll to after month change
  const [monthViewAnchor, setMonthViewAnchor] = useState(null) // null = today
  const [pendingAction, setPendingAction] = useState(null) // { type, message, detail, onConfirm }
  const [activityLog, setActivityLog] = useState([])
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [holidays, setHolidays] = useState({}) // dateStr → name
  const [tempWorkers, setTempWorkers] = useState([]) // [{startdate, enddate, headcount}]
  const [slotChoice, setSlotChoice] = useState(null) // { jobId, jobName, pmName, previousPM }
  const [scheduleDays, setScheduleDays] = useState({}) // jobId → Set<dateStr>
  const [dateMismatches, setDateMismatches] = useState({}) // jobId → { field, oldVal, newVal }

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

  /* ── Rolling 5-week view for month mode (anchored week + next 4) */
  const monthViewWeeks = useMemo(() => {
    const anchor = monthViewAnchor || new Date()
    const dow = anchor.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const anchorMonday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + mondayOffset)
    const weeks = []
    for (let w = 0; w < 5; w++) {
      const weekDays = []
      for (let d = 0; d < 7; d++) {
        const dt = new Date(anchorMonday)
        dt.setDate(anchorMonday.getDate() + w * 7 + d)
        weekDays.push(dt)
      }
      weeks.push(weekDays)
    }
    return weeks
  }, [monthViewAnchor])

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

  // Persist worker overrides to localStorage
  useEffect(() => { localStorage.setItem('bp_workers_overrides', JSON.stringify(workersAvailableOverrides)) }, [workersAvailableOverrides])

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
    // Use Excel-sourced availability first (from 2026 PM Calendar spreadsheet)
    const dateStr = toLocalISO(date)
    if (workersAvailable2026[dateStr]) return workersAvailable2026[dateStr]
    // Fallback for dates not in the Excel data
    const dow = date.getDay()
    if (dow === 0) return 32
    if (dow === 6) return 34
    return 40
  }

  function getWorkersAvailable(dateStr) {
    // Manual override takes priority
    if (workersAvailableOverrides[dateStr] !== undefined) return workersAvailableOverrides[dateStr]
    // Holiday override
    if (holidays[dateStr]) return holidays[dateStr].workersAvailable
    // Base workers from Excel data or day-of-week fallback
    const date = new Date(dateStr + 'T12:00:00')
    let base = getDefaultWorkersAvailable(date)
    // Add temp workers active on this date
    tempWorkers.forEach(tw => {
      if (!tw.cr55d_startdate || !tw.cr55d_enddate) return
      const start = tw.cr55d_startdate.split('T')[0]
      const end = tw.cr55d_enddate.split('T')[0]
      if (dateStr >= start && dateStr <= end) base += (tw.cr55d_headcount || 0)
    })
    return base
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

          // Non-contiguous: if this job has schedule day records, only show on those dates
          const jobDays = scheduleDays[j.cr55d_jobid]
          const event = isoDate(j.cr55d_eventdate) || ''
          if (jobDays && jobDays.size > 0) {
            if (!jobDays.has(dateStr)) return // skip dates not in schedule
          } else {
            if (dateStr < install || dateStr > strike) return // outside range
            // Long-duration jobs (>14 days): only show on install, event, and strike days
            const spanMs = new Date(strike + 'T12:00:00') - new Date(install + 'T12:00:00')
            const spanDays = Math.round(spanMs / 86400000)
            if (spanDays > 14) {
              if (dateStr !== install && dateStr !== strike && dateStr !== event) return
            }
          }

          const isStrikeDay = dateStr === strike && dateStr !== install
          const isSoftHold = Number(j.cr55d_jobstatus) === 306280001
          const timeslot = j.cr55d_timeslot || ''
          const slotInfo = {
            workers: j.cr55d_crewcount || 4, // default 4 crew if not set
            acctMgr: salesRepToInitials(j.cr55d_salesrep),
            desc: (j.cr55d_clientname || j.cr55d_jobname || '').trim(),
            jobId: j.cr55d_jobid,
            auto: true,
            isStrike: isStrikeDay,
            isInstall: dateStr === install,
            isSoftHold,
            timeslot,
          }
          // Respect timeslot preference
          if (timeslot === 'AM') {
            if (!data[dateStr].am[pmName]) data[dateStr].am[pmName] = slotInfo
          } else if (timeslot === 'PM') {
            if (!data[dateStr].pm[pmName]) data[dateStr].pm[pmName] = slotInfo
          } else {
            // Full Day or unset: fill AM first, then PM
            if (!data[dateStr].am[pmName]) {
              data[dateStr].am[pmName] = slotInfo
            } else if (!data[dateStr].pm[pmName]) {
              data[dateStr].pm[pmName] = slotInfo
            } else {
              // 3+ jobs on same day — mark overflow on PM slot
              const existing = data[dateStr].pm[pmName]
              existing.overflow = (existing.overflow || 0) + 1
            }
          }
        })
      })
      // Also include jobs assigned to "Anyone" (one-off jobs)
      assigned.filter(j => j.cr55d_pmassigned === 'Anyone').forEach(j => {
        if (!j.cr55d_installdate) return
        const install = isoDate(j.cr55d_installdate)
        const strike = isoDate(j.cr55d_strikedate) || install
        if (dateStr < install || dateStr > strike) return
        const slotInfo = {
          workers: j.cr55d_crewcount || 4,
          acctMgr: salesRepToInitials(j.cr55d_salesrep),
          desc: (j.cr55d_clientname || j.cr55d_jobname || '').trim(),
          jobId: j.cr55d_jobid, auto: true,
          isStrike: dateStr === strike && dateStr !== install,
          isInstall: dateStr === install,
          isSoftHold: Number(j.cr55d_jobstatus) === 306280001,
        }
        if (!data[dateStr].am['Anyone']) data[dateStr].am['Anyone'] = slotInfo
        else if (!data[dateStr].pm['Anyone']) data[dateStr].pm['Anyone'] = slotInfo
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
  }, [allDays, jobs, PMS_ACTIVE, cellEdits, scheduleDays])

  /* ── Multi-PM crew overlap blocking ────────────────────────── */
  // When a leader is assigned to another leader's crew schedule, they are unavailable as a PM
  const crewOverlaps = useMemo(() => {
    // Returns: { [pmName]: Set<dayOfWeek> } — days a PM is blocked
    // dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat (matching Date.getDay())
    const blocked = {}
    try {
      const crewData = JSON.parse(localStorage.getItem('bpt_crew_schedule') || '{}')
      if (!crewData || Object.keys(crewData).length === 0) return blocked

      // Crew schedule format: { [empId]: [mon, tue, wed, thu, fri, sat, sun] }
      // Array index 0=Mon(1), 1=Tue(2), ..., 5=Sat(6), 6=Sun(0)
      const IDX_TO_DOW = [1, 2, 3, 4, 5, 6, 0]

      for (const [empKey, empData] of Object.entries(crewData)) {
        if (!Array.isArray(empData)) continue
        const empName = String(empKey).toLowerCase()

        const matchedPM = PMS_ACTIVE.find(pm => {
          const first = pm.split(' ')[0].toLowerCase()
          const last = pm.split(' ').slice(1).join(' ').toLowerCase()
          return empName.includes(first) || empName.includes(last) || empName === pm.toLowerCase()
        })
        if (!matchedPM) continue

        const selfFirst = matchedPM.split(' ')[0].toLowerCase()
        for (let i = 0; i < Math.min(empData.length, 7); i++) {
          const val = (empData[i] || '').toLowerCase().trim()
          if (!val || val === 'off' || val === 'wh' || val === 'opt' || val === 'on-call' || val === 'tech' || val === selfFirst) continue
          if (!blocked[matchedPM]) blocked[matchedPM] = new Set()
          blocked[matchedPM].add(IDX_TO_DOW[i])
        }
      }
    } catch { /* localStorage unavailable */ }
    return blocked
  }, [PMS_ACTIVE])

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

  async function logSchedulingChange({ changeType, jobId, jobName, previousValue, newValue, description }) {
    try {
      await dvPost('cr55d_schedulingchanges', {
        cr55d_changetype1: changeType,
        cr55d_author: 'Ops Base Camp',
        'cr55d_JobRef@odata.bind': jobId ? `/cr55d_jobs(${jobId})` : undefined,
        cr55d_jobname: jobName || '',
        cr55d_previousvalue: previousValue || '',
        cr55d_newvalue: newValue || '',
        cr55d_description: description || '',
      })
    } catch (e) { console.error('[Audit] Log failed:', e) }
  }

  async function loadActivityLog() {
    try {
      const data = await dvFetch('cr55d_schedulingchanges?$select=cr55d_schedulingchangeid,cr55d_changetype1,cr55d_author,cr55d_jobname,cr55d_previousvalue,cr55d_newvalue,cr55d_description,createdon&$orderby=createdon desc&$top=50')
      setActivityLog(data || [])
    } catch (e) { console.error('[Activity] Load failed:', e) }
  }

  async function loadHolidays() {
    try {
      const data = await dvFetch('cr55d_holidays?$select=cr55d_holidayid,cr55d_name,cr55d_holidaydate,cr55d_workersavailable&$top=100')
      const map = {}
      ;(data || []).forEach(h => {
        if (h.cr55d_holidaydate) {
          const d = h.cr55d_holidaydate.split('T')[0]
          map[d] = { name: h.cr55d_name, workersAvailable: h.cr55d_workersavailable ?? 0 }
        }
      })
      setHolidays(map)
    } catch (e) { console.error('[Holidays] Load failed:', e) }
  }

  async function loadTempWorkers() {
    try {
      const data = await dvFetch('cr55d_tempworkers?$select=cr55d_tempworkerid,cr55d_companyname,cr55d_headcount,cr55d_startdate,cr55d_enddate&$top=100')
      setTempWorkers(data || [])
    } catch (e) { console.error('[TempWorkers] Load failed:', e) }
  }

  async function loadScheduleDays() {
    try {
      const data = await dvFetch('cr55d_jobscheduledays?$select=cr55d_jobscheduledayid,cr55d_scheduledate,cr55d_timeslot1,cr55d_daytype,cr55d_pmassigned,cr55d_crewcount,_cr55d_jobid_value&$top=1000')
      const map = {}
      ;(data || []).forEach(d => {
        const jobId = d._cr55d_jobid_value
        if (!jobId || !d.cr55d_scheduledate) return
        if (!map[jobId]) map[jobId] = new Set()
        map[jobId].add(d.cr55d_scheduledate.split('T')[0])
      })
      setScheduleDays(map)
    } catch (e) { /* table may not exist yet */ }
  }

  async function saveTimeslot(jobId, timeslot) {
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      await dvPatch(`cr55d_jobs(${safeId})`, { cr55d_timeslot: timeslot })
    } catch (e) { console.error('[Scheduling] Save timeslot failed:', e) }
  }

  // Detect date mismatches: recent scheduling changes where dates moved
  useEffect(() => {
    async function detectMismatches() {
      try {
        const changes = await dvFetch('cr55d_schedulingchanges?$select=cr55d_schedulingchangeid,cr55d_changetype1,cr55d_jobname,cr55d_previousvalue,cr55d_newvalue,cr55d_description,createdon&$filter=cr55d_changetype1 eq \'move\'&$orderby=createdon desc&$top=30')
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
        const recent = (changes || []).filter(c => new Date(c.createdon) >= weekAgo)
        const mm = {}
        for (const c of recent) {
          if (c.cr55d_previousvalue && c.cr55d_newvalue && c.cr55d_previousvalue !== c.cr55d_newvalue) {
            // Key by job name — scheduling changes store the display name used in chips
            const key = (c.cr55d_jobname || 'unknown').trim()
            mm[key] = { old: c.cr55d_previousvalue, new: c.cr55d_newvalue, desc: c.cr55d_description }
          }
        }
        setDateMismatches(mm)
      } catch { /* changes table may not have move entries */ }
    }
    detectMismatches()
  }, [])

  // Load holidays, temp workers, and schedule days on mount
  useEffect(() => { loadHolidays(); loadTempWorkers(); loadScheduleDays() }, [])

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

  function executeAssign(jobId, jobName, pmName, previousPM) {
    // Show slot choice popover instead of completing immediately
    setPendingAction(null)
    setSlotChoice({ jobId, jobName, pmName, previousPM })
  }

  function finalizeAssign(timeslot) {
    if (!slotChoice) return
    const { jobId, jobName, pmName, previousPM } = slotChoice
    handleAssignPM(jobId, pmName)
    saveTimeslot(jobId, timeslot)
    setSelectedJob(null)
    setSlotChoice(null)
    logSchedulingChange({
      changeType: previousPM ? 'move_pm' : 'assign_pm',
      jobId, jobName,
      previousValue: previousPM || '(unassigned)',
      newValue: `${pmName} (${timeslot})`,
      description: `${previousPM ? 'Moved' : 'Assigned'} ${jobName} to ${pmName} — ${timeslot}`,
    })
    showToast({
      message: `Assigned ${jobName} to ${pmName.split(' ')[0]} (${timeslot})`,
      type: 'success',
      undoFn: () => {
        handleAssignPM(jobId, previousPM || '')
        saveTimeslot(jobId, '')
        logSchedulingChange({
          changeType: 'unassign', jobId, jobName,
          previousValue: pmName, newValue: previousPM || '(unassigned)',
          description: `Undid assignment of ${jobName} to ${pmName}`,
        })
      }
    })
  }

  function handleDrop(e, pmName, dateStr, half) {
    e.preventDefault()
    setDragOverCell(null)
    const jobId = e.dataTransfer.getData('jobId')
    const sourcePM = e.dataTransfer.getData('sourcePM')
    if (!jobId || assigning) return
    const droppedJob = [...unassignedJobs, ...assignedJobs].find(j => j.cr55d_jobid === jobId)
    const jobName = droppedJob?.cr55d_clientname || droppedJob?.cr55d_jobname || 'Job'
    setPendingAction({
      type: sourcePM ? 'move' : 'assign',
      message: sourcePM ? `Move "${jobName}" from ${sourcePM.split(' ')[0]} to ${pmName.split(' ')[0]}?` : `Assign "${jobName}" to ${pmName.split(' ')[0]}?`,
      detail: `${shortDate(isoDate(droppedJob?.cr55d_installdate))} → ${shortDate(isoDate(droppedJob?.cr55d_strikedate) || isoDate(droppedJob?.cr55d_eventdate))}`,
      onConfirm: () => executeAssign(jobId, jobName, pmName, sourcePM || droppedJob?.cr55d_pmassigned || ''),
    })
  }

  function handleOneClickAssign(job, pmName) {
    if (assigning) return
    const jobName = job.cr55d_clientname || job.cr55d_jobname || 'Job'
    setPendingAction({
      type: 'assign',
      message: `Assign "${jobName}" to ${pmName.split(' ')[0]}?`,
      detail: `${shortDate(isoDate(job.cr55d_installdate))} → ${shortDate(isoDate(job.cr55d_strikedate) || isoDate(job.cr55d_eventdate))}`,
      onConfirm: () => executeAssign(job.cr55d_jobid, jobName, pmName, job.cr55d_pmassigned || ''),
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
      borderLeft: '3px solid var(--bp-navy)',
    },
    chipStrike: {
      background: 'rgba(182,162,130,.2)', color: '#6B5A3E', border: '1px solid rgba(182,162,130,.3)',
      borderLeft: '3px solid #B6A282',
    },
    chipSoftHold: {
      background: 'rgba(217,119,6,.06)', color: '#92400e', border: '1px solid rgba(217,119,6,.18)',
      borderLeft: '3px solid #D97706',
    },
    chipOther: {
      background: 'rgba(107,114,128,.08)', color: 'var(--bp-muted)', border: '1px solid rgba(107,114,128,.15)',
    },
    repBadge: {
      fontSize: '9px', fontWeight: 700, padding: '0 4px', borderRadius: '4px',
      background: 'rgba(107,114,128,.12)', color: 'var(--bp-muted)', flexShrink: 0,
      fontFamily: 'var(--bp-mono)',
    },
    chipMismatch: {
      boxShadow: '0 0 0 2px rgba(220,38,38,.5)',
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

        {/* ── Date Mismatch Warnings ──────────────────────── */}
        {Object.keys(dateMismatches).length > 0 && (
          <div className="callout callout-red mb-8" style={{padding:'8px 14px'}}>
            <span className="callout-icon">⚠️</span>
            <div>
              <strong>{Object.keys(dateMismatches).length} job{Object.keys(dateMismatches).length !== 1 ? 's' : ''} with date changes this week.</strong>{' '}
              {Object.entries(dateMismatches).slice(0, 3).map(([name, m]) => (
                <span key={name} style={{display:'inline-block',marginRight:'12px',fontSize:'11px'}}>
                  <strong>{name}</strong>: {m.old} → {m.new}
                </span>
              ))}
              {Object.keys(dateMismatches).length > 3 && <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>+{Object.keys(dateMismatches).length - 3} more</span>}
            </div>
          </div>
        )}

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

            {/* Rolling 5-week nav in month view */}
            {viewMode === 'month' && (
              <>
                <button style={styles.navBtn} onClick={() => setMonthViewAnchor(prev => {
                  const d = new Date(prev || new Date())
                  d.setDate(d.getDate() - 35)
                  return d
                })} title="Previous 5 weeks">&lsaquo;</button>
                <span style={styles.monthLabel}>
                  {formatDateShort(monthViewWeeks[0][0])} &ndash; {formatDateShort(monthViewWeeks[4][6])}
                </span>
                <button style={styles.navBtn} onClick={() => setMonthViewAnchor(prev => {
                  const d = new Date(prev || new Date())
                  d.setDate(d.getDate() + 35)
                  return d
                })} title="Next 5 weeks">&rsaquo;</button>
              </>
            )}

            <button style={styles.todayBtn} onClick={() => { goToday(); setCurrentWeekIdx(null); setMonthViewAnchor(null) }}>Today</button>
            <button style={{...styles.todayBtn, marginLeft: '4px'}} onClick={() => { setShowActivityLog(true); loadActivityLog() }}>Activity</button>

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
                          ...(Number(j.cr55d_jobstatus) === 306280001 ? { borderColor: 'rgba(220,38,38,.3)', background: 'rgba(220,38,38,.03)' } : {}),
                        }}
                        draggable="true"
                        onDragStart={e => {
                          e.dataTransfer.setData('jobId', j.cr55d_jobid)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedJob(null)
                            setMonthViewAnchor(null) // reset to today
                          } else {
                            setSelectedJob(j)
                            // Auto-navigate calendar to the job's install date
                            const raw = j.cr55d_installdate
                            console.log('[PM Capacity] Job clicked:', j.cr55d_clientname || j.cr55d_jobname, 'installdate:', raw)
                            if (raw) {
                              const jobDate = new Date(raw.split('T')[0] + 'T12:00:00')
                              console.log('[PM Capacity] Navigating to:', jobDate.toISOString(), 'viewMode:', viewMode)
                              if (jobDate.getFullYear() >= 2024) {
                                // Navigate both views to the job date
                                setMonthViewAnchor(new Date(jobDate))
                                setCurrentMonth(new Date(jobDate.getFullYear(), jobDate.getMonth(), 1))
                                setJumpToDate(new Date(jobDate))
                                setToast({ message: `Jumped to ${jobDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, type: 'info' })
                                setTimeout(() => setToast(null), 3000)
                              }
                            } else {
                              setToast({ message: 'No install date set for this job', type: 'info' })
                              setTimeout(() => setToast(null), 3000)
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
                          {Number(j.cr55d_jobstatus) === 306280001 && (
                            <span className="badge text-sm" style={{ padding: '2px 7px', background: 'rgba(217,119,6,.1)', color: '#92400e', border: '1px solid rgba(217,119,6,.25)' }}>
                              SOFT HOLD
                            </span>
                          )}
                          {j.cr55d_crewcount && (
                            <span className="badge text-sm" style={{ padding: '2px 7px', background: 'var(--bp-navy)', color: 'var(--bp-ivory)' }}>
                              {j.cr55d_crewcount} crew
                            </span>
                          )}
                          {j.cr55d_salesrep && (
                            <span className="text-sm font-mono color-muted">{salesRepToInitials(j.cr55d_salesrep)}</span>
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

        {/* ── Confirmation Banner ──────────────────────── */}
        {pendingAction && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'rgba(217,119,6,.08)', borderBottom: '2px solid var(--bp-amber)',
            fontSize: '12px', fontWeight: 600, color: 'var(--bp-text)', fontFamily: 'var(--bp-font)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>&#9888;</span>
              <span>{pendingAction.message}</span>
              {pendingAction.detail && <span className="text-md color-muted" style={{ fontWeight: 400 }}>{pendingAction.detail}</span>}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="text-md font-bold"
                style={{ padding: '4px 14px', borderRadius: '6px', border: '1px solid var(--bp-green)', background: 'var(--bp-green)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--bp-font)' }}
                onClick={pendingAction.onConfirm}
              >
                Confirm
              </button>
              <button
                className="text-md font-semibold color-muted"
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--bp-border)', background: 'var(--bp-white)', cursor: 'pointer', fontFamily: 'var(--bp-font)' }}
                onClick={() => setPendingAction(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Slot Choice Popover ──────────────────────── */}
        {slotChoice && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', background: 'rgba(37,99,235,.06)', borderBottom: '2px solid var(--bp-blue)',
            fontSize: '12px', fontWeight: 600, color: 'var(--bp-navy)', fontFamily: 'var(--bp-font)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>🕐</span>
              <span>When should <strong>{slotChoice.jobName}</strong> be scheduled for <strong>{slotChoice.pmName.split(' ')[0]}</strong>?</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="text-md font-bold" style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--bp-navy)', background: 'var(--bp-navy)', color: 'var(--bp-ivory)', cursor: 'pointer', fontFamily: 'var(--bp-font)' }} onClick={() => finalizeAssign('AM')}>Morning</button>
              <button className="text-md font-bold" style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--bp-navy)', background: 'var(--bp-navy)', color: 'var(--bp-ivory)', cursor: 'pointer', fontFamily: 'var(--bp-font)' }} onClick={() => finalizeAssign('PM')}>Afternoon</button>
              <button className="text-md font-bold" style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--bp-blue)', background: 'var(--bp-blue)', color: '#fff', cursor: 'pointer', fontFamily: 'var(--bp-font)' }} onClick={() => finalizeAssign('Full Day')}>Full Day</button>
              <button className="text-md font-semibold color-muted" style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--bp-border)', background: 'var(--bp-white)', cursor: 'pointer', fontFamily: 'var(--bp-font)' }} onClick={() => setSlotChoice(null)}>Cancel</button>
            </div>
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
                      {!monthViewAnchor && wi === 0 && <div className="text-sm font-bold" style={{ color: 'var(--bp-blue)', marginBottom: '2px' }}>This Week</div>}
                      {!monthViewAnchor && wi === 1 && <div className="text-sm font-bold color-muted" style={{ marginBottom: '2px' }}>Next Week</div>}
                      {monthViewAnchor && wi === 0 && <div className="text-sm font-bold" style={{ color: 'var(--bp-blue)', marginBottom: '2px' }}>Install Week</div>}
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
                    const holiday = holidays[dateStr]
                    const available = getWorkersAvailable(dateStr)
                    const cap = capacityData[dateStr]
                    const dailyPct = cap?.daily?.pct || 0

                    return (
                      <div key={di} style={{
                        ...styles.dayHeader,
                        ...(isToday ? styles.dayHeaderToday : {}),
                        ...(isWeekend ? styles.dayHeaderWeekend : {}),
                        ...(holiday ? { color: 'var(--bp-amber)', background: 'rgba(217,119,6,.06)' } : {}),
                      }}>
                        <div className="text-md font-bold">{DAY_NAMES[dow]}</div>
                        <div className="text-md font-medium" style={{ marginTop: '1px' }}>{formatDateShort(date)}</div>
                        {holiday && <div className="text-2xs font-bold" style={{color:'var(--bp-amber)',marginTop:'1px'}}>{holiday.name}</div>}
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
                          {cap?.daily?.needed || 0}/{available} <span style={{fontSize:'9px'}}>({dailyPct}%)</span>
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
                          {crewOverlaps[pm] && <div style={{fontSize:'8px',color:'var(--bp-red)',fontWeight:600}}>ON CREW {crewOverlaps[pm].size}d</div>}
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
                        const isCrewBlocked = crewOverlaps[pm]?.has(date.getDay())
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
                            ...(isCrewBlocked && !amSlot && !pmSlot ? { background: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(220,38,38,.04) 4px,rgba(220,38,38,.04) 8px)' } : {}),
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
                                draggable="true"
                                onDragStart={e => {
                                  e.stopPropagation()
                                  e.dataTransfer.setData('jobId', amSlot.jobId)
                                  e.dataTransfer.setData('sourcePM', pm)
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                style={{
                                  ...styles.chip,
                                  ...(amSlot.isSoftHold ? styles.chipSoftHold : amSlot.isStrike ? styles.chipStrike : amSlot.isInstall ? styles.chipInstall : styles.chipOther),
                                  ...(hoveredChip === `${dateStr}|am|${pm}` ? styles.chipHovered : {}),
                                  ...(dateMismatches[amSlot.desc] ? styles.chipMismatch : {}),
                                  cursor: 'grab',
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
                                title={`AM: ${amSlot.desc}${amSlot.acctMgr ? ' (' + amSlot.acctMgr + ')' : ''} - ${amSlot.workers} crew${amSlot.isSoftHold ? ' [SOFT HOLD]' : ''}${dateMismatches[amSlot.desc] ? ' ⚠ DATE CHANGED: was ' + dateMismatches[amSlot.desc].old + ', now ' + dateMismatches[amSlot.desc].new : ''} (drag to move)`}
                              >
                                {dateMismatches[amSlot.desc] && <span style={{color:'var(--bp-red)',fontSize:'11px',flexShrink:0}} title={`Date moved: ${dateMismatches[amSlot.desc].old} → ${dateMismatches[amSlot.desc].new}`}>⚠</span>}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{amSlot.desc}</span>
                                {amSlot.acctMgr && <span style={styles.repBadge}>{amSlot.acctMgr}</span>}
                                {amSlot.workers > 0 && (
                                  <span style={{
                                    ...styles.crewBadge,
                                    background: amSlot.isSoftHold ? 'rgba(217,119,6,.12)' : amSlot.isStrike ? 'rgba(182,162,130,.25)' : 'rgba(29,58,107,.15)',
                                    color: amSlot.isSoftHold ? '#92400e' : amSlot.isStrike ? '#6B5A3E' : 'var(--bp-navy)',
                                  }}>{amSlot.workers}</span>
                                )}
                              </div>
                            ) : (
                              <div style={styles.emptyCellHalf} title={`${pm.split(' ')[0]} - AM`}></div>
                            )}

                            {/* PM half */}
                            {pmSlot ? (
                              <div
                                draggable="true"
                                onDragStart={e => {
                                  e.stopPropagation()
                                  e.dataTransfer.setData('jobId', pmSlot.jobId)
                                  e.dataTransfer.setData('sourcePM', pm)
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                style={{
                                  ...styles.chip,
                                  ...(pmSlot.isSoftHold ? styles.chipSoftHold : pmSlot.isStrike ? styles.chipStrike : pmSlot.isInstall ? styles.chipInstall : styles.chipOther),
                                  ...(hoveredChip === `${dateStr}|pm|${pm}` ? styles.chipHovered : {}),
                                  ...(dateMismatches[pmSlot.desc] ? styles.chipMismatch : {}),
                                  cursor: 'grab',
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
                                title={`PM: ${pmSlot.desc}${pmSlot.acctMgr ? ' (' + pmSlot.acctMgr + ')' : ''} - ${pmSlot.workers} crew${pmSlot.isSoftHold ? ' [SOFT HOLD]' : ''}${dateMismatches[pmSlot.desc] ? ' ⚠ DATE CHANGED: was ' + dateMismatches[pmSlot.desc].old + ', now ' + dateMismatches[pmSlot.desc].new : ''} (drag to move)`}
                              >
                                {dateMismatches[pmSlot.desc] && <span style={{color:'var(--bp-red)',fontSize:'11px',flexShrink:0}} title={`Date moved: ${dateMismatches[pmSlot.desc].old} → ${dateMismatches[pmSlot.desc].new}`}>⚠</span>}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{pmSlot.desc}</span>
                                {pmSlot.acctMgr && <span style={styles.repBadge}>{pmSlot.acctMgr}</span>}
                                {pmSlot.workers > 0 && (
                                  <span style={{
                                    ...styles.crewBadge,
                                    background: pmSlot.isSoftHold ? 'rgba(217,119,6,.12)' : pmSlot.isStrike ? 'rgba(182,162,130,.25)' : 'rgba(29,58,107,.15)',
                                    color: pmSlot.isSoftHold ? '#92400e' : pmSlot.isStrike ? '#6B5A3E' : 'var(--bp-navy)',
                                  }}>{pmSlot.workers}</span>
                                )}
                                {pmSlot.overflow > 0 && (
                                  <span title={`${pmSlot.overflow} more job${pmSlot.overflow > 1 ? 's' : ''} hidden — PM is triple-booked`} style={{fontSize:'9px',fontWeight:700,color:'var(--bp-red)',flexShrink:0}}>+{pmSlot.overflow}</span>
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

                {/* "Anyone" row — for one-off jobs that don't need a specific PM */}
                <div style={{
                  ...styles.pmRow,
                  gridTemplateColumns: gridCols,
                  background: 'rgba(121,150,170,.04)',
                  borderTop: '2px dashed var(--bp-border)',
                }}>
                  <div style={styles.pmLabel}>
                    <div style={{...styles.avatar, background:'rgba(121,150,170,.15)',color:'var(--bp-muted)',fontSize:'10px'}}>?</div>
                    <div>
                      <div style={styles.pmName}>Anyone</div>
                      <div style={{fontSize:'8px',color:'var(--bp-light)'}}>One-off jobs</div>
                    </div>
                  </div>
                  {weekDays.map((date, di) => {
                    const dateStr = toLocalISO(date)
                    const anyoneSlot = (slotData[dateStr]?.am || {})['Anyone'] || (slotData[dateStr]?.pm || {})['Anyone']
                    return (
                      <div key={di} style={{...styles.dayCell, opacity:.7}}
                        onClick={() => { if (selectedJob) handleAssignPM(selectedJob.cr55d_jobid, 'Anyone') }}>
                        {anyoneSlot ? (
                          <div style={{...styles.chip,...styles.chipOther,fontSize:'10px'}}>
                            <span style={{overflow:'hidden',textOverflow:'ellipsis',flex:1}}>{anyoneSlot.desc}</span>
                          </div>
                        ) : (
                          <div style={{...styles.emptyCellHalf,borderStyle:'dashed'}} title="Anyone — drop a one-off job here"></div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Week Summary Bar */}
                <div style={styles.summaryBar}>
                  <div>
                    <span style={styles.summaryLabel}>Crew Needed </span>
                    <span style={styles.summaryValue}>{summary.needed}</span>
                  </div>
                  <div>
                    <span style={styles.summaryLabel}>Total Avail </span>
                    <span style={styles.summaryValue}>{summary.available}</span>
                  </div>
                  <div>
                    <span style={styles.summaryLabel}>Remaining </span>
                    <span style={{...styles.summaryValue, color: summary.available - summary.needed < 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{summary.available - summary.needed}</span>
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

      {/* Activity Log Slide-over */}
      {showActivityLog && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '360px', background: 'var(--bp-white)', boxShadow: '-4px 0 24px rgba(0,0,0,.12)', zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: 'var(--bp-font)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--bp-border)', background: 'var(--bp-alt)' }}>
            <h3 className="text-lg font-bold color-navy" style={{ margin: 0 }}>Activity Log</h3>
            <button className="text-lg" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--bp-muted)' }} onClick={() => setShowActivityLog(false)}>&times;</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {activityLog.length === 0 ? (
              <div className="text-md color-muted" style={{ padding: '24px 16px', textAlign: 'center' }}>No activity recorded yet</div>
            ) : activityLog.map(entry => (
              <div key={entry.cr55d_schedulingchangeid} style={{ padding: '10px 16px', borderBottom: '1px solid var(--bp-border-lt)' }}>
                <div className="text-md font-semibold color-navy">{entry.cr55d_description || entry.cr55d_changetype1}</div>
                <div className="text-sm color-muted" style={{ marginTop: '2px' }}>
                  {entry.cr55d_jobname && <span>{entry.cr55d_jobname} &middot; </span>}
                  {entry.createdon && new Date(entry.createdon).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
                {entry.cr55d_previousvalue && entry.cr55d_newvalue && (
                  <div className="text-sm" style={{ marginTop: '4px', color: 'var(--bp-muted)' }}>
                    <span style={{ textDecoration: 'line-through' }}>{entry.cr55d_previousvalue}</span> &rarr; {entry.cr55d_newvalue}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
