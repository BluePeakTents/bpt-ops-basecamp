import { useState, useEffect, useMemo } from 'react'
import { dvFetch } from '../hooks/useDataverse'
import { generateProductionSchedulePDF } from '../utils/generateDriverSheet'

/* ── Helpers ───────────────────────────────────────────────────── */
function shortDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

function daysUntil(d) {
  if (!d) return null
  const target = new Date(d + 'T12:00:00')
  const now = new Date(); now.setHours(12,0,0,0)
  return Math.ceil((target - now) / 86400000)
}

function deadlineClass(daysLeft) {
  if (daysLeft === null) return 'gray'
  if (daysLeft <= 3) return 'red'
  if (daysLeft <= 7) return 'amber'
  return 'green'
}

/* ── Main Component ────────────────────────────────────────────── */
export default function OpsAdmin({ onSelectJob }) {
  const [subTab, setSubTab] = useState('julie')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(null)

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
      const data = await dvFetch(`cr55d_jobs?$select=cr55d_jobid,cr55d_jobname,cr55d_clientname,cr55d_installdate,cr55d_strikedate,cr55d_eventdate,cr55d_jobstatus,cr55d_venuename,cr55d_venueaddress,cr55d_pmassigned,cr55d_juliestatus,cr55d_permitstatus&$filter=cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002&$orderby=cr55d_installdate asc&$top=200`)
      setJobs(data || [])
    } catch (e) { console.error('[OpsAdmin] Load:', e); setError(e.message) }
    finally { setLoading(false) }
  }

  const tabs = [
    { id: 'julie', label: 'JULIE Tracker', icon: '🔴', count: jobs.length },
    { id: 'permits', label: 'Permits', icon: '📋', count: jobs.length },
    { id: 'subrentals', label: 'Sub-Rentals', icon: '📦' },
    { id: 'purchase', label: 'Purchase Requests', icon: '🛒' },
    { id: 'pstracker', label: 'PS Tracker', icon: '📄' },
  ]

  const filteredJobs = searchTerm
    ? jobs.filter(j => {
        const q = searchTerm.toLowerCase()
        return (j.cr55d_jobname || '').toLowerCase().includes(q) || (j.cr55d_clientname || '').toLowerCase().includes(q) || (j.cr55d_venuename || '').toLowerCase().includes(q)
      })
    : jobs

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Ops Admin</h1><div className="sub">JULIE, permits, sub-rentals, purchase requests</div><div className="page-head-accent"></div></div>
        <div className="flex gap-8">
          <input className="form-input" placeholder="Search jobs..." style={{width:'240px',fontSize:'11px'}} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-6 mb-16">
        {tabs.map(t => (
          <button key={t.id} className={`pill${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>
            <span>{t.icon}</span> {t.label}
            {t.count > 0 && <span className="pill-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">⚠️</span>
          <div>
            <strong>Failed to load data.</strong> {error}
            <button className="btn btn-ghost btn-xs" style={{marginLeft:'8px'}} onClick={() => { setError(null); loadJobs() }}>Retry</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner" style={{marginBottom:'12px'}}></div>Loading...</div></div>
      ) : (
        <>
          {subTab === 'julie' && <JulieTracker jobs={filteredJobs} onSelectJob={onSelectJob} />}
          {subTab === 'permits' && <PermitTracker jobs={filteredJobs} onSelectJob={onSelectJob} />}
          {subTab === 'subrentals' && <SubRentalTracker jobs={filteredJobs} />}
          {subTab === 'purchase' && <PurchaseRequestQueue />}
          {subTab === 'pstracker' && <PSTracker jobs={filteredJobs} onSelectJob={onSelectJob} />}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   JULIE TRACKER
   ═══════════════════════════════════════════════════════════════════ */
function JulieTracker({ jobs, onSelectJob }) {
  // Every tent job needs JULIE — 7 days before install
  const julieJobs = jobs.map(j => {
    const installDate = j.cr55d_installdate?.split('T')[0]
    const deadline = installDate ? (() => { const d = new Date(installDate + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') })() : null
    const daysLeft = deadline ? daysUntil(deadline) : null
    const status = j.cr55d_juliestatus || 'not_started' // not_started, requested, scheduled, completed, expired
    return { ...j, julieDeadline: deadline, julieDaysLeft: daysLeft, julieStatus: status }
  }).sort((a, b) => {
    // Unconfirmed sort to top, then by deadline proximity
    if (a.julieStatus !== 'completed' && b.julieStatus === 'completed') return -1
    if (a.julieStatus === 'completed' && b.julieStatus !== 'completed') return 1
    return (a.julieDaysLeft ?? 999) - (b.julieDaysLeft ?? 999)
  })

  const uncompleted = julieJobs.filter(j => j.julieStatus !== 'completed').length
  const critical = julieJobs.filter(j => j.julieDaysLeft !== null && j.julieDaysLeft <= 3 && j.julieStatus !== 'completed').length

  return (
    <div>
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi"><div className="kpi-label">Total Jobs</div><div className="kpi-val">{julieJobs.length}</div><div className="kpi-sub">requiring JULIE</div></div>
        <div className="kpi"><div className="kpi-label">Completed</div><div className="kpi-val" style={{color:'var(--bp-green)'}}>{julieJobs.length - uncompleted}</div><div className="kpi-sub">confirmed</div></div>
        <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{uncompleted}</div><div className="kpi-sub">not yet confirmed</div></div>
        <div className="kpi"><div className="kpi-label">Critical</div><div className="kpi-val" style={{color:'var(--bp-red)'}}>{critical}</div><div className="kpi-sub">≤3 days to deadline</div></div>
      </div>

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">ℹ️</span>
        <div>Every tent job requires a JULIE ticket completed 7 days before install. Upload the confirmation PDF by dragging it onto the job row.</div>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl tbl-fixed">
          <thead>
            <tr>
              <th style={{width:'36px'}}>Status</th>
              <th>Job</th>
              <th>Client</th>
              <th>Venue</th>
              <th>Install</th>
              <th>Deadline</th>
              <th style={{width:'70px'}}>Days</th>
              <th>PM</th>
              <th style={{width:'90px'}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {julieJobs.map((j, i) => {
              const cls = deadlineClass(j.julieDaysLeft)
              return (
                <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                  <td>
                    <div className={`status-dot ${j.julieStatus === 'completed' ? 'green' : cls}`} style={{display:'inline-block'}}></div>
                  </td>
                  <td><div className="truncate" style={{maxWidth:'140px',fontWeight:600,color:'var(--bp-navy)',fontSize:'11.5px'}}>{j.cr55d_jobname || 'Untitled'}</div></td>
                  <td><div className="truncate" style={{maxWidth:'110px',fontSize:'11.5px'}}>{j.cr55d_clientname || ''}</div></td>
                  <td><div className="truncate" style={{maxWidth:'120px',fontSize:'11px',color:'var(--bp-muted)'}}>{j.cr55d_venuename || ''}</div></td>
                  <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_installdate?.split('T')[0])}</td>
                  <td className="no-wrap" style={{fontSize:'11px',fontWeight:600}}>{shortDate(j.julieDeadline)}</td>
                  <td>
                    {j.julieStatus === 'completed' ? (
                      <span className="badge badge-green">✓ Done</span>
                    ) : (
                      <span className={`deadline-badge ${cls}`}>
                        {j.julieDaysLeft !== null ? (j.julieDaysLeft <= 0 ? 'OVERDUE' : `${j.julieDaysLeft}d`) : '—'}
                      </span>
                    )}
                  </td>
                  <td><div className="truncate" style={{maxWidth:'80px',fontSize:'11px'}}>{j.cr55d_pmassigned || '—'}</div></td>
                  <td onClick={e => e.stopPropagation()}>
                    {j.julieStatus !== 'completed' && (
                      <button className="btn btn-success btn-xs" onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.pdf'
                        input.onchange = (e) => {
                          const file = e.target.files[0]
                          if (file) {
  // TODO: Upload to SharePoint when integration is ready
  console.log(`[JULIE] File selected: ${file.name} for job ${j.cr55d_jobid}`)
}
                        }
                        input.click()
                      }}>Upload PDF</button>
                    )}
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

/* ═══════════════════════════════════════════════════════════════════
   PERMIT TRACKER
   ═══════════════════════════════════════════════════════════════════ */
function PermitTracker({ jobs, onSelectJob }) {
  const [excludedJobs, setExcludedJobs] = useState(new Set())

  const permitJobs = jobs.filter(j => !excludedJobs.has(j.cr55d_jobid)).map(j => {
    const status = j.cr55d_permitstatus || 'not_started'
    const installDate = j.cr55d_installdate?.split('T')[0]
    const daysLeft = installDate ? daysUntil(installDate) : null
    return { ...j, permitStatus: status, permitDaysLeft: daysLeft }
  }).sort((a, b) => {
    if (a.permitStatus !== 'approved' && b.permitStatus === 'approved') return -1
    if (a.permitStatus === 'approved' && b.permitStatus !== 'approved') return 1
    return (a.permitDaysLeft ?? 999) - (b.permitDaysLeft ?? 999)
  })

  function toggleExclude(jobId, e) {
    e.stopPropagation()
    setExcludedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  return (
    <div>
      <div className="callout callout-amber mb-12">
        <span className="callout-icon">⚠️</span>
        <div>All jobs are auto-flagged as needing a permit. Click "Not Required" to toggle off jobs that don't need one. Safer to default to required.</div>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl tbl-fixed">
          <thead>
            <tr>
              <th style={{width:'36px'}}>Status</th>
              <th>Job</th>
              <th>Client</th>
              <th>Venue</th>
              <th>Install</th>
              <th style={{width:'70px'}}>Days</th>
              <th>Permit</th>
              <th>PM</th>
              <th style={{width:'110px'}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {permitJobs.map(j => {
              const cls = deadlineClass(j.permitDaysLeft)
              return (
                <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                  <td><div className={`status-dot ${j.permitStatus === 'approved' ? 'green' : cls}`} style={{display:'inline-block'}}></div></td>
                  <td><div className="truncate" style={{maxWidth:'140px',fontWeight:600,color:'var(--bp-navy)',fontSize:'11.5px'}}>{j.cr55d_jobname || 'Untitled'}</div></td>
                  <td><div className="truncate" style={{maxWidth:'110px',fontSize:'11.5px'}}>{j.cr55d_clientname || ''}</div></td>
                  <td><div className="truncate" style={{maxWidth:'120px',fontSize:'11px',color:'var(--bp-muted)'}}>{j.cr55d_venuename || ''}</div></td>
                  <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_installdate?.split('T')[0])}</td>
                  <td>
                    <span className={`deadline-badge ${cls}`}>
                      {j.permitDaysLeft !== null ? (j.permitDaysLeft <= 0 ? 'PAST' : `${j.permitDaysLeft}d`) : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${j.permitStatus === 'approved' ? 'badge-green' : j.permitStatus === 'submitted' ? 'badge-blue' : j.permitStatus === 'pending' ? 'badge-amber' : 'badge-gray'}`}>
                      {j.permitStatus === 'not_started' ? 'Not Started' : j.permitStatus}
                    </span>
                  </td>
                  <td><div className="truncate" style={{maxWidth:'80px',fontSize:'11px'}}>{j.cr55d_pmassigned || '—'}</div></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex gap-4">
                      <button className="btn btn-outline btn-xs" onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.pdf,.jpg,.png'
                        input.onchange = (e) => {
                          const file = e.target.files[0]
                          if (file) {
  // TODO: Upload to SharePoint when integration is ready
  console.log(`[Permit] File selected: ${file.name} for job ${j.cr55d_jobid}`)
}
                        }
                        input.click()
                      }}>Upload</button>
                      <button className="btn btn-ghost btn-xs" style={{color:'var(--bp-light)',fontSize:'9px'}} onClick={(e) => toggleExclude(j.cr55d_jobid, e)}>Not Required</button>
                    </div>
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

/* ═══════════════════════════════════════════════════════════════════
   SUB-RENTAL TRACKER
   ═══════════════════════════════════════════════════════════════════ */
function SubRentalTracker({ jobs }) {
  const [items] = useState([])
  const [excludedPortaPotty, setExcludedPortaPotty] = useState(new Set())

  // Multi-day jobs auto-flag for porta-potty
  const multiDayJobs = jobs.filter(j => {
    if (excludedPortaPotty.has(j.cr55d_jobid)) return false
    if (!j.cr55d_installdate || !j.cr55d_strikedate) return false
    const days = Math.ceil((new Date(j.cr55d_strikedate) - new Date(j.cr55d_installdate)) / 86400000)
    return days > 1
  })

  return (
    <div>
      <div className="grid-2 mb-16">
        {/* Sub-Rentals */}
        <div className="card" style={{padding:'16px'}}>
          <div className="flex-between mb-12">
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--bp-navy)'}}>Sub-Rental Items</span>
            <button className="btn btn-primary btn-sm" onClick={() => {
  const btn = document.activeElement
  const orig = btn.textContent
  btn.textContent = 'Coming Soon'
  btn.disabled = true
  setTimeout(() => { btn.textContent = orig; btn.disabled = false }, 2000)
}}>+ Add Item</button>
          </div>
          {items.length === 0 ? (
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-title">No Sub-Rentals</div>
              <div className="empty-state-sub">Add sub-rental items manually or they'll auto-populate when flagged by sales. Track vendor, dates, rates, and return deadlines.</div>
            </div>
          ) : null}
        </div>

        {/* Porta-Potty Tracker */}
        <div className="card" style={{padding:'16px'}}>
          <div className="flex-between mb-12">
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--bp-navy)'}}>🚽 Crew Porta-Potty</span>
            <span className="badge badge-navy">{multiDayJobs.length} flagged</span>
          </div>
          <div style={{fontSize:'11px',color:'var(--bp-muted)',marginBottom:'12px'}}>
            Multi-day jobs auto-flagged. Toggle off if venue provides facilities.
          </div>
          {multiDayJobs.length === 0 ? (
            <div style={{fontSize:'12px',color:'var(--bp-light)',textAlign:'center',padding:'16px'}}>No multi-day jobs to flag</div>
          ) : (
            <div style={{maxHeight:'300px',overflowY:'auto'}}>
              {multiDayJobs.map((j, i) => {
                const days = Math.ceil((new Date(j.cr55d_strikedate) - new Date(j.cr55d_installdate)) / 86400000)
                return (
                  <div key={j.cr55d_jobid} className="flex-between" style={{padding:'8px 0',borderBottom: i < multiDayJobs.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_clientname}</div>
                      <div style={{fontSize:'10px',color:'var(--bp-muted)'}}>{days} days · {shortDate(j.cr55d_installdate?.split('T')[0])}</div>
                    </div>
                    <div className="flex gap-4">
                      <span className="badge badge-amber">Needs Order</span>
                      <button className="btn btn-ghost btn-xs" style={{fontSize:'9px'}} onClick={() => setExcludedPortaPotty(prev => { const next = new Set(prev); next.add(j.cr55d_jobid); return next })}>Not Needed</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="callout callout-blue">
        <span className="callout-icon">💡</span>
        <div>Sub-rentals are identified both ways: salespeople flag during quoting, and ops catches items during invoice review. Use the Notes field with snooze/reminder for future-dated items (e.g., "Chinese lanterns for September job — remind me July 1st").</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PURCHASE REQUEST QUEUE
   ═══════════════════════════════════════════════════════════════════ */
function PurchaseRequestQueue() {
  return (
    <div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">🛒</div>
          <div className="empty-state-title">Purchase Request Queue</div>
          <div className="empty-state-sub">When a salesperson adds a "purchase request" note type in the Sales Hub, it appears here with job context, requested item, urgency, and status tracking (pending → approved → ordered → received).</div>
        </div>
      </div>
      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>Example: "Client wants a 21x45 but we only have 21x40 — need to order one more bay." These flow from the Sales Hub automatically.</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PS TRACKER — Production Schedule Readiness
   ═══════════════════════════════════════════════════════════════════ */
function PSTracker({ jobs, onSelectJob }) {
  // Every invoiced/in-progress job needs a Production Schedule
  const psJobs = jobs.map(j => {
    const install = j.cr55d_installdate?.split('T')[0]
    const daysLeft = install ? daysUntil(install) : null
    // PS status would come from cr55d_productionschedules linked to this job
    // For now derive from what we know
    const psStatus = 'not_started' // not_started, in_progress, complete, na
    return { ...j, psStatus, psDaysLeft: daysLeft }
  }).sort((a, b) => {
    // Jobs without PS first, then by install date proximity
    if (a.psStatus !== 'complete' && b.psStatus === 'complete') return -1
    if (a.psStatus === 'complete' && b.psStatus !== 'complete') return 1
    return (a.psDaysLeft ?? 999) - (b.psDaysLeft ?? 999)
  })

  const noPS = psJobs.filter(j => j.psStatus === 'not_started').length
  const urgent = psJobs.filter(j => j.psDaysLeft !== null && j.psDaysLeft <= 14 && j.psStatus !== 'complete').length

  return (
    <div>
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi"><div className="kpi-label">Total Jobs</div><div className="kpi-val">{psJobs.length}</div><div className="kpi-sub">need production schedules</div></div>
        <div className="kpi"><div className="kpi-label">No PS Yet</div><div className="kpi-val" style={{color:'var(--bp-red)'}}>{noPS}</div><div className="kpi-sub">not started</div></div>
        <div className="kpi"><div className="kpi-label">Urgent</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{urgent}</div><div className="kpi-sub">install ≤ 14 days, no PS</div></div>
        <div className="kpi"><div className="kpi-label">Complete</div><div className="kpi-val" style={{color:'var(--bp-green)'}}>{psJobs.filter(j => j.psStatus === 'complete').length}</div><div className="kpi-sub">ready to go</div></div>
      </div>

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">📄</span>
        <div>Every invoiced job needs a Production Schedule before install. Use Ask Ops → "Build Production Schedule" to auto-generate, or mark jobs as N/A if they don't need one (e.g., simple pickup/delivery).</div>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Status</th>
              <th>Job</th>
              <th>Client</th>
              <th>PM</th>
              <th>Install Date</th>
              <th>Days Out</th>
              <th>PS Status</th>
              <th>JULIE</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {psJobs.map(j => {
              const cls = deadlineClass(j.psDaysLeft)
              return (
                <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                  <td><div className={`status-dot ${j.psStatus === 'complete' ? 'green' : cls}`} style={{display:'inline-block'}}></div></td>
                  <td style={{fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_jobname || 'Untitled'}</td>
                  <td>{j.cr55d_clientname || ''}</td>
                  <td style={{fontSize:'11px'}}>{j.cr55d_pmassigned || '—'}</td>
                  <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(j.cr55d_installdate?.split('T')[0])}</td>
                  <td>
                    <span className={`deadline-badge ${cls}`}>
                      {j.psDaysLeft !== null ? (j.psDaysLeft <= 0 ? 'PAST' : `${j.psDaysLeft}d`) : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${j.psStatus === 'complete' ? 'badge-green' : j.psStatus === 'in_progress' ? 'badge-amber' : 'badge-red'}`}>
                      {j.psStatus === 'not_started' ? 'Not Started' : j.psStatus === 'in_progress' ? 'In Progress' : j.psStatus === 'complete' ? 'Complete' : 'N/A'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${j.cr55d_juliestatus ? 'badge-green' : 'badge-gray'}`}>
                      {j.cr55d_juliestatus ? '✓' : '—'}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-primary btn-xs" onClick={() => { try { generateProductionSchedulePDF(j); } catch(e) { alert('Error: ' + e.message) } }}>Generate PS</button>
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
