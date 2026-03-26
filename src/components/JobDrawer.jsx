import { useState, useEffect } from 'react'
import { dvFetch } from '../hooks/useDataverse'

const DRAWER_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'production', label: 'Production Plan' },
  { id: 'loadlist', label: 'Load List' },
  { id: 'crew', label: 'Crew' },
  { id: 'trucks', label: 'Trucks' },
  { id: 'photos', label: 'Site Photos' },
  { id: 'julie', label: 'JULIE' },
  { id: 'permit', label: 'Permit' },
  { id: 'docs', label: 'Docs' },
]

const STATUS_LABELS = { 408420001: 'Scheduled', 408420002: 'Installing', 408420003: 'Complete', 408420000: 'Quoted', 408420004: 'Cancelled', 408420005: 'Sent', 306280001: 'Soft Hold' }
const STATUS_BADGE = { 408420001: 'badge-blue', 408420002: 'badge-amber', 408420003: 'badge-green', 408420000: 'badge-navy', 408420004: 'badge-red', 408420005: 'badge-sand', 306280001: 'badge-purple' }
const EVENT_TYPES = { 987650000: 'Wedding', 987650001: 'Corporate', 987650002: 'Social', 987650003: 'Festival', 987650004: 'Fundraiser', 306280000: 'Wedding', 306280001: 'Corporate', 306280002: 'Social', 306280003: 'Festival', 306280004: 'Fundraiser', 306280005: 'Construction' }

function formatDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

function daysUntil(d) {
  if (!d) return null
  const target = new Date(d + 'T12:00:00')
  const now = new Date()
  now.setHours(12,0,0,0)
  return Math.ceil((target - now) / 86400000)
}

