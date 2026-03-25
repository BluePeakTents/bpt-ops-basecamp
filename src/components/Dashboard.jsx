import { useState, useEffect } from 'react'
import { dvFetch } from '../hooks/useDataverse'

const STAGES = {
  loading: { label: 'Loading', color: '#6366F1' },
  transit: { label: 'In Transit', color: '#3B82F6' },
  installing: { label: 'Installing', color: '#F59E0B' },
  event: { label: 'Event Day', color: '#10B981' },
  striking: { label: 'Striking', color: '#EF4444' },
  returned: { label: 'Returned', color: '#8B5CF6' },
  complete: { label: 'Complete', color: '#6B7280' },
}

const JOB_STATUS_MAP = {
  408420000: 'quoted',
  408420001: 'invoiced',
  408420002: 'installing',
  408420003: 'complete',
  408420004: 'cancelled',
  408420005: 'sent',
  306280001: 'softhold',
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0') + '/' + dt.getFullYear()
}

function fmtK(n) {
  if (!n) return '$0'
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K'
  return '$' + Math.round(n)
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedJob, setSelectedJob] = useState(null)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const fields = 'cr55d_jobid,cr55d_jobname,cr55d_clientname,cr55d_eventdate,cr55d_installdate,cr55d_strikedate,cr55d_quotedamount,cr55d_venuename,cr55d_venueaddress,cr55d_salesrep,cr55d_jobstatus,cr55d_eventtype,cr55d_juliestatus,cr55d_permitstatus'
      const data = await dvFetch(`cr55d_jobs?$select=${fields}&$filter=cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002 or cr55d_jobstatus eq 408420003&$orderby=cr55d_installdate asc&$top=200`)
      setJobs(data || [])
    } catch (e) {
      console.error('[Dashboard] Load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  // Calculate KPIs
  const now = new Date()
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const nowISO = now.toISOString().split('T')[0]
  const weekISO = weekEnd.toISOString().split('T')[0]

  const installing = jobs.filter(j => j.cr55d_jobstatus === 408420002)
  const thisWeek = jobs.filter(j => {
    const d = j.cr55d_installdate?.split('T')[0]
    return d && d >= nowISO && d <= weekISO
  })
  const striking = jobs.filter(j => {
    const d = j.cr55d_strikedate?.split('T')[0]
    return d && d >= nowISO && d <= weekISO
  })

  const pills = [
    { id: 'all', label: 'All' },
    { id: 'invoiced', label: 'Scheduled' },
    { id: 'installing', label: 'Installing' },
    { id: 'complete', label: 'Complete' },
  ]

  const filtered = filter === 'all' ? jobs : jobs.filter(j => {
    const st = JOB_STATUS_MAP[j.cr55d_jobstatus] || ''
    return st === filter
  })

  const EVENT_TYPES = { 987650000: 'Wedding', 987650001: 'Corporate', 987650002: 'Social', 987650003: 'Festival', 987650004: 'Fundraiser', 306280000: 'Wedding', 306280001: 'Corporate', 306280002: 'Social', 306280003: 'Festival', 306280004: 'Fundraiser', 306280005: 'Construction' }
  const STATUS_LABELS = { 408420001: 'Scheduled', 408420002: 'Installing', 408420003: 'Complete' }
  const STATUS_BADGE = { 408420001: 'badge-blue', 408420002: 'badge-amber', 408420003: 'badge-green' }

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Dashboard</h1><div className="sub">Daily command center</div></div>
        <div className="flex">
          {pills.map(p => (
            <button key={p.id} className={`pill${filter === p.id ? ' active' : ''}`} onClick={() => setFilter(p.id)}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Jobs This Week</div><div className="kpi-val">{thisWeek.length}</div><div className="kpi-sub">installing this week</div></div>
        <div className="kpi"><div className="kpi-label">Active Installs</div><div className="kpi-val">{installing.length}</div><div className="kpi-sub">in progress now</div></div>
        <div className="kpi"><div className="kpi-label">Total Scheduled</div><div className="kpi-val">{jobs.filter(j => j.cr55d_jobstatus === 408420001).length}</div><div className="kpi-sub">upcoming jobs</div></div>
        <div className="kpi"><div className="kpi-label">Striking This Week</div><div className="kpi-val">{striking.length}</div><div className="kpi-sub">removals</div></div>
        <div className="kpi"><div className="kpi-label">Pipeline Value</div><div className="kpi-val">{fmtK(jobs.reduce((s, j) => s + (j.cr55d_quotedamount || 0), 0))}</div><div className="kpi-sub">active jobs</div></div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><div style={{margin:'0 auto 8px',width:'24px',height:'24px',border:'3px solid var(--bp-border)',borderTopColor:'var(--bp-blue)',borderRadius:'50%',animation:'spin .8s linear infinite'}}></div>Loading jobs...</div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-title">No jobs found</div><div className="empty-state-sub">{filter === 'all' ? 'Jobs will appear here when invoiced from Sales Hub' : 'No jobs match this filter'}</div></div></div>
      ) : (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:'20%'}}>Job</th>
                <th style={{width:'15%'}}>Client</th>
                <th style={{width:'8%'}}>Type</th>
                <th style={{width:'9%'}}>Install</th>
                <th style={{width:'9%'}}>Event</th>
                <th style={{width:'9%'}}>Strike</th>
                <th style={{width:'8%',textAlign:'right'}}>Amount</th>
                <th style={{width:'8%'}}>Status</th>
                <th style={{width:'14%'}}>Venue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.cr55d_jobid} style={{cursor:'pointer'}} onClick={() => setSelectedJob(j)}>
                  <td style={{fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_jobname || 'Untitled'}</td>
                  <td>{j.cr55d_clientname || ''}</td>
                  <td><span style={{fontSize:'10px'}}>{EVENT_TYPES[j.cr55d_eventtype] || ''}</span></td>
                  <td style={{whiteSpace:'nowrap'}}>{formatDate(j.cr55d_installdate?.split('T')[0])}</td>
                  <td style={{whiteSpace:'nowrap'}}>{formatDate(j.cr55d_eventdate?.split('T')[0])}</td>
                  <td style={{whiteSpace:'nowrap'}}>{formatDate(j.cr55d_strikedate?.split('T')[0])}</td>
                  <td style={{textAlign:'right',fontFamily:'var(--bp-mono)'}}>{j.cr55d_quotedamount ? '$' + Math.round(j.cr55d_quotedamount).toLocaleString() : ''}</td>
                  <td><span className={`badge ${STATUS_BADGE[j.cr55d_jobstatus] || 'badge-navy'}`}>{STATUS_LABELS[j.cr55d_jobstatus] || 'Draft'}</span></td>
                  <td style={{fontSize:'11px',color:'var(--bp-muted)'}} title={j.cr55d_venueaddress}>{j.cr55d_venuename || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
