import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch, dvPost } from '../../hooks/useDataverse'
import { isoDate, shortDate } from '../../utils/dateUtils'

/* ── Constants ─────────────────────────────────────────────────── */
const BOOKING_TYPES = { 306280000: 'Flight', 306280001: 'Hotel', 306280002: 'Rental Car' }
const BOOKING_TYPE_ICONS = { 306280000: '\u2708', 306280001: '\u{1F3E8}', 306280002: '\u{1F697}' }
const BOOKING_STATUSES = { 306280000: 'Booked', 306280001: 'Confirmed', 306280002: 'Cancelled', 306280003: 'Completed' }
const BOOKING_STATUS_BADGE = { 306280000: 'badge-amber', 306280001: 'badge-green', 306280002: 'badge-red', 306280003: 'badge-navy' }
const BOOKING_FIELDS = 'cr55d_travelbookingid,cr55d_type,cr55d_jobname,cr55d_crewmember,cr55d_provider,cr55d_confirmationnumber,cr55d_startdate,cr55d_enddate,cr55d_cost,cr55d_notes,cr55d_status,cr55d_jobid'

const EMPTY_BOOKING = {
  cr55d_type: 306280000,
  cr55d_jobname: '',
  cr55d_jobid: '',
  cr55d_crewmember: '',
  cr55d_provider: '',
  cr55d_confirmationnumber: '',
  cr55d_startdate: '',
  cr55d_enddate: '',
  cr55d_cost: '',
  cr55d_notes: '',
  cr55d_status: 306280000,
}

/* ── Helpers ───────────────────────────────────────────────────── */
function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

