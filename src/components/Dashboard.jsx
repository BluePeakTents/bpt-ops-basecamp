import { useState, useEffect, useMemo } from 'react'
import { dvFetch } from '../hooks/useDataverse'
import WeeklyOpsView from './WeeklyOpsView'
import { toLocalISO, shortDate, isoDate } from '../utils/dateUtils'
import { JOB_STATUS_MAP, STATUS_LABELS, STATUS_BADGE, EVENT_TYPES, ALL_OPS_FILTER, JOB_FIELDS, optionSet } from '../constants/dataverseFields'

/* ── Constants ─────────────────────────────────────────────────── */
const STAGES = {
  upcoming:   { label: 'Upcoming',    color: '#2563EB', bg: 'rgba(37,99,235,.06)' },
  loading:    { label: 'Loading',     color: '#1D3A6B', bg: 'rgba(29,58,107,.08)' },
  transit:    { label: 'In Transit',  color: '#2B4F8A', bg: 'rgba(43,79,138,.08)' },
  installing: { label: 'Installing',  color: '#7996AA', bg: 'rgba(121,150,170,.10)' },
  event:      { label: 'Event Day',   color: '#2E7D52', bg: 'rgba(46,125,82,.08)' },
  striking:   { label: 'Striking',    color: '#8B7355', bg: 'rgba(139,115,85,.08)' },
  returned:   { label: 'Returned',    color: '#6A87A0', bg: 'rgba(106,135,160,.08)' },
  complete:   { label: 'Complete',    color: '#6B7280', bg: '#F3F4F6' },
}
const STAGE_ORDER = ['upcoming','loading','transit','installing','event','striking','returned','complete']

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const FORTUNES = [
  "Every tent raised is a story told.",
  "Clear skies favor the prepared crew.",
  "The best installs happen before the deadline.",
  "A well-loaded truck is a happy truck.",
  "Measure twice, stake once.",
  "Today's prep is tomorrow's success.",
  "The mountain doesn't come to you — you go to the mountain.",
]

function fmtK(n) {
  if (!n) return '$0'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(1) + 'M'
  if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'K'
  return sign + '$' + Math.round(abs)
}

function getStageForJob(job) {
  const status = JOB_STATUS_MAP[Number(job.cr55d_jobstatus)]
  if (status === 'complete') return 'complete'
  // For all other jobs, derive stage from dates (including 'installing' status — dates take priority)
  const now = new Date()
  now.setHours(0,0,0,0)
  const install = job.cr55d_installdate ? new Date(job.cr55d_installdate.split('T')[0] + 'T00:00:00') : null
  const event = job.cr55d_eventdate ? new Date(job.cr55d_eventdate.split('T')[0] + 'T00:00:00') : null
  const strike = job.cr55d_strikedate ? new Date(job.cr55d_strikedate.split('T')[0] + 'T00:00:00') : null
  if (strike && now > strike) return 'returned'
  if (strike && now >= strike) return 'striking'
  if (event && now >= event) return 'event'
  if (install && now >= install) return 'installing'
  if (install) {
    const daysUntil = Math.ceil((install - now) / 86400000)
    if (daysUntil <= 1) return 'transit'
    if (daysUntil <= 3) return 'loading'
  }
  return 'upcoming'
}

function getWeekDays(baseDate) {
  const d = new Date(baseDate)
  const dayOfWeek = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1))
  return Array.from({length: 7}, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return { date, currentMonth: date.getMonth() === baseDate.getMonth() }
  })
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()
  const days = []

  // Previous month padding
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, currentMonth: false })
  }
  // Current month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), currentMonth: true })
  }
  // Next month padding
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), currentMonth: false })
  }
  return days
}