export default function JobDrawer({ job, open, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [notes, setNotes] = useState([])
  const [julieTickets, setJulieTickets] = useState([])
  const [permits, setPermits] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(false)

  useEffect(() => {
    if (job && open) {
      setActiveTab('overview')
      // Clear stale data from previous job before loading new
      setNotes([])
      setJulieTickets([])
      setPermits([])
      loadJobDetails(job.cr55d_jobid)
    }
  }, [job, open])

  async function loadJobDetails(jobId) {
    if (!jobId) return
    // Sanitize jobId for OData query (strip anything that isn't a GUID character)
    const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
    setLoadingNotes(true)
    try {
      const [notesData, julieData, permitData] = await Promise.all([
        dvFetch(`cr55d_jobnotes?$filter=_cr55d_jobid_value eq '${safeId}'&$orderby=createdon desc&$top=20`).catch(() => []),
        dvFetch(`cr55d_julietickets?$filter=_cr55d_jobid_value eq '${safeId}'&$top=5`).catch(() => []),
        dvFetch(`cr55d_permits?$filter=_cr55d_jobid_value eq '${safeId}'&$top=5`).catch(() => []),
      ])
      setNotes(Array.isArray(notesData) ? notesData : [])
      setJulieTickets(Array.isArray(julieData) ? julieData : [])
      setPermits(Array.isArray(permitData) ? permitData : [])
    } catch (e) {
      console.error('[JobDrawer] Failed to load details:', e)
    } finally {
      setLoadingNotes(false)
    }
  }

  if (!job) return null

  const installDays = daysUntil(job.cr55d_installdate?.split('T')[0])

  // Completeness checks
  const checks = [
    { label: 'PM Assigned', done: !!job.cr55d_pmassigned },
    { label: 'Crew Planned', done: !!job.cr55d_crewplanned },
    { label: 'Trucks Assigned', done: !!job.cr55d_trucksassigned },
    { label: 'JULIE Complete', done: julieTickets.some(t => t.cr55d_status === 'completed' || t.cr55d_julieticketstatusid === 408420002) },
    { label: 'Permit Approved', done: permits.some(p => p.cr55d_status === 'approved' || p.cr55d_permitstatusid === 408420003) },
    { label: 'Load List Ready', done: !!job.cr55d_loadlistready },
  ]
  const completionPct = Math.round((checks.filter(c => c.done).length / checks.length) * 100)

  return (
    <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{job.cr55d_jobname || 'Untitled Job'}</h2>
              <div className="drawer-sub">{job.cr55d_clientname}</div>
            </div>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
          <div className="drawer-header-meta">
            <span><span className={`badge ${STATUS_BADGE[job.cr55d_jobstatus] || 'badge-navy'}`}>{STATUS_LABELS[job.cr55d_jobstatus] || 'Draft'}</span></span>
            {job.cr55d_eventtype && <span>{EVENT_TYPES[job.cr55d_eventtype] || ''}</span>}
            {job.cr55d_quotedamount && <span style={{fontFamily:'var(--bp-mono)',fontWeight:700}}>{fmtCurrency(job.cr55d_quotedamount)}</span>}
            {installDays !== null && (
              <span style={{color: installDays <= 7 ? '#EF4444' : installDays <= 14 ? '#F59E0B' : 'inherit', fontWeight: installDays <= 14 ? 700 : 400}}>
                {installDays < 0 ? `${Math.abs(installDays)}d ago` : installDays === 0 ? 'TODAY' : `${installDays}d until install`}
              </span>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        <div style={{padding:'8px 22px 10px',background:'var(--bp-alt)',borderBottom:'1px solid var(--bp-border)'}}>
          <div className="flex-between" style={{marginBottom:'3px'}}>
            <span style={{fontSize:'9.5px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--bp-muted)'}}>Job Readiness</span>
            <span style={{fontSize:'10.5px',fontFamily:'var(--bp-mono)',fontWeight:700,color: completionPct === 100 ? 'var(--bp-green)' : completionPct >= 50 ? 'var(--bp-amber)' : 'var(--bp-red)'}}>{completionPct}%</span>
          </div>
          <div className="progress-bar" style={{height:'5px',marginBottom:'7px'}}>
            <div className={`progress-fill ${completionPct === 100 ? 'green' : completionPct >= 50 ? 'amber' : 'red'}`} style={{width:`${completionPct}%`}}></div>
          </div>
          <div className="completeness">
            {checks.map((c, i) => (
              <span key={i} className={`completeness-item ${c.done ? 'done' : 'missing'}`}>
                {c.done ? '✓' : '✗'} {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          {DRAWER_TABS.map(t => (
            <button key={t.id} className={`drawer-tab${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Overview Tab */}
          <div className={`drawer-panel${activeTab === 'overview' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">📍 Event Details</div>
              <div className="drawer-field"><span className="drawer-field-label">Venue</span><span className="drawer-field-value">{job.cr55d_venuename || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Address</span><span className="drawer-field-value" style={{maxWidth:'360px',textAlign:'right'}}>{job.cr55d_venueaddress || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Event Type</span><span className="drawer-field-value">{EVENT_TYPES[job.cr55d_eventtype] || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Sales Rep</span><span className="drawer-field-value">{job.cr55d_salesrep || '—'}</span></div>
            </div>

            <div className="drawer-section">
              <div className="drawer-section-title">📅 Schedule</div>
              <div className="drawer-field"><span className="drawer-field-label">Install Date</span><span className="drawer-field-value">{formatDate(job.cr55d_installdate?.split('T')[0])}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Event Date</span><span className="drawer-field-value">{formatDate(job.cr55d_eventdate?.split('T')[0])}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Strike Date</span><span className="drawer-field-value">{formatDate(job.cr55d_strikedate?.split('T')[0])}</span></div>
              {job.cr55d_installdate && job.cr55d_strikedate && (
                <div className="drawer-field">
                  <span className="drawer-field-label">Duration</span>
                  <span className="drawer-field-value">{Math.max(1, Math.ceil((new Date(job.cr55d_strikedate) - new Date(job.cr55d_installdate)) / 86400000))} days</span>
                </div>
              )}
            </div>

            <div className="drawer-section">
              <div className="drawer-section-title">💰 Financials</div>
              <div className="drawer-field"><span className="drawer-field-label">Quoted Amount</span><span className="drawer-field-value" style={{fontFamily:'var(--bp-mono)'}}>{fmtCurrency(job.cr55d_quotedamount)}</span></div>
            </div>

            {/* Notes */}
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>💬 Notes</span>
                <span style={{fontSize:'10px',fontWeight:400,color:'var(--bp-light)'}}>{notes.length} notes</span>
              </div>
              {loadingNotes ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : notes.length === 0 ? (
                <div style={{fontSize:'12px',color:'var(--bp-light)',padding:'8px 0'}}>No notes yet</div>
              ) : notes.map((n, i) => (
                <div key={i} className="card" style={{padding:'10px 12px',marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span style={{fontSize:'11px',fontWeight:600,color:'var(--bp-navy)'}}>{n.cr55d_title || n.cr55d_notetype || 'Note'}</span>
                    <span style={{fontSize:'10px',color:'var(--bp-light)'}}>{n.createdon ? new Date(n.createdon).toLocaleDateString() : ''}</span>
                  </div>
                  <div style={{fontSize:'12px',color:'var(--bp-text)',lineHeight:1.5}}>{n.cr55d_details || n.cr55d_content || ''}</div>
                  {n.cr55d_author && <div style={{fontSize:'10px',color:'var(--bp-muted)',marginTop:'4px'}}>— {n.cr55d_author}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Production Plan Tab */}
          <div className={`drawer-panel${activeTab === 'production' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">📋 Production Schedule</div>
              <div className="callout callout-blue mb-12">
                <span className="callout-icon">💡</span>
                <div>Production schedules are generated via the Ask Ops AI assistant. Select "Build Production Schedule" and choose this job to auto-generate.</div>
              </div>
              <div style={{fontSize:'12px',color:'var(--bp-muted)'}}>
                <div className="drawer-field"><span className="drawer-field-label">Install Start</span><span className="drawer-field-value">{formatDate(job.cr55d_installdate?.split('T')[0])}</span></div>
                <div className="drawer-field"><span className="drawer-field-label">Event Date</span><span className="drawer-field-value">{formatDate(job.cr55d_eventdate?.split('T')[0])}</span></div>
                <div className="drawer-field"><span className="drawer-field-label">Strike Date</span><span className="drawer-field-value">{formatDate(job.cr55d_strikedate?.split('T')[0])}</span></div>
              </div>
            </div>
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No Production Schedule</div>
              <div className="empty-state-sub">Use Ask Ops to generate a production schedule for this job</div>
            </div>
          </div>

          {/* Load List Tab */}
          <div className={`drawer-panel${activeTab === 'loadlist' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>📦 Load List</span>
                <button className="btn btn-outline btn-sm" onClick={() => {
  const btn = document.activeElement
  const orig = btn.textContent
  btn.textContent = 'Coming Soon'
  btn.disabled = true
  setTimeout(() => { btn.textContent = orig; btn.disabled = false }, 2000)
}}>Generate with AI</button>
              </div>
              <div className="callout callout-blue mb-12">
                <span className="callout-icon">💡</span>
                <div>Load lists are generated by AI from the BOM Master in Dataverse. Use Ask Ops → "Generate Load List" to create one.</div>
              </div>
            </div>
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-title">No Load List</div>
              <div className="empty-state-sub">Generate a load list via Ask Ops to see warehouse pull items here</div>
            </div>
          </div>

          {/* Crew Tab */}
          <div className={`drawer-panel${activeTab === 'crew' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">👥 Crew Assignment</div>
              <div className="drawer-field"><span className="drawer-field-label">PM Assigned</span><span className="drawer-field-value">{job.cr55d_pmassigned || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Crew Leader</span><span className="drawer-field-value">{job.cr55d_crewleader || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Crew Size</span><span className="drawer-field-value">{job.cr55d_crewcount || '—'}</span></div>
            </div>
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">Crew Not Yet Assigned</div>
              <div className="empty-state-sub">Assign a PM via the PM Capacity Calendar, then plan crew in the Scheduler</div>
            </div>
          </div>

          {/* Trucks Tab */}
          <div className={`drawer-panel${activeTab === 'trucks' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">🚚 Vehicle Assignment</div>
              <div className="drawer-field"><span className="drawer-field-label">Trucks Needed</span><span className="drawer-field-value">{job.cr55d_trucksneeded || '—'}</span></div>
            </div>
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">🚚</div>
              <div className="empty-state-title">No Trucks Assigned</div>
              <div className="empty-state-sub">Assign vehicles via the Truck Schedule in the Scheduling tab</div>
            </div>
          </div>

          {/* Site Photos Tab */}
          <div className={`drawer-panel${activeTab === 'photos' ? ' active' : ''}`}>
            <div className="empty-state">
              <div className="empty-state-icon">📸</div>
              <div className="empty-state-title">No Site Photos</div>
              <div className="empty-state-sub">Photos will appear here when uploaded by PMs via the field app (Outpost)</div>
            </div>
          </div>

          {/* JULIE Tab */}
          <div className={`drawer-panel${activeTab === 'julie' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">🔴 JULIE Status</div>
              {julieTickets.length === 0 ? (
                <div>
                  <div className="callout callout-amber mb-12">
                    <span className="callout-icon">⚠️</span>
                    <div>Every tent job requires a JULIE ticket. This job needs one submitted.</div>
                  </div>
                  {job.cr55d_installdate && (
                    <div style={{fontSize:'12px',color:'var(--bp-muted)'}}>
                      Deadline: <strong style={{color:'var(--bp-text)'}}>{formatDate((() => { const d = new Date(job.cr55d_installdate.split('T')[0] + 'T12:00:00'); d.setDate(d.getDate() - 7); const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` })())}</strong>
                      <span style={{color:'var(--bp-red)',fontWeight:600,marginLeft:'8px'}}>
                        (7 days before install)
                      </span>
                    </div>
                  )}
                </div>
              ) : julieTickets.map((t, i) => (
                <div key={i} className="card" style={{padding:'12px',marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span style={{fontSize:'12px',fontWeight:600}}>{t.cr55d_ticketnumber || 'JULIE Ticket'}</span>
                    <span className={`badge ${t.cr55d_status === 'completed' ? 'badge-green' : t.cr55d_status === 'expired' ? 'badge-red' : 'badge-amber'}`}>
                      {t.cr55d_status || 'Pending'}
                    </span>
                  </div>
                  {t.cr55d_expirationdate && (
                    <div style={{fontSize:'11px',color:'var(--bp-muted)'}}>
                      Expires: {formatDate(t.cr55d_expirationdate?.split('T')[0])}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permit Tab */}
          <div className={`drawer-panel${activeTab === 'permit' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">📋 Permit Status</div>
              {permits.length === 0 ? (
                <div className="callout callout-amber mb-12">
                  <span className="callout-icon">⚠️</span>
                  <div>All jobs are auto-flagged as needing a permit. Toggle off in Ops Admin if not required.</div>
                </div>
              ) : permits.map((p, i) => (
                <div key={i} className="card" style={{padding:'12px',marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span style={{fontSize:'12px',fontWeight:600}}>{p.cr55d_permitnumber || 'Permit'}</span>
                    <span className={`badge ${p.cr55d_status === 'approved' ? 'badge-green' : p.cr55d_status === 'expired' ? 'badge-red' : 'badge-amber'}`}>
                      {p.cr55d_status || 'Not Started'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Docs Tab */}
          <div className={`drawer-panel${activeTab === 'docs' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>📁 Documents</span>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.pdf,.doc,.docx,.jpg,.png,.dwg'
                  input.onchange = (e) => {
                    const file = e.target.files[0]
                    if (file) {
  // TODO: Upload to SharePoint job folder when integration is ready
  console.log(`[Docs] File selected: ${file.name} for job ${job.cr55d_jobid}`)
}
                  }
                  input.click()
                }}>Upload</button>
              </div>
              <div className="callout callout-blue mb-12">
                <span className="callout-icon">📂</span>
                <div>Documents are stored in SharePoint job folders. Upload documents here to auto-save to the right folder.</div>
              </div>
              <div className="empty-state" style={{padding:'20px'}}>
                <div className="empty-state-icon">📄</div>
                <div className="empty-state-title">No Documents</div>
                <div className="empty-state-sub">Drawings, contracts, and site maps will appear here</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