/* ── Component ─────────────────────────────────────────────────── */
export default function TravelTracker({ jobs, staff }) {
  const [bookings, setBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_BOOKING })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const activeJobs = useMemo(() =>
    jobs.filter(j => j.cr55d_venuename || j.cr55d_venueaddress)
      .sort((a, b) => (a.cr55d_jobname || '').localeCompare(b.cr55d_jobname || '')),
    [jobs]
  )

  const crewNames = useMemo(() => {
    if (!staff?.length) return []
    return staff
      .filter(s => s.cr55d_status === 306280000 || s.cr55d_status == null)
      .map(s => {
        const n = s.cr55d_name || ''
        if (n.includes(',')) { const p = n.split(','); return `${p[1]?.trim()} ${p[0]?.trim()}` }
        return n
      })
      .filter(Boolean)
      .sort()
  }, [staff])

  async function loadBookings() {
    setLoadingBookings(true)
    setLoadError(null)
    try {
      const data = await dvFetch(`cr55d_travelbookings?$select=${BOOKING_FIELDS}&$orderby=cr55d_startdate asc`)
      setBookings(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('[Travel] Load failed:', e.message)
      setLoadError(e.message)
      setBookings([])
    } finally {
      setLoadingBookings(false)
    }
  }

  useEffect(() => { loadBookings() }, [])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openAdd() {
    setEditId(null)
    setForm({ ...EMPTY_BOOKING })
    setShowModal(true)
  }

  function openEdit(b) {
    setEditId(b.cr55d_travelbookingid)
    setForm({
      cr55d_type: b.cr55d_type ?? 306280000,
      cr55d_jobname: b.cr55d_jobname || '',
      cr55d_jobid: b.cr55d_jobid || '',
      cr55d_crewmember: b.cr55d_crewmember || '',
      cr55d_provider: b.cr55d_provider || '',
      cr55d_confirmationnumber: b.cr55d_confirmationnumber || '',
      cr55d_startdate: b.cr55d_startdate ? b.cr55d_startdate.split('T')[0] : '',
      cr55d_enddate: b.cr55d_enddate ? b.cr55d_enddate.split('T')[0] : '',
      cr55d_cost: b.cr55d_cost ?? '',
      cr55d_notes: b.cr55d_notes || '',
      cr55d_status: b.cr55d_status ?? 306280000,
    })
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditId(null); setConfirmDelete(null) }

  function updateForm(key, val) { setForm(p => ({ ...p, [key]: val })) }

  async function handleSave() {
    if (!form.cr55d_jobname.trim()) { showToast('Job is required', 'error'); return }
    if (!form.cr55d_crewmember.trim()) { showToast('Crew member is required', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        cr55d_type: Number(form.cr55d_type),
        cr55d_jobname: form.cr55d_jobname.trim(),
        cr55d_jobid: form.cr55d_jobid || null,
        cr55d_crewmember: form.cr55d_crewmember.trim(),
        cr55d_provider: form.cr55d_provider.trim(),
        cr55d_confirmationnumber: form.cr55d_confirmationnumber.trim(),
        cr55d_startdate: form.cr55d_startdate || null,
        cr55d_enddate: form.cr55d_enddate || null,
        cr55d_cost: form.cr55d_cost ? Number(form.cr55d_cost) : null,
        cr55d_notes: form.cr55d_notes.trim(),
        cr55d_status: Number(form.cr55d_status),
      }
      if (editId) {
        await dvPatch(`cr55d_travelbookings(${editId})`, payload)
        showToast('Booking updated')
      } else {
        await dvPost('cr55d_travelbookings', payload)
        showToast('Booking added')
      }
      closeModal()
      await loadBookings()
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  async function handleDelete(id) {
    setSaving(true)
    try {
      await dvPatch(`cr55d_travelbookings(${id})`, { cr55d_status: 306280002 })
      showToast('Booking cancelled')
      setConfirmDelete(null)
      closeModal()
      await loadBookings()
    } catch (e) {
      showToast('Cancel failed: ' + e.message, 'error')
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings.filter(b => b.cr55d_status !== 306280002)
    if (filter === 'cancelled') return bookings.filter(b => b.cr55d_status === 306280002)
    return bookings.filter(b => b.cr55d_type === Number(filter) && b.cr55d_status !== 306280002)
  }, [bookings, filter])

  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(b => {
      const key = b.cr55d_jobname || 'Unassigned'
      if (!map[key]) map[key] = []
      map[key].push(b)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const totalSpend = useMemo(() => bookings.filter(b => b.cr55d_status !== 306280002).reduce((s, b) => s + (b.cr55d_cost || 0), 0), [bookings])
  const activeCount = bookings.filter(b => b.cr55d_status !== 306280002).length
  const upcomingCount = bookings.filter(b => {
    if (b.cr55d_status === 306280002) return false
    const start = b.cr55d_startdate?.split('T')[0]
    return start && start >= new Date().toISOString().split('T')[0]
  }).length

  const typeLabel = Number(form.cr55d_type) === 306280000 ? 'Flight' : Number(form.cr55d_type) === 306280001 ? 'Hotel' : 'Rental Car'
  const startLabel = Number(form.cr55d_type) === 306280000 ? 'Departure' : Number(form.cr55d_type) === 306280001 ? 'Check-in' : 'Pickup'
  const endLabel = Number(form.cr55d_type) === 306280000 ? 'Return' : Number(form.cr55d_type) === 306280001 ? 'Check-out' : 'Return'

  return (
    <div>
      {toast && (
        <div style={{position:'fixed',top:'16px',right:'16px',zIndex:500,padding:'10px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:600,color:'#fff',background:toast.type==='error'?'var(--bp-red)':'var(--bp-green)',boxShadow:'var(--bp-shadow-lg)',animation:'slideUp .25s ease'}}>
          {toast.msg}
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-row-3 mb-12">
        <div className="kpi"><div className="kpi-label">Active Bookings</div><div className="kpi-val">{activeCount}</div><div className="kpi-sub">flights, hotels, rentals</div></div>
        <div className="kpi"><div className="kpi-label">Upcoming</div><div className="kpi-val color-blue">{upcomingCount}</div><div className="kpi-sub">future travel dates</div></div>
        <div className="kpi"><div className="kpi-label">Total Spend</div><div className="kpi-val">{fmtCurrency(totalSpend)}</div><div className="kpi-sub">across all bookings</div></div>
      </div>

      {/* Toolbar */}
      <div className="flex-between mb-12">
        <div className="flex gap-6">
          {[{ id: 'all', label: 'All' }, { id: '306280000', label: '\u2708 Flights' }, { id: '306280001', label: '\u{1F3E8} Hotels' }, { id: '306280002', label: '\u{1F697} Rentals' }, { id: 'cancelled', label: 'Cancelled' }].map(f => (
            <button key={f.id} className={`pill${filter === f.id ? ' active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Booking</button>
      </div>

      {/* Content */}
      {loadingBookings ? (
        <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading travel bookings...</div></div>
      ) : loadError ? (
        <div className="callout callout-amber mb-12">
          <span className="callout-icon">\u26A0</span>
          <div>
            <div className="font-semibold mb-4">Travel bookings table not available</div>
            <div className="text-md">The <code>cr55d_travelbookings</code> table needs to be created in Dataverse. Once created, bookings will load here automatically.</div>
            <button className="btn btn-ghost btn-xs mt-8" onClick={loadBookings}>Retry</button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">{filter === 'cancelled' ? '\u274C' : '\u2708'}</div><div className="empty-state-title">{filter === 'cancelled' ? 'No Cancelled Bookings' : 'No Travel Bookings'}</div><div className="empty-state-sub">{filter === 'cancelled' ? 'Cancelled bookings will appear here.' : 'Click "+ Add Booking" to create a flight, hotel, or rental car booking.'}</div></div></div>
      ) : (
        grouped.map(([jobName, items]) => (
          <div key={jobName} className="card card-flush mb-8">
            <div style={{padding:'10px 14px 6px',borderBottom:'1px solid var(--bp-border)'}}>
              <span className="font-semibold color-navy">{jobName}</span>
              <span className="badge badge-blue ml-8" style={{fontSize:'10.5px'}}>{items.length} booking{items.length !== 1 ? 's' : ''}</span>
              <span className="mono text-sm color-muted ml-8">{fmtCurrency(items.reduce((s, b) => s + (b.cr55d_cost || 0), 0))}</span>
            </div>
            <table className="tbl">
              <thead><tr><th style={{width:'32px'}}></th><th>Type</th><th>Crew Member</th><th>Provider</th><th>Confirmation</th><th>Dates</th><th className="r">Cost</th><th>Status</th><th style={{width:'40px'}}></th></tr></thead>
              <tbody>
                {items.map(b => (
                  <tr key={b.cr55d_travelbookingid} className="row-interactive" onClick={() => openEdit(b)} style={{cursor:'pointer'}}>
                    <td style={{textAlign:'center',fontSize:'15px'}}>{BOOKING_TYPE_ICONS[b.cr55d_type] || '\u2708'}</td>
                    <td className="font-semibold">{BOOKING_TYPES[b.cr55d_type] || 'Other'}</td>
                    <td>{b.cr55d_crewmember || '\u2014'}</td>
                    <td>{b.cr55d_provider || '\u2014'}</td>
                    <td className="mono text-md">{b.cr55d_confirmationnumber || '\u2014'}</td>
                    <td className="mono text-md">
                      {shortDate(isoDate(b.cr55d_startdate))}
                      {b.cr55d_enddate && <span className="color-muted"> \u2192 {shortDate(isoDate(b.cr55d_enddate))}</span>}
                    </td>
                    <td className="mono r">{b.cr55d_cost ? fmtCurrency(b.cr55d_cost) : '\u2014'}</td>
                    <td><span className={`badge ${BOOKING_STATUS_BADGE[b.cr55d_status] || 'badge-sand'}`}>{BOOKING_STATUSES[b.cr55d_status] || 'Unknown'}</span></td>
                    <td style={{textAlign:'center'}}><span className="color-muted text-md">\u270E</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="modal-overlay open" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'580px'}}>
            <div className="modal-header">
              <h3>{editId ? `Edit ${typeLabel} Booking` : `New Booking`}</h3>
              <button className="modal-close" onClick={closeModal}>\u00D7</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <div>
                <label className="form-label">Booking Type</label>
                <select className="form-input" value={form.cr55d_type} onChange={e => updateForm('cr55d_type', Number(e.target.value))}>
                  {Object.entries(BOOKING_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select className="form-input" value={form.cr55d_status} onChange={e => updateForm('cr55d_status', Number(e.target.value))}>
                  {Object.entries(BOOKING_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Job</label>
                <select className="form-input" value={form.cr55d_jobname} onChange={e => {
                  const j = activeJobs.find(j => j.cr55d_jobname === e.target.value)
                  updateForm('cr55d_jobname', e.target.value)
                  if (j) updateForm('cr55d_jobid', j.cr55d_jobid)
                }}>
                  <option value="">Select a job...</option>
                  {activeJobs.map(j => <option key={j.cr55d_jobid} value={j.cr55d_jobname}>{j.cr55d_jobname}{j.cr55d_clientname ? ` \u2014 ${j.cr55d_clientname}` : ''}</option>)}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Crew Member</label>
                {crewNames.length > 0 ? (
                  <select className="form-input" value={form.cr55d_crewmember} onChange={e => updateForm('cr55d_crewmember', e.target.value)}>
                    <option value="">Select crew member...</option>
                    {crewNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={form.cr55d_crewmember} onChange={e => updateForm('cr55d_crewmember', e.target.value)} placeholder="Crew member name" />
                )}
              </div>
              <div>
                <label className="form-label">Provider</label>
                <input className="form-input" value={form.cr55d_provider} onChange={e => updateForm('cr55d_provider', e.target.value)} placeholder={Number(form.cr55d_type) === 306280000 ? 'e.g., United Airlines' : Number(form.cr55d_type) === 306280001 ? 'e.g., Hampton Inn' : 'e.g., Enterprise'} />
              </div>
              <div>
                <label className="form-label">Confirmation #</label>
                <input className="form-input" value={form.cr55d_confirmationnumber} onChange={e => updateForm('cr55d_confirmationnumber', e.target.value)} placeholder="ABC123" />
              </div>
              <div>
                <label className="form-label">{startLabel} Date</label>
                <input className="form-input" type="date" value={form.cr55d_startdate} onChange={e => updateForm('cr55d_startdate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">{endLabel} Date</label>
                <input className="form-input" type="date" value={form.cr55d_enddate} onChange={e => updateForm('cr55d_enddate', e.target.value)} />
              </div>
              <div>
                <label className="form-label">Cost ($)</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.cr55d_cost} onChange={e => updateForm('cr55d_cost', e.target.value)} placeholder="0.00" />
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={2} value={form.cr55d_notes} onChange={e => updateForm('cr55d_notes', e.target.value)} placeholder="Flight details, room type, vehicle class, etc." style={{resize:'vertical'}} />
              </div>
            </div>

            {/* Delete confirmation */}
            {confirmDelete && (
              <div className="callout callout-red mt-12">
                <span className="callout-icon">{'\u26A0'}</span>
                <div style={{flex:1}}>
                  <div className="font-semibold mb-4">Cancel this booking?</div>
                  <div className="text-md mb-8">This will mark the booking as cancelled.</div>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button className="btn btn-sm" style={{background:'var(--bp-red)',color:'#fff',borderColor:'var(--bp-red)'}} disabled={saving} onClick={() => handleDelete(confirmDelete)}>{saving ? 'Cancelling...' : 'Confirm Cancel'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Keep Booking</button>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {editId && !confirmDelete && (
                <button className="btn btn-ghost btn-sm" style={{marginRight:'auto',color:'var(--bp-red)'}} onClick={() => setConfirmDelete(editId)}>Cancel Booking</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>Close</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !form.cr55d_jobname || !form.cr55d_crewmember} onClick={handleSave}>{saving ? 'Saving...' : editId ? 'Update Booking' : 'Save Booking'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
