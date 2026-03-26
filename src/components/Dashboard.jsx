import { useState, useEffect, useMemo } from 'react'
import { dvFetch } from '../hooks/useDataverse'

/* ── Constants ─────────────────────────────────────────────────── */
const STAGES = {
  loading:    { label: 'Loading',     color: '#6366F1', bg: '#E0E7FF' },
  transit:    { label: 'In Transit',  color: '#1D4ED8', bg: '#DBEAFE' },
  installing: { label: 'Installing', color: '#92400E', bg: '#FEF3C7' },
  event:      { label: 'Event Day',  color: '#065F46', bg: '#D1FAE5' },
  striking:   { label: 'Striking',   color: '#991B1B', bg: '#FEE2E2' },
  returned:   { label: 'Returned',   color: '#5B21B6', bg: '#EDE9FE' },
  complete:   { label: 'Complete',   color: '#374151', bg: '#F3F4F6' },
}

const JOB_STATUS_MAP = {
  408420000: 'quoted', 408420001: 'invoiced', 408420002: 'installing',
  408420003: 'complete', 408420004: 'cancelled', 408420005: 'sent', 306280001: 'softhold',
}
const STATUS_LABELS = { 408420001: 'Scheduled', 408420002: 'Installing', 408420003: 'Complete', 408420000: 'Quoted', 408420005: 'Sent', 306280001: 'Soft Hold' }
const STATUS_BADGE = { 408420001: 'badge-blue', 408420002: 'badge-amber', 408420003: 'badge-green', 408420000: 'badge-navy', 408420005: 'badge-sand', 306280001: 'badge-purple' }
const EVENT_TYPES = { 987650000: 'Wedding', 987650001: 'Corporate', 987650002: 'Social', 987650003: 'Festival', 987650004: 'Fundraiser', 306280000: 'Wedding', 306280001: 'Corporate', 306280002: 'Social', 306280003: 'Festival', 306280004: 'Fundraiser', 306280005: 'Construction' }

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

/* ── Helpers ───────────────────────────────────────────────────── */
function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0') + '/' + dt.getFullYear()
}

function shortDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}`
}

function fmtK(n) {
  if (!n) return '$0'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K'
  return '$' + Math.round(n)
}

function getStageForJob(job) {
  const status = JOB_STATUS_MAP[job.cr55d_jobstatus]
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
  return 'invoiced'
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
  const [viewMode, setViewMode] = useState('split') // split, calendar, table
  const [error, setError] = useState(null)

  useEffect(() => { loadJobs() }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const fields = 'cr55d_jobid,cr55d_jobname,cr55d_clientname,cr55d_eventdate,cr55d_installdate,cr55d_strikedate,cr55d_quotedamount,cr55d_venuename,cr55d_venueaddress,cr55d_salesrep,cr55d_jobstatus,cr55d_eventtype,cr55d_juliestatus,cr55d_permitstatus'
      const data = await dvFetch(`cr55d_jobs?$select=${fields}&$filter=cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002 or cr55d_jobstatus eq 408420003&$orderby=cr55d_installdate asc&$top=200`)
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
    const d = j.cr55d_installdate?.split('T')[0]
    return d && d >= nowISO && d <= weekISO
  })
  const installing = jobs.filter(j => j.cr55d_jobstatus === 408420002)
  const striking = jobs.filter(j => {
    const d = j.cr55d_strikedate?.split('T')[0]
    return d && d >= nowISO && d <= weekISO
  })
  const overnights = jobs.filter(j => {
    const d = j.cr55d_eventdate?.split('T')[0]
    if (!d) return false
    const dt = new Date(d + 'T12:00:00')
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear()
    // placeholder: would need distance logic for true overnight detection
  })

  /* ── Filter Logic ────────────────────────────────────────────── */
  const pills = [
    { id: 'all', label: 'All', count: jobs.length },
    { id: 'invoiced', label: 'Scheduled', count: jobs.filter(j => j.cr55d_jobstatus === 408420001).length },
    { id: 'installing', label: 'Installing', count: installing.length },
    { id: 'complete', label: 'Complete', count: jobs.filter(j => j.cr55d_jobstatus === 408420003).length },
  ]

  const filtered = filter === 'all' ? jobs : jobs.filter(j => {
    const st = JOB_STATUS_MAP[j.cr55d_jobstatus] || ''
    return st === filter
  })

  /* ── Stage-grouped jobs ──────────────────────────────────────── */
  const stageGroups = useMemo(() => {
    const groups = {}
    const stageOrder = ['loading','transit','installing','event','striking','returned','complete','invoiced']
    stageOrder.forEach(s => groups[s] = [])

    filtered.forEach(j => {
      const stage = getStageForJob(j)
      if (!groups[stage]) groups[stage] = []
      groups[stage].push(j)
    })

    return stageOrder.filter(s => groups[s].length > 0).map(s => ({
      stage: s,
      label: s === 'invoiced' ? 'Upcoming' : (STAGES[s]?.label || s),
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
      const install = j.cr55d_installdate?.split('T')[0]
      const event = j.cr55d_eventdate?.split('T')[0]
      const strike = j.cr55d_strikedate?.split('T')[0]
      if (install === dateStr || event === dateStr || strike === dateStr) return true
      // Show jobs spanning install-to-strike
      if (install && strike && dateStr >= install && dateStr <= strike) return true
      return false
    })
  }

  function getEventType(job, dateStr) {
    const install = job.cr55d_installdate?.split('T')[0]
    const event = job.cr55d_eventdate?.split('T')[0]
    const strike = job.cr55d_strikedate?.split('T')[0]
    if (dateStr === strike) return 'striking'
    if (dateStr === event) return 'event'
    if (dateStr === install) return 'installing'
    return 'invoiced'
  }

  const fortune = useMemo(() => FORTUNES[Math.floor(Math.random() * FORTUNES.length)], [])

  return (
    <div>
      {/* Header */}
      <div className="page-head flex-between">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Daily command center — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div className="flex gap-6">
          <div className="flex gap-4">
            <button className={`pill${viewMode === 'split' ? ' active' : ''}`} onClick={() => setViewMode('split')} style={{fontSize:'10px',padding:'4px 10px'}}>Split</button>
            <button className={`pill${viewMode === 'calendar' ? ' active' : ''}`} onClick={() => setViewMode('calendar')} style={{fontSize:'10px',padding:'4px 10px'}}>Calendar</button>
            <button className={`pill${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')} style={{fontSize:'10px',padding:'4px 10px'}}>Table</button>
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
          <div className="kpi-val">{jobs.filter(j => j.cr55d_jobstatus === 408420001).length}</div>
          <div className="kpi-sub">upcoming jobs</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'var(--bp-red-bg)',borderColor:'rgba(192,57,43,.12)'}}>🔧</div>
          <div className="kpi-label">Striking This Week</div>
          <div className="kpi-val">{striking.length}</div>
          <div className="kpi-sub">removals scheduled</div>
        </div>
        <div className="kpi">
          <div className="kpi-icon" style={{background:'rgba(29,58,107,.06)',borderColor:'rgba(29,58,107,.1)'}}>💰</div>
          <div className="kpi-label">Pipeline Value</div>
          <div className="kpi-val">{fmtK(jobs.reduce((s, j) => s + (j.cr55d_quotedamount || 0), 0))}</div>
          <div className="kpi-sub">{jobs.length} active jobs</div>
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
          {/* Calendar View */}
          {(viewMode === 'split' || viewMode === 'calendar') && (
            <div className="card animate-in-1" style={{padding:'14px',marginBottom:'12px'}}>
              <div className="cal-header">
                <div className="cal-nav">
                  <button className="cal-nav-btn" onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}>‹</button>
                  <span className="cal-title">{MONTHS[calDate.getMonth()]} {calDate.getFullYear()}</span>
                  <button className="cal-nav-btn" onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}>›</button>
                  <button className="btn btn-ghost btn-sm" style={{marginLeft:'8px'}} onClick={() => setCalDate(new Date())}>Today</button>
                </div>
                <div className="flex gap-4">
                  {['month','week'].map(v => (
                    <button key={v} className={`pill${calView === v ? ' active' : ''}`} onClick={() => setCalView(v)} style={{fontSize:'10px',padding:'3px 10px',textTransform:'capitalize'}}>{v}</button>
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
                        {isToday ? <span style={{background:'var(--bp-info)',color:'#fff',borderRadius:'50%',width:'20px',height:'20px',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700}}>{day.date.getDate()}</span> : day.date.getDate()}
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

              {/* Stage legend */}
              <div className="flex gap-12 mt-8" style={{justifyContent:'center',paddingTop:'6px',borderTop:'1px solid var(--bp-border-lt)'}}>
                {Object.entries(STAGES).filter(([k]) => k !== 'complete').map(([key, val]) => (
                  <div key={key} className="flex gap-4" style={{fontSize:'9.5px',color:'var(--bp-muted)'}}>
                    <div style={{width:'9px',height:'9px',borderRadius:'3px',background:val.bg,border:`1px solid ${val.color}`}}></div>
                    {val.label}
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
                  <div key={group.stage} style={{marginBottom:'2px'}} className={`animate-in-${Math.min(gi + 1, 4)}`}>
                    <div className="sec-bar" style={{background: group.color}}>
                      <span>{group.label}</span>
                      <span className="sec-count">{group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="card" style={{padding:0,overflow:'hidden',borderRadius:'0 0 var(--bp-r) var(--bp-r)',marginBottom:'10px'}}>
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th style={{width:'20%'}}>Job</th>
                            <th style={{width:'14%'}}>Client</th>
                            <th style={{width:'8%'}}>Type</th>
                            <th style={{width:'9%'}}>Install</th>
                            <th style={{width:'9%'}}>Event</th>
                            <th style={{width:'9%'}}>Strike</th>
                            <th style={{width:'8%',textAlign:'right'}}>Amount</th>
                            <th style={{width:'8%'}}>Status</th>
                            <th style={{width:'15%'}}>Venue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.jobs.map(j => (
                            <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                              <td style={{fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_jobname || 'Untitled'}</td>
                              <td>{j.cr55d_clientname || ''}</td>
                              <td><span style={{fontSize:'10px'}}>{EVENT_TYPES[j.cr55d_eventtype] || ''}</span></td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_installdate?.split('T')[0])}</td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_eventdate?.split('T')[0])}</td>
                              <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_strikedate?.split('T')[0])}</td>
                              <td style={{textAlign:'right',fontFamily:'var(--bp-mono)',fontSize:'11px'}}>{j.cr55d_quotedamount ? '$' + Math.round(j.cr55d_quotedamount).toLocaleString() : ''}</td>
                              <td><span className={`badge ${STATUS_BADGE[j.cr55d_jobstatus] || 'badge-navy'}`}>{STATUS_LABELS[j.cr55d_jobstatus] || 'Draft'}</span></td>
                              <td style={{fontSize:'11px',color:'var(--bp-muted)'}} title={j.cr55d_venueaddress}>
                                <div className="truncate" style={{maxWidth:'160px'}}>{j.cr55d_venuename || ''}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
