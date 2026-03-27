import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPost } from '../hooks/useDataverse'
import { generateProductionSchedulePDF } from '../utils/generateDriverSheet'
import { pickAndUploadFile } from '../utils/fileUpload'
import { isoDate, shortDate as sharedShortDate, daysUntil as sharedDaysUntil } from '../utils/dateUtils'
import { ACTIVE_JOBS_FILTER, JOB_FIELDS, optionSet } from '../constants/dataverseFields'

/* ── Helpers ───────────────────────────────────────────────────── */
const shortDate = sharedShortDate
const daysUntil = sharedDaysUntil

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
      const data = await dvFetch(`cr55d_jobs?$select=${JOB_FIELDS}&$filter=${ACTIVE_JOBS_FILTER}&$orderby=cr55d_installdate asc&$top=200`)
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
          <input className="form-input text-md" placeholder="Search jobs..." style={{width:'240px'}} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
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
            <button className="btn btn-ghost btn-xs ml-auto" onClick={() => { setError(null); loadJobs() }}>Retry</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading...</div></div>
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
  const [toast, setToast] = useState(null)
  // Every tent job needs JULIE — 7 days before install
  const julieJobs = jobs.map(j => {
    const installDate = isoDate(j.cr55d_installdate)
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
      <div className="kpi-row-4">
        <div className="kpi"><div className="kpi-label">Total Jobs</div><div className="kpi-val">{julieJobs.length}</div><div className="kpi-sub">requiring JULIE</div></div>
        <div className="kpi"><div className="kpi-label">Completed</div><div className="kpi-val color-green">{julieJobs.length - uncompleted}</div><div className="kpi-sub">confirmed</div></div>
        <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-val color-amber">{uncompleted}</div><div className="kpi-sub">not yet confirmed</div></div>
        <div className="kpi"><div className="kpi-label">Critical</div><div className="kpi-val color-red">{critical}</div><div className="kpi-sub">≤3 days to deadline</div></div>
      </div>

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">ℹ️</span>
        <div>Every tent job requires a JULIE ticket completed 7 days before install. Upload the confirmation PDF by dragging it onto the job row.</div>
      </div>

      <div className="card card-flush">
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
                    <div className={`status-dot ${j.julieStatus === 'completed' ? 'green' : cls}`}></div>
                  </td>
                  <td><div className="truncate font-semibold color-navy text-md" style={{maxWidth:'140px'}}>{j.cr55d_jobname || 'Untitled'}</div></td>
                  <td><div className="truncate text-md" style={{maxWidth:'110px'}}>{j.cr55d_clientname || ''}</div></td>
                  <td><div className="truncate text-md color-muted" style={{maxWidth:'120px'}}>{j.cr55d_venuename || ''}</div></td>
                  <td className="no-wrap text-md">{shortDate(isoDate(j.cr55d_installdate))}</td>
                  <td className="no-wrap text-md font-semibold">{shortDate(j.julieDeadline)}</td>
                  <td>
                    {j.julieStatus === 'completed' ? (
                      <span className="badge badge-green">✓ Done</span>
                    ) : (
                      <span className={`deadline-badge ${cls}`}>
                        {j.julieDaysLeft !== null ? (j.julieDaysLeft <= 0 ? 'OVERDUE' : `${j.julieDaysLeft}d`) : '—'}
                      </span>
                    )}
                  </td>
                  <td><div className="truncate text-md" style={{maxWidth:'80px'}}>{j.cr55d_pmassigned || '—'}</div></td>
                  <td onClick={e => e.stopPropagation()}>
                    {j.julieStatus !== 'completed' && (
                      <button className="btn btn-success btn-xs" onClick={() => {
                        pickAndUploadFile(
                          j.cr55d_jobid,
                          `JULIE Confirmation - ${j.cr55d_clientname || j.cr55d_jobname}`,
                          '.pdf',
                          (name) => { setToast(`Uploaded ${name} to JULIE`); setTimeout(() => setToast(null), 3000) },
                          (err) => { setToast(`Upload failed: ${err}`); setTimeout(() => setToast(null), 4000) }
                        )
                      }}>Upload PDF</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {toast && <div className="toast show info">{toast}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   PERMIT TRACKER
   ═══════════════════════════════════════════════════════════════════ */
function PermitTracker({ jobs, onSelectJob }) {
  const [excludedJobs, setExcludedJobs] = useState(new Set())
  const [toast, setToast] = useState(null)

  const permitJobs = jobs.filter(j => !excludedJobs.has(j.cr55d_jobid)).map(j => {
    const status = j.cr55d_permitstatus || 'not_started'
    const installDate = isoDate(j.cr55d_installdate)
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

      <div className="card card-flush">
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
                  <td><div className="truncate" style={{maxWidth:'140px',fontWeight:600,color:'var(--bp-navy)',fontSize:'11px'}}>{j.cr55d_jobname || 'Untitled'}</div></td>
                  <td><div className="truncate" style={{maxWidth:'110px',fontSize:'11px'}}>{j.cr55d_clientname || ''}</div></td>
                  <td><div className="truncate" style={{maxWidth:'120px',fontSize:'11px',color:'var(--bp-muted)'}}>{j.cr55d_venuename || ''}</div></td>
                  <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(isoDate(j.cr55d_installdate))}</td>
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
                        pickAndUploadFile(
                          j.cr55d_jobid,
                          `Permit - ${j.cr55d_clientname || j.cr55d_jobname}`,
                          '.pdf,.jpg,.png',
                          (name) => { setToast(`Uploaded ${name} to Permit`); setTimeout(() => setToast(null), 3000) },
                          (err) => { setToast(`Upload failed: ${err}`); setTimeout(() => setToast(null), 4000) }
                        )
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
      {toast && <div className="toast show info">{toast}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SUB-RENTAL TRACKER
   ═══════════════════════════════════════════════════════════════════ */
function SubRentalTracker({ jobs }) {
  const [items, setItems] = useState([])
  const [addingItem, setAddingItem] = useState(false)
  const [newItem, setNewItem] = useState({ item: '', vendor: '', deliveryDate: '', pickupDate: '', cost: '', notes: '' })
  const [excludedPortaPotty, setExcludedPortaPotty] = useState(new Set())

  // Load sub-rentals from Dataverse on mount
  useEffect(() => {
    dvFetch('cr55d_subrentals?$orderby=cr55d_deliverydate desc&$top=100')
      .then(data => { if (Array.isArray(data) && data.length) setItems(data.map(r => ({ id: r.cr55d_subrentalid, item: r.cr55d_item || '', vendor: r.cr55d_vendor || '', cost: r.cr55d_cost ? `$${r.cr55d_cost}` : '', deliveryDate: isoDate(r.cr55d_deliverydate) || '', pickupDate: isoDate(r.cr55d_returndate) || '', notes: r.cr55d_notes || '', status: 'pending' }))) })
      .catch(() => {})
  }, [])

  // Multi-day jobs auto-flag for porta-potty
  const multiDayJobs = jobs.filter(j => {
    if (excludedPortaPotty.has(j.cr55d_jobid)) return false
    if (!j.cr55d_installdate || !j.cr55d_strikedate) return false
    const days = Math.ceil((new Date(isoDate(j.cr55d_strikedate) + 'T12:00:00') - new Date(isoDate(j.cr55d_installdate) + 'T12:00:00')) / 86400000)
    return days > 1
  })

  return (
    <div>
      <div className="grid-2 mb-16">
        {/* Sub-Rentals */}
        <div className="card" style={{padding:'16px'}}>
          <div className="flex-between mb-12">
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--bp-navy)'}}>Sub-Rental Items</span>
            <button className="btn btn-primary btn-sm" onClick={() => setAddingItem(true)}>+ Add Item</button>
          </div>
          {addingItem && (
            <div className="card" style={{padding:'12px',marginBottom:'10px',background:'rgba(46,125,82,.03)',border:'1.5px solid var(--bp-green)'}}>
              <div className="form-row form-row-3" style={{gap:'8px',marginBottom:'8px'}}>
                <div><label className="form-label">Item</label><input className="form-input" placeholder="e.g., 20x20 tent, dance floor panels" value={newItem.item} onChange={e => setNewItem(p => ({...p, item: e.target.value}))} autoFocus /></div>
                <div><label className="form-label">Vendor</label><input className="form-input" placeholder="Vendor name" value={newItem.vendor} onChange={e => setNewItem(p => ({...p, vendor: e.target.value}))} /></div>
                <div><label className="form-label">Est. Cost</label><input className="form-input" placeholder="$0" value={newItem.cost} onChange={e => setNewItem(p => ({...p, cost: e.target.value}))} /></div>
              </div>
              <div className="form-row form-row-3" style={{gap:'8px',marginBottom:'8px'}}>
                <div><label className="form-label">Delivery Date</label><input type="date" className="form-input" value={newItem.deliveryDate} onChange={e => setNewItem(p => ({...p, deliveryDate: e.target.value}))} /></div>
                <div><label className="form-label">Pickup Date</label><input type="date" className="form-input" value={newItem.pickupDate} onChange={e => setNewItem(p => ({...p, pickupDate: e.target.value}))} /></div>
                <div><label className="form-label">Notes</label><input className="form-input" placeholder="Reminder, special instructions" value={newItem.notes} onChange={e => setNewItem(p => ({...p, notes: e.target.value}))} /></div>
              </div>
              <div className="flex gap-6">
                <button className="btn btn-success btn-sm" onClick={async () => { if (!newItem.item.trim()) return; const local = { ...newItem, id: Date.now(), status: 'pending' }; setItems(prev => [...prev, local]); setNewItem({ item: '', vendor: '', deliveryDate: '', pickupDate: '', cost: '', notes: '' }); setAddingItem(false); try { await dvPost('cr55d_subrentals', { cr55d_item: newItem.item, cr55d_vendor: newItem.vendor, cr55d_cost: parseFloat(newItem.cost.replace(/[^0-9.]/g, '')) || 0, cr55d_deliverydate: newItem.deliveryDate || null, cr55d_returndate: newItem.pickupDate || null, cr55d_notes: newItem.notes }) } catch (e) { console.error('[OpsAdmin] Sub-rental save failed:', e) } }}>Add Sub-Rental</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingItem(false)}>Cancel</button>
              </div>
            </div>
          )}
          {items.length > 0 ? (
            <div style={{maxHeight:'200px',overflowY:'auto'}}>
              {items.map((item, i) => (
                <div key={item.id} className="flex-between" style={{padding:'8px 0',borderBottom: i < items.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                  <div>
                    <div style={{fontSize:'12px',fontWeight:600,color:'var(--bp-navy)'}}>{item.item}</div>
                    <div style={{fontSize:'10px',color:'var(--bp-muted)'}}>{item.vendor}{item.cost ? ` · ${item.cost}` : ''}{item.notes ? ` · ${item.notes}` : ''}</div>
                  </div>
                  <span className="badge badge-amber">{item.status}</span>
                </div>
              ))}
            </div>
          ) : !addingItem ? (
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
                const days = Math.ceil((new Date(isoDate(j.cr55d_strikedate) + 'T12:00:00') - new Date(isoDate(j.cr55d_installdate) + 'T12:00:00')) / 86400000)
                return (
                  <div key={j.cr55d_jobid} className="flex-between" style={{padding:'8px 0',borderBottom: i < multiDayJobs.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:600,color:'var(--bp-navy)'}}>{j.cr55d_clientname}</div>
                      <div style={{fontSize:'10px',color:'var(--bp-muted)'}}>{days} days · {shortDate(isoDate(j.cr55d_installdate))}</div>
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
  const [psMap, setPsMap] = useState({})
  useEffect(() => {
    dvFetch('cr55d_productionschedules?$select=cr55d_productionscheduleid,_cr55d_job_value&$top=500')
      .then(data => {
        if (!Array.isArray(data)) return
        const map = {}
        data.forEach(ps => { if (ps._cr55d_job_value) map[ps._cr55d_job_value] = true })
        setPsMap(map)
      })
      .catch(() => {})
  }, [jobs.length])
  const psJobs = jobs.map(j => {
    const install = isoDate(j.cr55d_installdate)
    const daysLeft = install ? daysUntil(install) : null
    const psStatus = psMap[j.cr55d_jobid] ? 'complete' : 'not_started'
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
      <div className="kpi-row-4">
        <div className="kpi"><div className="kpi-label">Total Jobs</div><div className="kpi-val">{psJobs.length}</div><div className="kpi-sub">need production schedules</div></div>
        <div className="kpi"><div className="kpi-label">No PS Yet</div><div className="kpi-val color-red">{noPS}</div><div className="kpi-sub">not started</div></div>
        <div className="kpi"><div className="kpi-label">Urgent</div><div className="kpi-val color-amber">{urgent}</div><div className="kpi-sub">install ≤ 14 days, no PS</div></div>
        <div className="kpi"><div className="kpi-label">Complete</div><div className="kpi-val color-green">{psJobs.filter(j => j.psStatus === 'complete').length}</div><div className="kpi-sub">ready to go</div></div>
      </div>

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">📄</span>
        <div>Every invoiced job needs a Production Schedule before install. Use Ask Ops → "Build Production Schedule" to auto-generate, or mark jobs as N/A if they don't need one (e.g., simple pickup/delivery).</div>
      </div>

      <div className="card card-flush">
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
                  <td><div className={`status-dot ${j.psStatus === 'complete' ? 'green' : cls}`}></div></td>
                  <td className="font-semibold color-navy">{j.cr55d_jobname || 'Untitled'}</td>
                  <td>{j.cr55d_clientname || ''}</td>
                  <td style={{fontSize:'11px'}}>{j.cr55d_pmassigned || '—'}</td>
                  <td className="no-wrap" style={{fontSize:'11px'}}>{shortDate(isoDate(j.cr55d_installdate))}</td>
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
                    <button className="btn btn-primary btn-xs" onClick={() => { try { generateProductionSchedulePDF(j); } catch(e) { console.error('[OpsAdmin] Error:', e) } }}>Generate PS</button>
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