/* ── Component ─────────────────────────────────────────────────── */
export default function Dashboard({ onSelectJob }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [calView, setCalView] = useState('month')
  const [calDate, setCalDate] = useState(new Date())
  const [viewMode, setViewMode] = useState('split') // split, calendar, table, weekly
  const [weekDate, setWeekDate] = useState(new Date())
  const [error, setError] = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set(['loading','transit','installing','event','striking','returned','complete','invoiced']))

  function toggleGroup(stage) {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  useEffect(() => {
    loadJobs()
    // Live poll every 30s, only when tab is visible
    const poll = setInterval(() => { if (!document.hidden) loadJobs() }, 30000)
    const onVisible = () => { if (!document.hidden) loadJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(poll); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const data = await dvFetch(`cr55d_jobs?$select=${JOB_FIELDS}&$filter=${ALL_OPS_FILTER}&$orderby=cr55d_installdate asc&$top=500`)
      setJobs(data || [])
    } catch (e) {
      console.error('[Dashboard] Load failed:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  /* ── KPI Calculations ────────────────────────────────────────── */
  const now = new Date()
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const nowISO = toLocalISO(now)
  const weekISO = toLocalISO(weekEnd)

  const thisWeek = jobs.filter(j => {
    const d = isoDate(j.cr55d_installdate)
    return d && d >= nowISO && d <= weekISO
  })
  // "Installing" = jobs where today falls between install and strike dates (actually on site)
  const installing = jobs.filter(j => {
    const install = isoDate(j.cr55d_installdate)
    const strike = isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate)
    return install && strike && nowISO >= install && nowISO <= strike
  })
  const striking = jobs.filter(j => {
    const d = isoDate(j.cr55d_strikedate)
    return d && d >= nowISO && d <= weekISO
  })

  /* ── Filter Logic ────────────────────────────────────────────── */
  // "Scheduled" = invoiced or in-progress, not yet complete
  const scheduled = jobs.filter(j => optionSet(j.cr55d_jobstatus) === 408420001 || optionSet(j.cr55d_jobstatus) === 408420002)
  const pills = [
    { id: 'all', label: 'All', count: jobs.length },
    { id: 'scheduled', label: 'Scheduled', count: scheduled.length },
    { id: 'installing', label: 'Installing Now', count: installing.length },
    { id: 'complete', label: 'Complete', count: jobs.filter(j => optionSet(j.cr55d_jobstatus) === 408420003).length },
  ]

  const filtered = filter === 'all' ? jobs : jobs.filter(j => {
    if (filter === 'scheduled') return optionSet(j.cr55d_jobstatus) === 408420001 || optionSet(j.cr55d_jobstatus) === 408420002
    if (filter === 'installing') {
      const install = isoDate(j.cr55d_installdate)
      const strike = isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate)
      return install && strike && nowISO >= install && nowISO <= strike
    }
    if (filter === 'complete') return optionSet(j.cr55d_jobstatus) === 408420003
    return true
  })

  /* ── Stage-grouped jobs ──────────────────────────────────────── */
  const stageGroups = useMemo(() => {
    const groups = {}
    STAGE_ORDER.forEach(s => groups[s] = [])

    filtered.forEach(j => {
      const stage = getStageForJob(j)
      if (!groups[stage]) groups[stage] = []
      groups[stage].push(j)
    })

    return STAGE_ORDER.filter(s => groups[s].length > 0).map(s => ({
      stage: s,
      label: STAGES[s]?.label || s,
      color: STAGES[s]?.color || '#6B7280',
      bg: STAGES[s]?.bg || '#F3F4F6',
      jobs: groups[s]
    }))
  }, [filtered])

  /* ── Calendar data ───────────────────────────────────────────── */
  const calendarDays = getCalendarDays(calDate.getFullYear(), calDate.getMonth())
  const today = new Date(); today.setHours(0,0,0,0)

  function getJobsForDate(date) {
    const dateStr = toLocalISO(date)
    return jobs.filter(j => {
      const install = isoDate(j.cr55d_installdate)
      const event = isoDate(j.cr55d_eventdate)
      const strike = isoDate(j.cr55d_strikedate)
      // Only show on the specific milestone dates — not every day in between
      // This keeps the month calendar clean. Gantt/timeline view handles spans.
      return install === dateStr || event === dateStr || strike === dateStr
    })
  }

  function getEventType(job, dateStr) {
    const install = isoDate(job.cr55d_installdate)
    const event = isoDate(job.cr55d_eventdate)
    const strike = isoDate(job.cr55d_strikedate)
    if (dateStr === strike) return 'striking'
    if (dateStr === event) return 'event'
    if (dateStr === install) return 'installing'
    return 'upcoming'
  }

  const fortune = useMemo(() => FORTUNES[Math.floor(Math.random() * FORTUNES.length)], [])

  return (
    <div>
      {/* Header */}
      <div className="page-head flex-between">
        <div>
          <div className="greeting">{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}</div>
          <h1>Dashboard</h1>
          <div className="sub">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — {jobs.length} active jobs{installing.length > 0 ? `, ${installing.length} installing now` : ''}</div>
          <div className="page-head-accent"></div>
        </div>
        <div className="flex gap-6">
          <div className="flex gap-4">
            <button className={`pill pill-sm${viewMode === 'weekly' ? ' active' : ''}`} onClick={() => setViewMode('weekly')}>Weekly Ops</button>
            <button className={`pill pill-sm${viewMode === 'split' ? ' active' : ''}`} onClick={() => setViewMode('split')}>Split</button>
            <button className={`pill pill-sm${viewMode === 'calendar' ? ' active' : ''}`} onClick={() => setViewMode('calendar')}>Calendar</button>
            <button className={`pill pill-sm${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')}>Table</button>
          </div>
          <div style={{width:'1px',height:'20px',background:'var(--bp-border)'}}></div>
          {pills.map(p => (
            <button key={p.id} className={`pill${filter === p.id ? ' active' : ''}`} onClick={() => setFilter(p.id)}>
              {p.label}<span className="pill-count">{p.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row animate-in">
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-info-bg)',borderColor:'rgba(37,99,235,.12)'}}>📅</div>
          <div className="kpi-label">Jobs This Week</div>
          <div className="kpi-val">{thisWeek.length}</div>
          <div className="kpi-sub">{thisWeek.reduce((s, j) => s + (j.cr55d_quotedamount || 0), 0) > 0 ? fmtK(thisWeek.reduce((s, j) => s + (j.cr55d_quotedamount || 0), 0)) + ' value' : 'installing this week'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-amber-bg)',borderColor:'rgba(217,119,6,.12)'}}>🏗️</div>
          <div className="kpi-label">Active Installs</div>
          <div className="kpi-val">{installing.length}</div>
          <div className="kpi-sub">crews deployed</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-green-bg)',borderColor:'rgba(46,125,82,.12)'}}>🚚</div>
          <div className="kpi-label">Total Scheduled</div>
          <div className="kpi-val">{jobs.filter(j => optionSet(j.cr55d_jobstatus) === 408420001).length}</div>
          <div className="kpi-sub">upcoming jobs</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-red-bg)',borderColor:'rgba(192,57,43,.12)'}}>🔧</div>
          <div className="kpi-label">Striking This Week</div>
          <div className="kpi-val">{striking.length}</div>
          <div className="kpi-sub">removals scheduled</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-green-bg)',borderColor:'rgba(46,125,82,.12)'}}>✅</div>
          <div className="kpi-label">Completed {now.getFullYear()}</div>
          <div className="kpi-val">{jobs.filter(j => optionSet(j.cr55d_jobstatus) === 408420003).length}</div>
          <div className="kpi-sub">{fmtK(jobs.filter(j => optionSet(j.cr55d_jobstatus) === 408420003).reduce((s, j) => s + (j.cr55d_quotedamount || 0), 0))} delivered</div>
        </div>
      </div>

      {error && (
        <div className="callout callout-red mb-12 animate-in">
          <span className="callout-icon">⚠️</span>
          <div>
            <strong>Failed to load jobs from Dataverse.</strong> {error.includes('HTTP') ? 'The API may be unavailable.' : error}
            <button className="btn btn-ghost btn-xs" style={{marginLeft:'8px'}} onClick={() => { setError(null); loadJobs() }}>Retry</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card animate-in-1">
          <div className="loading-state">
            <div className="loading-spinner" style={{marginBottom:'12px'}}></div>
            Loading jobs from Dataverse...
          </div>
        </div>
      ) : (
        <>
          {/* Weekly Ops View */}
          {viewMode === 'weekly' && (
            <div className="animate-in-1">
              <WeeklyOpsView jobs={jobs} weekDate={weekDate} setWeekDate={setWeekDate} onSelectJob={onSelectJob} />
            </div>
          )}

          {/* Calendar View */}
          {(viewMode === 'split' || viewMode === 'calendar') && (
            <div className="card animate-in-1 mb-12">
              <div className="cal-header">
                <div className="cal-nav">
                  <button className="cal-nav-btn" onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}>‹</button>
                  <span className="cal-title">{MONTHS[calDate.getMonth()]} {calDate.getFullYear()}</span>
                  <button className="cal-nav-btn" onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}>›</button>
                  <button className="btn btn-ghost btn-sm" style={{marginLeft:'8px'}} onClick={() => setCalDate(new Date())}>Today</button>
                </div>
                <div className="flex gap-4">
                  {['month','week'].map(v => (
                    <button key={v} className={`pill pill-sm${calView === v ? ' active' : ''}`} onClick={() => setCalView(v)} style={{textTransform:'capitalize'}}>{v}</button>
                  ))}
                </div>
              </div>

              <div className="cal-grid">
                {DAYS.map(d => <div key={d} className="cal-day-header">{d}</div>)}
                {(calView === 'week' ? getWeekDays(calDate) : calendarDays).map((day, i) => {
                  const dateStr = toLocalISO(day.date)
                  const isToday = day.date.getTime() === today.getTime()
                  const dayJobs = getJobsForDate(day.date)
                  const maxShow = calView === 'week' ? 8 : viewMode === 'calendar' ? 4 : 3
                  return (
                    <div key={i} className={`cal-day${isToday ? ' today' : ''}${!day.currentMonth ? ' other-month' : ''}`} style={{minHeight: calView === 'week' ? '180px' : undefined}}>
                      <div className={`cal-date${isToday ? '' : ''}`}>
                        {isToday ? <span style={{background:'var(--bp-info)',color:'var(--bp-white)',borderRadius:'50%',width:'20px',height:'20px',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700}}>{day.date.getDate()}</span> : day.date.getDate()}
                      </div>
                      {dayJobs.slice(0, maxShow).map((j, ji) => {
                        const evtType = getEventType(j, dateStr)
                        return (
                          <div key={ji} className={`cal-event ${evtType}`} onClick={() => onSelectJob && onSelectJob(j)}
                            title={`${j.cr55d_clientname || ''} — ${j.cr55d_jobname || ''}`}>
                            {j.cr55d_clientname || j.cr55d_jobname || 'Job'}
                          </div>
                        )
                      })}
                      {dayJobs.length > maxShow && (
                        <div className="cal-more">+{dayJobs.length - maxShow} more</div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Stage legend — matches table groups exactly */}
              <div className="flex gap-16 mt-8" style={{justifyContent:'center',paddingTop:'8px',borderTop:'1px solid var(--bp-border-lt)',flexWrap:'wrap'}}>
                {STAGE_ORDER.map(key => (
                  <div key={key} className="flex gap-6" style={{fontSize:'11px',color:'var(--bp-text)',fontWeight:500}}>
                    <div style={{width:'10px',height:'10px',borderRadius:'50%',background:STAGES[key].color,flexShrink:0,marginTop:'2px'}}></div>
                    {STAGES[key].label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage-Grouped Table */}
          {(viewMode === 'split' || viewMode === 'table') && (
            <div className="animate-in-2">
              {filtered.length === 0 ? (
                <div className="card">
                  <div className="empty-state">
                    <div className="empty-state-icon">📅</div>
                    <div className="empty-state-title">No jobs found</div>
                    <div className="empty-state-sub">{filter === 'all' ? 'Jobs will appear here when invoiced from Sales Hub' : 'No jobs match this filter'}</div>
                  </div>
                </div>
              ) : (
                stageGroups.map((group, gi) => (
                  <div key={group.stage} className={`animate-in-${Math.min(gi + 1, 4)}`} style={{marginBottom:'6px'}}>
                    <div className="stage-header" style={{borderLeft:`3px solid ${group.color}`}} onClick={() => toggleGroup(group.stage)}>
                      <div className="stage-header-left">
                        <span className="stage-dot" style={{background:group.color}}></span>
                        <span className="stage-label">{group.label}</span>
                      </div>
                      <div className="stage-header-right">
                        <span className="stage-count" style={{color:group.color,background:group.bg}}>{group.jobs.length}</span>
                        <span className={`stage-chevron${collapsedGroups.has(group.stage) ? ' collapsed' : ''}`}>&#x25BE;</span>
                      </div>
                    </div>
                    {!collapsedGroups.has(group.stage) && (
                    <div className="card card-flush stage-body" style={{borderLeft:`3px solid ${group.color}`}}>
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th style={{width:'20%'}}>Job</th>
                            <th style={{width:'14%'}}>Client</th>
                            <th style={{width:'7%'}}>Type</th>
                            <th style={{width:'8%'}}>Install</th>
                            <th style={{width:'8%'}}>Event</th>
                            <th style={{width:'8%'}}>Strike</th>
                            <th style={{width:'8%',textAlign:'right'}}>Amount</th>
                            <th style={{width:'9%'}}>Status</th>
                            <th style={{width:'18%'}}>Venue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.jobs.map(j => (
                            <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                              <td style={{fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_jobname || 'Untitled'}</td>
                              <td>{j.cr55d_clientname || ''}</td>
                              <td><span style={{fontSize:'10px'}}>{EVENT_TYPES[Number(j.cr55d_eventtype)] || ''}</span></td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(isoDate(j.cr55d_installdate))}</td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(isoDate(j.cr55d_eventdate))}</td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(isoDate(j.cr55d_strikedate))}</td>
                              <td style={{textAlign:'right',fontFamily:'var(--bp-mono)',fontSize:'11px'}}>{j.cr55d_quotedamount ? '$' + Math.round(j.cr55d_quotedamount).toLocaleString() : ''}</td>
                              <td><span className={`badge ${STATUS_BADGE[optionSet(j.cr55d_jobstatus)] || 'badge-navy'}`}>{STATUS_LABELS[optionSet(j.cr55d_jobstatus)] || 'Scheduled'}</span></td>
                              <td style={{fontSize:'11px',color:'var(--bp-muted)'}} title={j.cr55d_venueaddress}>
                                <div className="truncate" style={{maxWidth:'160px'}}>{j.cr55d_venuename || ''}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Fortune */}
          <div className="fortune animate-in-3">{fortune}</div>
        </>
      )}
    </div>
  )
}
