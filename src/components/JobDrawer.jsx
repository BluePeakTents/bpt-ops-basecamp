import { useState, useEffect, useRef } from 'react'
import { dvFetch } from '../hooks/useDataverse'
import { pickAndUploadFile } from '../utils/fileUpload'
import { isoDate, formatDate as sharedFormatDate, daysUntil as sharedDaysUntil, daysBetween } from '../utils/dateUtils'
import { STATUS_LABELS, STATUS_BADGE, EVENT_TYPES, optionSet } from '../constants/dataverseFields'

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

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

export default function JobDrawer({ job, open, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [uploadToast, setUploadToast] = useState(null)
  const [notes, setNotes] = useState([])
  const [julieTickets, setJulieTickets] = useState([])
  const [permits, setPermits] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(false)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const prevJobIdRef = useRef(null)
  useEffect(() => {
    if (job && open) {
      const jobId = job.cr55d_jobid
      // Only reset and reload if this is a different job
      if (jobId !== prevJobIdRef.current) {
        prevJobIdRef.current = jobId
        setActiveTab('overview')
        setNotes([])
        setJulieTickets([])
        setPermits([])
        loadJobDetails(jobId)
      }
    }
    if (!open) prevJobIdRef.current = null
  }, [job?.cr55d_jobid, open])

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

  const installDays = sharedDaysUntil(isoDate(job.cr55d_installdate))

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
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Job details" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{job.cr55d_jobname || 'Untitled Job'}</h2>
              <div className="drawer-sub">{job.cr55d_clientname}</div>
            </div>
            <button className="drawer-close" onClick={onClose} aria-label="Close job details">✕</button>
          </div>
          <div className="drawer-header-meta">
            <span><span className={`badge ${STATUS_BADGE[optionSet(job.cr55d_jobstatus)] || 'badge-navy'}`}>{STATUS_LABELS[optionSet(job.cr55d_jobstatus)] || 'Draft'}</span></span>
            {job.cr55d_eventtype && <span>{EVENT_TYPES[optionSet(job.cr55d_eventtype)] || ''}</span>}
            {job.cr55d_quotedamount && <span className="font-mono font-bold">{fmtCurrency(job.cr55d_quotedamount)}</span>}
            {installDays !== null && (
              <span style={{color: installDays <= 7 ? 'var(--bp-red)' : installDays <= 14 ? 'var(--bp-amber)' : 'inherit', fontWeight: installDays <= 14 ? 700 : 400}}>
                {installDays < 0 ? `${Math.abs(installDays)}d ago` : installDays === 0 ? 'TODAY' : `${installDays}d until install`}
              </span>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        <div style={{padding:'10px 22px 12px',background:'var(--bp-alt)',borderBottom:'1px solid var(--bp-border)'}}>
          <div className="flex-between mb-4">
            <span className="form-label" style={{marginBottom:0}}>Job Readiness</span>
            <span className="text-base font-mono font-bold" style={{color: completionPct === 100 ? 'var(--bp-green)' : completionPct >= 50 ? 'var(--bp-amber)' : 'var(--bp-red)'}}>{completionPct}%</span>
          </div>
          <div className="progress-bar" style={{height:'6px',marginBottom:'8px'}}>
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
        <div className="drawer-tabs" role="tablist">
          {DRAWER_TABS.map(t => (
            <button key={t.id} className={`drawer-tab${activeTab === t.id ? ' active' : ''}`} role="tab" aria-selected={t.id === activeTab} onClick={() => setActiveTab(t.id)}>
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
              <div className="drawer-field"><span className="drawer-field-label">Event Type</span><span className="drawer-field-value">{EVENT_TYPES[optionSet(job.cr55d_eventtype)] || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Sales Rep</span><span className="drawer-field-value">{job.cr55d_salesrep || '—'}</span></div>
            </div>

            <div className="drawer-section">
              <div className="drawer-section-title">📅 Schedule</div>
              <div className="drawer-field"><span className="drawer-field-label">Install Date</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_installdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Event Date</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_eventdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Strike Date</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_strikedate))}</span></div>
              {job.cr55d_installdate && job.cr55d_strikedate && (
                <div className="drawer-field">
                  <span className="drawer-field-label">Duration</span>
                  <span className="drawer-field-value font-mono">{daysBetween(job.cr55d_installdate, job.cr55d_strikedate)} days</span>
                </div>
              )}
            </div>

            <div className="drawer-section">
              <div className="drawer-section-title">💰 Financials</div>
              <div className="drawer-field"><span className="drawer-field-label">Quoted Amount</span><span className="drawer-field-value font-mono">{fmtCurrency(job.cr55d_quotedamount)}</span></div>
            </div>

            {/* Notes */}
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>💬 Notes</span>
                <span className="text-xs color-muted">{notes.length} notes</span>
              </div>
              {loadingNotes ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : notes.length === 0 ? (
                <div className="text-base color-muted" style={{padding:'8px 0'}}>No notes yet</div>
              ) : notes.map((n, i) => (
                <div key={i} className="card card-flush" style={{marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span className="text-md font-semibold color-navy">{n.cr55d_title || n.cr55d_notetype || 'Note'}</span>
                    <span className="text-xs color-muted">{n.createdon ? new Date(n.createdon).toLocaleDateString() : ''}</span>
                  </div>
                  <div className="text-base" style={{color:'var(--bp-text)',lineHeight:1.5}}>{n.cr55d_details || n.cr55d_content || ''}</div>
                  {n.cr55d_author && <div className="text-xs color-muted" style={{marginTop:'4px'}}>— {n.cr55d_author}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Production Plan Tab */}
          <div className={`drawer-panel${activeTab === 'production' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">📋 Production Schedule</div>
              <div className="drawer-field"><span className="drawer-field-label">Install</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_installdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Event</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_eventdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Strike</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_strikedate))}</span></div>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No Production Schedule Yet</div>
              <div className="empty-state-sub">Generate one with the AI assistant</div>
              <button className="btn btn-primary btn-sm mt-12" onClick={() => { if (window.__bptSetTab) window.__bptSetTab('askops') }}>Build with Ask Ops →</button>
            </div>
          </div>

          {/* Load List Tab */}
          <div className={`drawer-panel${activeTab === 'loadlist' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>📦 Load List</span>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  // Navigate to Ask Ops with load list context
                  if (window.__bptSetTab) window.__bptSetTab('askops')
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
                    <div className="text-base color-muted">
                      Deadline: <strong style={{color:'var(--bp-text)'}}>{sharedFormatDate((() => { const d = new Date(job.cr55d_installdate.split('T')[0] + 'T12:00:00'); d.setDate(d.getDate() - 7); const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` })())}</strong>
                      <span style={{color:'var(--bp-red)',fontWeight:600,marginLeft:'8px'}}>
                        (7 days before install)
                      </span>
                    </div>
                  )}
                </div>
              ) : julieTickets.map((t, i) => (
                <div key={i} className="card card-flush" style={{marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span className="text-base font-semibold">{t.cr55d_ticketnumber || 'JULIE Ticket'}</span>
                    <span className={`badge ${t.cr55d_status === 'completed' ? 'badge-green' : t.cr55d_status === 'expired' ? 'badge-red' : 'badge-amber'}`}>
                      {t.cr55d_status || 'Pending'}
                    </span>
                  </div>
                  {t.cr55d_expirationdate && (
                    <div className="text-md color-muted">
                      Expires: {sharedFormatDate(isoDate(t.cr55d_expirationdate))}
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
                <div key={i} className="card card-flush" style={{marginBottom:'8px'}}>
                  <div className="flex-between mb-4">
                    <span className="text-base font-semibold">{p.cr55d_permitnumber || 'Permit'}</span>
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
                  pickAndUploadFile(
                    job.cr55d_jobid,
                    `Document - ${job.cr55d_clientname || job.cr55d_jobname}`,
                    '.pdf,.doc,.docx,.jpg,.png,.dwg',
                    (name) => { setUploadToast(`Uploaded ${name}`); setTimeout(() => setUploadToast(null), 3000) },
                    (err) => { setUploadToast(`Upload failed: ${err}`); setTimeout(() => setUploadToast(null), 4000) }
                  )
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
      {uploadToast && <div className="toast show info" style={{zIndex:10002}}>{uploadToast}</div>}
    </div>
  )
}
