import { useState, useEffect, useMemo, useRef } from 'react'
import { dvFetch, dvPost, dvPatch, dvDelete } from '../hooks/useDataverse'
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

// Normalize JULIE/Permit status — Dataverse may return integer option set or string
const JULIE_STATUS_MAP = { 408420000: 'not_started', 408420001: 'requested', 408420002: 'completed', 408420003: 'expired' }
const PERMIT_STATUS_MAP = { 408420000: 'not_started', 408420001: 'pending', 408420002: 'approved', 408420003: 'submitted' }
function normalizeStatus(val, map) {
  if (val == null) return 'not_started'
  const num = Number(val)
  if (!isNaN(num) && map[num]) return map[num]
  return String(val)
}

/* ── Main Component ────────────────────────────────────────────── */
export default function OpsAdmin({ onSelectJob }) {
  const [subTab, setSubTab] = useState('julie')
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(null)

  const initialLoadRef = useRef(true)
  const failCountRef = useRef(0)

  useEffect(() => {
    loadJobs()
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
    } catch (e) { console.error('[OpsAdmin] Load:', e); setError(e.message); failCountRef.current = Math.min(failCountRef.current + 1, 5) }
    finally { setLoading(false); initialLoadRef.current = false }
  }

  const julieNeedAction = jobs.filter(j => !j.cr55d_juliestatus || (typeof j.cr55d_juliestatus === 'string' && j.cr55d_juliestatus !== 'completed') || (typeof j.cr55d_juliestatus === 'number' && j.cr55d_juliestatus !== 408420002)).length
  const permitNeedAction = jobs.filter(j => !j.cr55d_permitstatus || (typeof j.cr55d_permitstatus === 'string' && j.cr55d_permitstatus !== 'approved') || (typeof j.cr55d_permitstatus === 'number' && j.cr55d_permitstatus !== 408420002)).length
  const tabs = [
    { id: 'julie', label: 'JULIE Tracker', icon: '🔴', count: julieNeedAction },
    { id: 'permits', label: 'Permits', icon: '📋', count: permitNeedAction },
    { id: 'subrentals', label: 'Sub-Rentals', icon: '📦' },
    { id: 'purchase', label: 'Purchase Requests', icon: '🛒' },
    { id: 'pstracker', label: 'PS Tracker', icon: '📄' },
    { id: 'holidays', label: 'Holidays', icon: '🗓️' },
    { id: 'tempworkers', label: 'Temp Workers', icon: '👷' },
    { id: 'availability', label: 'Availability', icon: '📅' },
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
          {subTab === 'holidays' && <HolidayManager />}
          {subTab === 'tempworkers' && <TempWorkerManager />}
          {subTab === 'availability' && <AvailabilityManager />}
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
    const status = normalizeStatus(j.cr55d_juliestatus, JULIE_STATUS_MAP)
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
              <th style={{width:'110px'}}>Action</th>
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
    const status = normalizeStatus(j.cr55d_permitstatus, PERMIT_STATUS_MAP)
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
              <th style={{width:'130px'}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {permitJobs.map(j => {
              const cls = deadlineClass(j.permitDaysLeft)
              return (
                <tr key={j.cr55d_jobid} className="clickable" onClick={() => onSelectJob && onSelectJob(j)}>
                  <td><div className={`status-dot ${j.permitStatus === 'approved' ? 'green' : cls}`}></div></td>
                  <td><div className="truncate font-semibold color-navy text-md" style={{maxWidth:'140px'}}>{j.cr55d_jobname || 'Untitled'}</div></td>
                  <td><div className="truncate text-md" style={{maxWidth:'110px'}}>{j.cr55d_clientname || ''}</div></td>
                  <td><div className="truncate text-md color-muted" style={{maxWidth:'120px'}}>{j.cr55d_venuename || ''}</div></td>
                  <td className="no-wrap text-md">{shortDate(isoDate(j.cr55d_installdate))}</td>
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
                  <td><div className="truncate text-md" style={{maxWidth:'80px'}}>{j.cr55d_pmassigned || '—'}</div></td>
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
                      <button className="btn btn-ghost btn-xs color-light text-2xs" onClick={(e) => toggleExclude(j.cr55d_jobid, e)}>Not Required</button>
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
  const [savingItem, setSavingItem] = useState(false)
  const [toast, setToast] = useState(null)
  const [newItem, setNewItem] = useState({ item: '', vendor: '', deliveryDate: '', pickupDate: '', cost: '', notes: '' })
  const [excludedPortaPotty, setExcludedPortaPotty] = useState(new Set())

  function showToast(msg, type = 'info') { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  // Load sub-rentals from Dataverse on mount
  useEffect(() => {
    dvFetch('cr55d_subrentals?$orderby=cr55d_deliverydate desc&$top=100')
      .then(data => { if (Array.isArray(data) && data.length) setItems(data.map(r => ({ id: r.cr55d_subrentalid, item: r.cr55d_item || '', vendor: r.cr55d_vendor || '', cost: r.cr55d_cost ? `$${r.cr55d_cost}` : '', deliveryDate: isoDate(r.cr55d_deliverydate) || '', pickupDate: isoDate(r.cr55d_returndate) || '', notes: r.cr55d_notes || '', status: 'pending' }))) })
      .catch(() => { showToast('Failed to load sub-rentals', 'error') })
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
            <span className="text-lg font-bold color-navy">Sub-Rental Items</span>
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
                <button className="btn btn-success btn-sm" disabled={savingItem || !newItem.item.trim()} onClick={async () => {
                  if (!newItem.item.trim() || savingItem) return
                  setSavingItem(true)
                  const local = { ...newItem, id: Date.now(), status: 'pending' }
                  setItems(prev => [...prev, local])
                  setNewItem({ item: '', vendor: '', deliveryDate: '', pickupDate: '', cost: '', notes: '' })
                  setAddingItem(false)
                  try {
                    await dvPost('cr55d_subrentals', { cr55d_item: newItem.item, cr55d_vendor: newItem.vendor, cr55d_cost: parseFloat(newItem.cost.replace(/[^0-9.]/g, '')) || 0, cr55d_deliverydate: newItem.deliveryDate || null, cr55d_returndate: newItem.pickupDate || null, cr55d_notes: newItem.notes })
                    showToast('Sub-rental added', 'success')
                    dvPost('cr55d_notifications', { cr55d_name: 'Sub-Rental Added: ' + newItem.item, cr55d_description: `${newItem.item} from ${newItem.vendor || 'TBD'}`, cr55d_notificationtype: 'sub_rental', cr55d_author: 'Ops Base Camp' }).catch(() => {})
                  } catch (e) {
                    showToast('Failed to save sub-rental: ' + e.message, 'error')
                    setItems(prev => prev.filter(i => i.id !== local.id))
                  } finally { setSavingItem(false) }
                }}>{savingItem ? 'Saving...' : 'Add Sub-Rental'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingItem(false)}>Cancel</button>
              </div>
            </div>
          )}
          {items.length > 0 ? (
            <div style={{maxHeight:'200px',overflowY:'auto'}}>
              {items.map((item, i) => (
                <div key={item.id} className="flex-between" style={{padding:'8px 0',borderBottom: i < items.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                  <div>
                    <div className="text-base font-semibold color-navy">{item.item}</div>
                    <div className="text-sm color-muted">{item.vendor}{item.cost ? ` · ${item.cost}` : ''}{item.notes ? ` · ${item.notes}` : ''}</div>
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
            <span className="text-lg font-bold color-navy">🚽 Crew Porta-Potty</span>
            <span className="badge badge-navy">{multiDayJobs.length} flagged</span>
          </div>
          <div className="text-md color-muted mb-12">
            Multi-day jobs auto-flagged. Toggle off if venue provides facilities.
          </div>
          {multiDayJobs.length === 0 ? (
            <div className="text-base color-light text-center" style={{padding:'16px'}}>No multi-day jobs to flag</div>
          ) : (
            <div style={{maxHeight:'300px',overflowY:'auto'}}>
              {multiDayJobs.map((j, i) => {
                const days = Math.ceil((new Date(isoDate(j.cr55d_strikedate) + 'T12:00:00') - new Date(isoDate(j.cr55d_installdate) + 'T12:00:00')) / 86400000)
                return (
                  <div key={j.cr55d_jobid} className="flex-between" style={{padding:'8px 0',borderBottom: i < multiDayJobs.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                    <div>
                      <div className="text-base font-semibold color-navy">{j.cr55d_clientname}</div>
                      <div className="text-sm color-muted">{days} days · {shortDate(isoDate(j.cr55d_installdate))}</div>
                    </div>
                    <div className="flex gap-4">
                      <span className="badge badge-amber">Needs Order</span>
                      <button className="btn btn-ghost btn-xs text-2xs" onClick={() => setExcludedPortaPotty(prev => { const next = new Set(prev); next.add(j.cr55d_jobid); return next })}>Not Needed</button>
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
      {toast && <div className={`toast show ${toast.type || 'info'}`}>{toast.msg}</div>}
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
                    {(() => {
                      const js = normalizeStatus(j.cr55d_juliestatus, JULIE_STATUS_MAP)
                      return <span className={`badge ${js === 'completed' ? 'badge-green' : js === 'not_started' ? 'badge-gray' : 'badge-amber'}`}>
                        {js === 'completed' ? '✓' : js === 'not_started' ? '—' : js}
                      </span>
                    })()}
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

/* ── Holiday Manager ──────────────────────────────────────────── */
function HolidayManager() {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', date: '', workersavailable: 0 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadHolidays() }, [])

  async function loadHolidays() {
    setLoading(true)
    try {
      const data = await dvFetch('cr55d_holidays?$orderby=cr55d_holidaydate asc&$top=100')
      setHolidays(Array.isArray(data) ? data : [])
    } catch (e) { console.error('[Holidays] Load failed:', e) }
    finally { setLoading(false) }
  }

  async function addHoliday() {
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      await dvPost('cr55d_holidays', {
        cr55d_name: form.name.trim(),
        cr55d_holidaydate: form.date,
        cr55d_workersavailable: parseInt(form.workersavailable, 10) || 0,
      })
      setForm({ name: '', date: '', workersavailable: 0 })
      await loadHolidays()
    } catch (e) { console.error('[Holidays] Add failed:', e) }
    finally { setSaving(false) }
  }

  async function removeHoliday(id) {
    try {
      await dvDelete(`cr55d_holidays(${id})`)
      await loadHolidays()
    } catch (e) { console.error('[Holidays] Delete failed:', e) }
  }

  return (
    <div className="card" style={{padding:'20px'}}>
      <h3 className="text-lg font-bold color-navy mb-12">Company Holidays</h3>
      <p className="text-md color-muted mb-16">Holidays show in orange on the PM Capacity calendar and override available worker counts.</p>

      <div style={{display:'flex',gap:'8px',alignItems:'flex-end',marginBottom:'16px',flexWrap:'wrap'}}>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Holiday Name</label>
          <input className="form-input" placeholder="e.g. Memorial Day" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Workers Avail</label>
          <input className="form-input" type="number" min="0" style={{width:'80px'}} value={form.workersavailable} onChange={e => setForm(p => ({...p, workersavailable: e.target.value}))} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={addHoliday} disabled={saving}>{saving ? 'Adding...' : '+ Add'}</button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="loading-spinner"></div></div>
      ) : holidays.length === 0 ? (
        <div className="text-md color-muted" style={{padding:'16px 0'}}>No holidays defined yet</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Holiday</th><th>Date</th><th>Workers Avail</th><th></th></tr></thead>
          <tbody>
            {holidays.map(h => (
              <tr key={h.cr55d_holidayid}>
                <td className="font-semibold" style={{color:'var(--bp-amber)'}}>{h.cr55d_name}</td>
                <td className="font-mono">{h.cr55d_holidaydate ? shortDate(h.cr55d_holidaydate.split('T')[0]) : '—'}</td>
                <td>{h.cr55d_workersavailable ?? 0}</td>
                <td><button className="btn btn-ghost btn-xs" style={{color:'var(--bp-red)'}} onClick={() => removeHoliday(h.cr55d_holidayid)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ── Temp Worker Manager ──────────────────────────────────────── */
function TempWorkerManager() {
  const [temps, setTemps] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ companyname: '', headcount: '', startdate: '', enddate: '', costperday: '', notes: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadTemps() }, [])

  async function loadTemps() {
    setLoading(true)
    try {
      const data = await dvFetch('cr55d_tempworkers?$orderby=cr55d_startdate desc&$top=100')
      setTemps(Array.isArray(data) ? data : [])
    } catch (e) { console.error('[TempWorkers] Load failed:', e) }
    finally { setLoading(false) }
  }

  async function addTemp() {
    if (!form.companyname.trim() || !form.headcount || !form.startdate || !form.enddate) return
    setSaving(true)
    try {
      await dvPost('cr55d_tempworkers', {
        cr55d_companyname: form.companyname.trim(),
        cr55d_headcount: parseInt(form.headcount, 10),
        cr55d_startdate: form.startdate,
        cr55d_enddate: form.enddate,
        cr55d_costperday: form.costperday ? parseFloat(form.costperday) : null,
        cr55d_notes: form.notes.trim(),
      })
      setForm({ companyname: '', headcount: '', startdate: '', enddate: '', costperday: '', notes: '' })
      await loadTemps()
    } catch (e) { console.error('[TempWorkers] Add failed:', e) }
    finally { setSaving(false) }
  }

  async function removeTemp(id) {
    try {
      await dvDelete(`cr55d_tempworkers(${id})`)
      await loadTemps()
    } catch (e) { console.error('[TempWorkers] Delete failed:', e) }
  }

  return (
    <div className="card" style={{padding:'20px'}}>
      <h3 className="text-lg font-bold color-navy mb-12">Temp Worker Bookings</h3>
      <p className="text-md color-muted mb-16">Track temporary staffing — company, headcount, and dates. Temp workers are added to available capacity on the PM calendar.</p>

      <div style={{display:'flex',gap:'8px',alignItems:'flex-end',marginBottom:'16px',flexWrap:'wrap'}}>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Company</label>
          <input className="form-input" placeholder="e.g. Labor Ready" value={form.companyname} onChange={e => setForm(p => ({...p, companyname: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Headcount</label>
          <input className="form-input" type="number" min="1" style={{width:'80px'}} value={form.headcount} onChange={e => setForm(p => ({...p, headcount: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">Start</label>
          <input className="form-input" type="date" value={form.startdate} onChange={e => setForm(p => ({...p, startdate: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">End</label>
          <input className="form-input" type="date" value={form.enddate} onChange={e => setForm(p => ({...p, enddate: e.target.value}))} />
        </div>
        <div className="form-group" style={{margin:0}}>
          <label className="form-label">$/Day</label>
          <input className="form-input" type="number" min="0" style={{width:'90px'}} value={form.costperday} onChange={e => setForm(p => ({...p, costperday: e.target.value}))} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={addTemp} disabled={saving}>{saving ? 'Adding...' : '+ Add'}</button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="loading-spinner"></div></div>
      ) : temps.length === 0 ? (
        <div className="text-md color-muted" style={{padding:'16px 0'}}>No temp workers booked</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Company</th><th>Workers</th><th>Start</th><th>End</th><th>$/Day</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {temps.map(t => (
              <tr key={t.cr55d_tempworkerid}>
                <td className="font-semibold">{t.cr55d_companyname}</td>
                <td className="font-mono">{t.cr55d_headcount}</td>
                <td className="font-mono">{t.cr55d_startdate ? shortDate(t.cr55d_startdate.split('T')[0]) : '—'}</td>
                <td className="font-mono">{t.cr55d_enddate ? shortDate(t.cr55d_enddate.split('T')[0]) : '—'}</td>
                <td className="font-mono">{t.cr55d_costperday ? '$' + Number(t.cr55d_costperday).toLocaleString() : '—'}</td>
                <td className="text-md color-muted">{t.cr55d_notes || ''}</td>
                <td><button className="btn btn-ghost btn-xs" style={{color:'var(--bp-red)'}} onClick={() => removeTemp(t.cr55d_tempworkerid)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   AVAILABILITY MANAGER — PTO, blockouts, and recurring unavailability
   Uses cr55d_employeeblockouts Dataverse table
   ═══════════════════════════════════════════════════════════════════ */
function AvailabilityManager() {
  const [blockouts, setBlockouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [staffNames, setStaffNames] = useState([])
  const [form, setForm] = useState({ employee: '', startdate: '', enddate: '', reason: '', type: 'pto' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState('upcoming')

  useEffect(() => { loadBlockouts(); loadStaff() }, [])

  async function loadBlockouts() {
    setLoading(true)
    try {
      const data = await dvFetch('cr55d_employeeblockouts?$select=cr55d_employeeblockoutid,cr55d_employeename,cr55d_startdate,cr55d_enddate,cr55d_reason,cr55d_blockouttype,cr55d_status,createdon&$orderby=cr55d_startdate desc&$top=200')
      setBlockouts(Array.isArray(data) ? data : [])
    } catch {
      try { setBlockouts(JSON.parse(localStorage.getItem('bpt_blockouts') || '[]')) } catch { setBlockouts([]) }
    } finally { setLoading(false) }
  }

  async function loadStaff() {
    try {
      const data = await dvFetch('cr55d_stafflists?$select=cr55d_stafflistid,cr55d_name&$filter=cr55d_status eq 306280000&$top=200&$orderby=cr55d_name asc')
      setStaffNames((data || []).map(s => s.cr55d_name?.split(',').reverse().map(p => p.trim()).join(' ') || s.cr55d_name || '').filter(Boolean))
    } catch { /* manual entry fallback */ }
  }

  async function addBlockout() {
    if (!form.employee || !form.startdate || !form.enddate) return
    setSaving(true)
    const record = { cr55d_employeename: form.employee, cr55d_startdate: form.startdate, cr55d_enddate: form.enddate, cr55d_reason: form.reason, cr55d_blockouttype: form.type, cr55d_status: 'active' }
    try {
      await dvPost('cr55d_employeeblockouts', record)
      setForm({ employee: '', startdate: '', enddate: '', reason: '', type: 'pto' })
      setToast('Blockout added'); setTimeout(() => setToast(null), 3000)
      loadBlockouts()
    } catch {
      const local = [...blockouts, { ...record, cr55d_employeeblockoutid: 'local_' + Date.now(), createdon: new Date().toISOString() }]
      setBlockouts(local)
      try { localStorage.setItem('bpt_blockouts', JSON.stringify(local)) } catch {}
      setForm({ employee: '', startdate: '', enddate: '', reason: '', type: 'pto' })
      setToast('Saved locally (Dataverse table may need creation)'); setTimeout(() => setToast(null), 4000)
    } finally { setSaving(false) }
  }

  async function removeBlockout(id) {
    if (String(id).startsWith('local_')) {
      const next = blockouts.filter(b => b.cr55d_employeeblockoutid !== id)
      setBlockouts(next); try { localStorage.setItem('bpt_blockouts', JSON.stringify(next)) } catch {}
      return
    }
    try { await dvDelete(`cr55d_employeeblockouts(${id})`); loadBlockouts() } catch (e) { console.error('[Availability] Delete:', e) }
  }

  const today = new Date().toISOString().split('T')[0]
  const TYPE_LABELS = { pto: 'PTO', sick: 'Sick', vacation: 'Vacation', training: 'Training', personal: 'Personal', other: 'Other' }
  const TYPE_BADGES = { pto: 'badge-blue', sick: 'badge-red', vacation: 'badge-green', training: 'badge-purple', personal: 'badge-amber', other: 'badge-gray' }

  const filtered = blockouts.filter(b => {
    const end = (b.cr55d_enddate || '').split('T')[0]
    const start = (b.cr55d_startdate || '').split('T')[0]
    if (filter === 'upcoming') return end >= today
    if (filter === 'active') return start <= today && end >= today
    return true
  })

  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndISO = weekEnd.toISOString().split('T')[0]
  const thisWeek = blockouts.filter(b => { const s = (b.cr55d_startdate || '').split('T')[0]; return s >= today && s <= weekEndISO })
  const activeNow = blockouts.filter(b => { const s = (b.cr55d_startdate || '').split('T')[0]; const e = (b.cr55d_enddate || '').split('T')[0]; return s <= today && e >= today })

  return (
    <div>
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Total Blockouts</div><div className="kpi-val">{blockouts.length}</div><div className="kpi-sub">all records</div></div>
        <div className="kpi"><div className="kpi-label">Out This Week</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{thisWeek.length}</div><div className="kpi-sub">starting next 7 days</div></div>
        <div className="kpi"><div className="kpi-label">Out Today</div><div className="kpi-val color-red">{activeNow.length}</div><div className="kpi-sub">currently unavailable</div></div>
        <div className="kpi"><div className="kpi-label">Upcoming</div><div className="kpi-val color-navy">{blockouts.filter(b => (b.cr55d_startdate || '').split('T')[0] >= today).length}</div><div className="kpi-sub">future blockouts</div></div>
      </div>

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">📅</span>
        <div>Track employee time off, PTO, sick days, and other unavailability. These blockouts inform the Crew Schedule when assigning workers to jobs.</div>
      </div>

      {/* Add Form */}
      <div className="card mb-12" style={{padding:'12px'}}>
        <div className="text-sm font-bold color-navy mb-6">Add Blockout</div>
        <div style={{display:'flex',gap:'8px',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Employee</label>
            {staffNames.length > 0 ? (
              <select className="form-input" value={form.employee} onChange={e => setForm(p => ({...p, employee: e.target.value}))}>
                <option value="">Select employee</option>
                {staffNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <input className="form-input" placeholder="Employee name" value={form.employee} onChange={e => setForm(p => ({...p, employee: e.target.value}))} />
            )}
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Type</label>
            <select className="form-input" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}>
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Start</label>
            <input className="form-input" type="date" value={form.startdate} onChange={e => setForm(p => ({...p, startdate: e.target.value}))} />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">End</label>
            <input className="form-input" type="date" value={form.enddate} onChange={e => setForm(p => ({...p, enddate: e.target.value}))} />
          </div>
          <div className="form-group" style={{margin:0,flex:1,minWidth:'120px'}}>
            <label className="form-label">Reason</label>
            <input className="form-input" placeholder="Optional notes" value={form.reason} onChange={e => setForm(p => ({...p, reason: e.target.value}))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={addBlockout} disabled={saving || !form.employee || !form.startdate || !form.enddate}>{saving ? 'Adding...' : '+ Add'}</button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-6 mb-12">
        {[{ id: 'upcoming', label: 'Upcoming' }, { id: 'active', label: 'Active Now' }, { id: 'all', label: 'All' }].map(f => (
          <button key={f.id} className={`pill pill-sm${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading...</div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">📅</div><div className="empty-state-title">No blockouts</div><div className="empty-state-sub">{filter === 'upcoming' ? 'No upcoming time off' : 'No records found'}</div></div></div>
      ) : (
        <div className="card card-flush">
          <table className="tbl">
            <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th className="r">Days</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(b => {
                const start = (b.cr55d_startdate || '').split('T')[0]
                const end = (b.cr55d_enddate || '').split('T')[0]
                const days = start && end ? Math.max(1, Math.ceil((new Date(end + 'T12:00:00') - new Date(start + 'T12:00:00')) / 86400000) + 1) : '?'
                const isActive = start <= today && end >= today
                const isPast = end < today
                const type = b.cr55d_blockouttype || 'other'
                return (
                  <tr key={b.cr55d_employeeblockoutid} style={{opacity: isPast ? .5 : 1}}>
                    <td className="font-semibold color-navy">{b.cr55d_employeename || '—'}</td>
                    <td><span className={`badge ${TYPE_BADGES[type] || 'badge-gray'}`} style={{fontSize:'9px'}}>{TYPE_LABELS[type] || type}</span></td>
                    <td className="mono text-sm">{shortDate(start)}</td>
                    <td className="mono text-sm">{shortDate(end)}</td>
                    <td className="r mono font-bold">{days}</td>
                    <td className="text-sm color-muted">{b.cr55d_reason || '—'}</td>
                    <td>{isActive ? <span className="badge badge-red" style={{fontSize:'9px'}}>Out Now</span> : isPast ? <span className="badge badge-gray" style={{fontSize:'9px'}}>Past</span> : <span className="badge badge-blue" style={{fontSize:'9px'}}>Scheduled</span>}</td>
                    <td><button className="btn btn-ghost btn-xs" style={{color:'var(--bp-red)'}} onClick={() => removeBlockout(b.cr55d_employeeblockoutid)}>Remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {toast && <div className="toast show info">{toast}</div>}
    </div>
  )
}
