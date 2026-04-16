import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { dvFetch, dvPost, dvPatch, dvDelete } from '../hooks/useDataverse'
import { ACTIVE_JOBS_FILTER, JOB_FIELDS_LIGHT } from '../constants/dataverseFields'
import { isoDate, shortDate } from '../utils/dateUtils'

/* ── Category picklist (mirrors bpt-ops-app / cr55d_inventories) ── */
const CATEGORY_MAP = {
  306280001: 'Structure - Anchor/Shelter',
  306280002: 'Structure - Atrium',
  306280003: 'Structure - Navi',
  306280004: 'Structure - Marquee & Economy',
  306280005: 'Structure - Century Frame',
  306280006: 'Structure - Pole Tent',
  306280007: 'Tent Accessories - Anchoring & Walls',
  306280008: 'Tent Accessories - Doors & Glass',
  306280009: 'Flooring',
  306280010: 'Flooring - Wood',
  306280011: 'Scaffolding & Timbers',
  306280012: 'Furniture & Fencing',
  408420000: 'HVAC, Power & Distribution',
  408420001: 'Lighting',
  408420002: 'Miscellaneous',
  408420003: 'Tools & Field Equipment',
  408420004: 'Uncounted Inventory',
}
const CATEGORY_NAMES = Object.values(CATEGORY_MAP).sort()

/* ── 5 Pre-built report tabs + Browse All ────────────────────────── */
const REPORTS = [
  { id: 'restrooms',   label: 'Restrooms',        icon: '🚻', color: '#1D3A6B' },
  { id: 'hardwood',    label: 'Hardwood Flooring', icon: '🪵', color: '#8B7355' },
  { id: 'tables',      label: 'Tables',            icon: '🍽️', color: '#7996AA' },
  { id: 'chairs',      label: 'Chairs',            icon: '🪑', color: '#2E7D52' },
  { id: 'dancefloors', label: 'Dance Floors',      icon: '💃', color: '#6A87A0' },
  { id: 'conflicts',   label: 'Conflicts',         icon: '⚠️', color: '#C0392B' },
  { id: 'browse',      label: 'Browse All',        icon: '🔍', color: '#1D3A6B' },
]

/* ── Hardwood types for sq ft tracking ─────────────────────────── */
const HARDWOOD_TYPES = ['Maple', 'Birch', 'White Oak', 'Barnwood', 'Vinyl']
const HARDWOOD_COLORS = { Maple: '#D4A574', Birch: '#C9B896', 'White Oak': '#8B7355', Barnwood: '#6B5B45', Vinyl: '#7996AA' }

/* ── Utilization heatmap thresholds ─────────────────────────────── */
function getUtilColor(pct) {
  if (pct >= 100) return { bg: 'var(--bp-red-bg)', color: 'var(--bp-red)', label: 'Over' }
  if (pct >= 90) return { bg: '#FEF2F2', color: '#DC2626', label: 'Critical' }
  if (pct >= 75) return { bg: 'var(--bp-amber-bg)', color: '#92400e', label: 'High' }
  if (pct >= 50) return { bg: '#FFFDE7', color: '#B45309', label: 'Medium' }
  return { bg: 'var(--bp-green-bg)', color: 'var(--bp-green)', label: 'Low' }
}

/* ── Restroom trailer fleet ─────────────────────────────────────── */
const RESTROOM_UNITS = [
  { unit: 'G51', size: '5-Stall', type: 'Guest', make: 'COH', year: 2016, status: 'available' },
  { unit: 'G81', size: '8-Stall', type: 'Guest', make: 'COH', year: 2016, status: 'available' },
  { unit: 'W41', size: '4-Stall', type: 'Worker', make: 'Rich Restroom', year: 2018, status: 'available' },
  { unit: 'W42', size: '4-Stall', type: 'Worker', make: 'JAG', year: 2023, status: 'available' },
  { unit: 'W51', size: '5-Stall', type: 'Worker', make: 'Rich Restroom', year: 2017, status: 'available' },
  { unit: 'W52', size: '5-Stall', type: 'Worker', make: 'Rich Restroom', year: 2018, status: 'available' },
  { unit: 'W81', size: '8-Stall', type: 'Worker', make: 'Rich Restroom', year: 2017, status: 'available' },
  { unit: 'W82', size: '8-Stall', type: 'Worker', make: 'Black Tie', year: 2021, status: 'available' },
  { unit: 'W91', size: '9-Stall', type: 'Worker', make: 'Black Tie', year: 2023, status: 'available' },
  { unit: 'W101', size: '10-Stall', type: 'Worker', make: 'Rich Restroom', year: 2020, status: 'available' },
  { unit: 'W102', size: '10-Stall', type: 'Worker', make: '', year: 0, status: 'on order', note: 'Ordered — pending delivery' },
]

const INV_SELECT = 'cr55d_inventoryid,cr55d_inventoryname,cr55d_category,cr55d_sourcetab,cr55d_rentableqty,cr55d_brokenqty,cr55d_totalquantity,cr55d_lastcountdate,cr55d_countedby,cr55d_warehouselocation,cr55d_storageposition,cr55d_notes,statecode'

/* ── Helpers ──────────────────────────────────────────────────────── */
function matchesKeywords(name, keywords) {
  if (!name) return false
  const n = name.toLowerCase()
  return keywords.some(k => n.includes(k))
}

function dateRange(start, end) {
  const days = []
  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  while (d <= e) {
    days.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return days
}

function toISO(d) { return d.toISOString().split('T')[0] }

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export default function Inventory() {
  const [activeReport, setActiveReport] = useState('restrooms')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Browse All state
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [sortField, setSortField] = useState('cr55d_inventoryname')
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [dismissing, setDismissing] = useState(false)

  // Date range filter (by usage/availability window)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [jobs, setJobs] = useState([])
  const [reservations, setReservations] = useState([])

  useEffect(() => { loadInventory(); loadJobs(); loadReservations() }, [])

  async function loadInventory() {
    setLoading(true)
    setError(null)
    try {
      const data = await dvFetch(`cr55d_inventories?$select=${INV_SELECT}&$top=5000&$orderby=cr55d_inventoryname asc`)
      setItems((data || []).map(r => ({
        ...r,
        cr55d_category_label: CATEGORY_MAP[r.cr55d_category] || `Unknown (${r.cr55d_category})`,
        cr55d_isactive: r.statecode === 0,
      })))
    } catch (e) {
      console.error('[Inventory] Load:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadJobs() {
    try {
      const data = await dvFetch(`cr55d_jobs?$select=${JOB_FIELDS_LIGHT}&$filter=${ACTIVE_JOBS_FILTER}&$orderby=cr55d_installdate asc&$top=300`)
      setJobs(data || [])
    } catch (e) { console.warn('[Inventory] Jobs load failed:', e.message) }
  }

  async function loadReservations() {
    try {
      const data = await dvFetch('cr55d_jobinventoryreservations?$select=cr55d_jobinventoryreservationid,cr55d_inventoryid,cr55d_jobid,cr55d_quantity,cr55d_startdate,cr55d_enddate&$top=2000')
      setReservations(Array.isArray(data) ? data : [])
    } catch (e) { console.warn('[Inventory] Reservations not available:', e.message) }
  }

  // Jobs overlapping the selected date window
  const overlappingJobs = useMemo(() => {
    if (!dateFrom && !dateTo) return []
    const from = dateFrom || '2000-01-01'
    const to = dateTo || '2099-12-31'
    return jobs.filter(j => {
      const install = isoDate(j.cr55d_installdate)
      const strike = isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate) || install
      if (!install) return false
      return install <= to && strike >= from
    })
  }, [jobs, dateFrom, dateTo])

  // Reservations overlapping the selected date window, indexed by inventory ID
  const reservedByItem = useMemo(() => {
    if (!dateFrom && !dateTo) return {}
    const from = dateFrom || '2000-01-01'
    const to = dateTo || '2099-12-31'
    const map = {}
    const overlappingJobIds = new Set(overlappingJobs.map(j => j.cr55d_jobid))
    reservations.forEach(r => {
      const rStart = r.cr55d_startdate?.split('T')[0]
      const rEnd = r.cr55d_enddate?.split('T')[0]
      const byDate = rStart && rEnd && rStart <= to && rEnd >= from
      const byJob = r.cr55d_jobid && overlappingJobIds.has(r.cr55d_jobid)
      if (byDate || byJob) {
        const key = r.cr55d_inventoryid
        if (!map[key]) map[key] = 0
        map[key] += r.cr55d_quantity || 0
      }
    })
    return map
  }, [reservations, overlappingJobs, dateFrom, dateTo])

  const hasDateRange = !!(dateFrom || dateTo)

  const activeItems = useMemo(() => {
    return items.filter(i => i.cr55d_isactive)
  }, [items])

  // Pre-filtered sets for the 4 inventory reports
  const hardwoodItems = useMemo(() => activeItems.filter(i => i.cr55d_category === 306280010), [activeItems])
  const tableItems = useMemo(() => activeItems.filter(i =>
    i.cr55d_category === 306280012 && matchesKeywords(i.cr55d_inventoryname, ['table'])
  ), [activeItems])
  const chairItems = useMemo(() => activeItems.filter(i =>
    i.cr55d_category === 306280012 && matchesKeywords(i.cr55d_inventoryname, ['chair', 'seat', 'stool', 'bench'])
  ), [activeItems])
  const danceFloorItems = useMemo(() => activeItems.filter(i =>
    (i.cr55d_category === 306280009 || i.cr55d_category === 306280010) &&
    matchesKeywords(i.cr55d_inventoryname, ['dance', 'floor panel', 'dance floor'])
  ), [activeItems])

  // Browse All filtered list
  const browseFiltered = useMemo(() => {
    let list = [...activeItems]
    if (catFilter) {
      list = list.filter(i => i.cr55d_category_label === catFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        (i.cr55d_inventoryname || '').toLowerCase().includes(q) ||
        (i.cr55d_category_label || '').toLowerCase().includes(q) ||
        (i.cr55d_warehouselocation || '').toLowerCase().includes(q) ||
        (i.cr55d_storageposition || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let va = a[sortField] ?? '', vb = b[sortField] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return list
  }, [activeItems, search, catFilter, sortField, sortAsc])

  // Save notes inline
  const saveNotes = useCallback(async (inventoryId, notes) => {
    try {
      await dvPatch(`cr55d_inventories(${inventoryId})`, { cr55d_notes: notes })
      setItems(prev => prev.map(i => i.cr55d_inventoryid === inventoryId ? { ...i, cr55d_notes: notes } : i))
    } catch (e) {
      console.error('[Inventory] Save notes failed:', e)
      alert('Failed to save notes: ' + e.message)
    }
  }, [])

  function toggleItem(id) {
    setSelectedItems(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAllItems() {
    setSelectedItems(prev => prev.size === browseFiltered.length ? new Set() : new Set(browseFiltered.map(i => i.cr55d_inventoryid)))
  }
  async function dismissSelectedItems() {
    if (!selectedItems.size) return
    if (!confirm(`Deactivate ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}? They will be hidden from the master list.`)) return
    setDismissing(true)
    let done = 0
    for (const id of selectedItems) {
      try {
        await dvPatch(`cr55d_inventories(${id})`, { statecode: 1 })
        done++
      } catch (e) { console.error('Dismiss failed:', id, e.message) }
    }
    setItems(prev => prev.map(i => selectedItems.has(i.cr55d_inventoryid) ? { ...i, statecode: 1 } : i))
    setSelectedItems(new Set())
    setDismissing(false)
  }

  function handleSort(field) {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }
  const sortArrow = (f) => sortField === f ? (sortAsc ? ' ↑' : ' ↓') : ''

  // KPIs scoped to active tab
  const scopedItems = activeReport === 'restrooms' ? [] :
    activeReport === 'hardwood' ? hardwoodItems :
    activeReport === 'tables' ? tableItems :
    activeReport === 'chairs' ? chairItems :
    activeReport === 'dancefloors' ? danceFloorItems :
    browseFiltered
  const kpiTotal = activeReport === 'restrooms' ? RESTROOM_UNITS.length : scopedItems.length
  const kpiRentable = scopedItems.reduce((s, i) => s + (i.cr55d_rentableqty || 0), 0)
  const kpiTotalQty = scopedItems.reduce((s, i) => s + (i.cr55d_totalquantity || 0), 0)
  const kpiBroken = scopedItems.reduce((s, i) => s + (i.cr55d_brokenqty || 0), 0)
  const kpiReserved = hasDateRange ? scopedItems.reduce((s, i) => s + (reservedByItem[i.cr55d_inventoryid] || 0), 0) : 0
  const kpiAvailable = hasDateRange ? kpiRentable - kpiReserved : kpiRentable

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Inventory</h1><div className="sub">Product availability &amp; tracking</div><div className="page-head-accent"></div></div>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={() => { loadInventory(); loadJobs(); loadReservations() }} disabled={loading} title="Refresh from Dataverse">↻ Refresh</button>
        </div>
      </div>

      {/* Date Range Filter — Availability Window */}
      <div className="flex gap-8 mb-12" style={{alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-light)'}}>Availability Window</span>
        <input type="date" className="form-input" style={{width:'150px',padding:'5px 10px',fontSize:'12px'}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>to</span>
        <input type="date" className="form-input" style={{width:'150px',padding:'5px 10px',fontSize:'12px'}} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {hasDateRange && <button className="btn btn-ghost btn-xs" onClick={() => { setDateFrom(''); setDateTo('') }}>Clear</button>}
        {hasDateRange && <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>{overlappingJobs.length} job{overlappingJobs.length !== 1 ? 's' : ''} in window</span>}
      </div>

      {/* Report Toggle Pills */}
      <div className="flex gap-6 mb-16" style={{flexWrap:'wrap'}}>
        {REPORTS.map(r => (
          <button key={r.id} className={`pill${activeReport === r.id ? ' active' : ''}`}
            style={{borderColor: activeReport === r.id ? r.color : undefined, background: activeReport === r.id ? r.color : undefined, whiteSpace:'nowrap'}}
            onClick={() => { setActiveReport(r.id); setSearch(''); setCatFilter('') }}>
            <span className="text-lg">{r.icon}</span> {r.label}
          </button>
        ))}
      </div>

      {/* KPI Row */}
      {activeReport !== 'hardwood' && (
        <div className="kpi-row-4 mb-12">
          <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Total Units' : 'Items'}</div><div className="kpi-val">{kpiTotal}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'restroom trailers' : 'in this view'}</div></div>
          <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Available Now' : hasDateRange ? 'Available' : 'Total Quantity'}</div><div className="kpi-val color-green">{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'available').length : hasDateRange ? kpiAvailable.toLocaleString() : kpiTotalQty.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'ready to book' : hasDateRange ? 'rentable minus reserved' : 'across all items'}</div></div>
          <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Currently Booked' : hasDateRange ? 'Reserved' : 'Rentable'}</div><div className="kpi-val" style={{color: 'var(--bp-amber)'}}>{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'booked').length : hasDateRange ? kpiReserved.toLocaleString() : kpiRentable.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'on jobs' : hasDateRange ? `across ${overlappingJobs.length} job${overlappingJobs.length !== 1 ? 's' : ''}` : 'available for jobs'}</div></div>
          <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Maintenance' : 'Broken / Out'}</div><div className="kpi-val color-red">{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'maintenance').length : kpiBroken.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'out of service' : 'needs repair'}</div></div>
        </div>
      )}

      {error && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">⚠️</span>
          <div>
            <strong>Failed to load inventory.</strong> {error}
            <button className="btn btn-ghost btn-xs ml-8" onClick={() => { setError(null); loadInventory() }}>Retry</button>
          </div>
        </div>
      )}

      {/* ── Pre-built Reports ───────────────────────────────────── */}
      {activeReport === 'restrooms' && <RestroomCalendar units={RESTROOM_UNITS} jobs={jobs} />}
      {activeReport === 'hardwood' && <HardwoodTracker items={hardwoodItems} jobs={jobs} reservations={reservations} />}
      {activeReport === 'tables' && <InventoryTable items={tableItems} loading={loading} emptyIcon="🍽️" emptyTitle="Tables" onSaveNotes={saveNotes} hasDateRange={hasDateRange} reservedByItem={reservedByItem} />}
      {activeReport === 'chairs' && <InventoryTable items={chairItems} loading={loading} emptyIcon="🪑" emptyTitle="Chairs" onSaveNotes={saveNotes} hasDateRange={hasDateRange} reservedByItem={reservedByItem} />}
      {activeReport === 'dancefloors' && <InventoryTable items={danceFloorItems} loading={loading} emptyIcon="💃" emptyTitle="Dance Floors" onSaveNotes={saveNotes} hasDateRange={hasDateRange} reservedByItem={reservedByItem} />}

      {/* ── Conflicts / Heatmap ─────────────────────────────────── */}
      {activeReport === 'conflicts' && (
        <ConflictHeatmap items={items} jobs={jobs} reservedByItem={reservedByItem} hasDateRange={hasDateRange} overlappingJobs={overlappingJobs} />
      )}

      {/* ── Browse All ──────────────────────────────────────────── */}
      {activeReport === 'browse' && (
        <div>
          <div className="flex gap-8 mb-12" style={{flexWrap:'wrap'}}>
            <input type="text" className="form-input" style={{width:'260px',padding:'6px 12px',fontSize:'12px'}} placeholder="Search items, locations, categories..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{width:'220px',padding:'6px 10px',fontSize:'12px'}} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">All Categories ({activeItems.length})</option>
              {CATEGORY_NAMES.map(c => {
                const count = activeItems.filter(i => i.cr55d_category_label === c).length
                return <option key={c} value={c}>{c} ({count})</option>
              })}
            </select>
          </div>

          {loading ? (
            <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading inventory from Dataverse...</div></div>
          ) : browseFiltered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">No items found</div>
                <div className="empty-state-sub">{search || catFilter ? 'Try adjusting your search or category filter' : 'No active inventory items'}</div>
              </div>
            </div>
          ) : (
            <div className="card card-flush">
              <div className="text-sm color-muted" style={{padding:'8px 14px',borderBottom:'1px solid var(--bp-border-lt)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>{browseFiltered.length} item{browseFiltered.length !== 1 ? 's' : ''}</span>
                {selectedItems.size > 0 && <button className="btn btn-sm" onClick={dismissSelectedItems} disabled={dismissing} style={{background:'var(--bp-navy)',color:'#fff',fontSize:'10px',padding:'4px 12px',border:'none',borderRadius:'6px'}}>{dismissing ? 'Dismissing...' : `Dismiss ${selectedItems.size} Selected`}</button>}
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{width:'30px'}}><input type="checkbox" onChange={toggleAllItems} checked={selectedItems.size === browseFiltered.length && browseFiltered.length > 0} /></th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_inventoryname')}>Item Name{sortArrow('cr55d_inventoryname')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_category')}>Category{sortArrow('cr55d_category')}</th>
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_totalquantity')}>Total{sortArrow('cr55d_totalquantity')}</th>
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_rentableqty')}>Rentable{sortArrow('cr55d_rentableqty')}</th>
                    {hasDateRange && <th className="r">Reserved</th>}
                    {hasDateRange && <th className="r">Available</th>}
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_brokenqty')}>Broken{sortArrow('cr55d_brokenqty')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_warehouselocation')}>Location{sortArrow('cr55d_warehouselocation')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_storageposition')}>Position{sortArrow('cr55d_storageposition')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_lastcountdate')}>Last Count{sortArrow('cr55d_lastcountdate')}</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {browseFiltered.map(item => <InvRow key={item.cr55d_inventoryid} item={item} onSaveNotes={saveNotes} hasDateRange={hasDateRange} reservedByItem={reservedByItem} selected={selectedItems.has(item.cr55d_inventoryid)} onToggle={() => toggleItem(item.cr55d_inventoryid)} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED INVENTORY ROW
   ═══════════════════════════════════════════════════════════════════ */
function InvRow({ item, showCategory = true, onSaveNotes, hasDateRange = false, reservedByItem = {}, selected = false, onToggle }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.cr55d_notes || '')
  const [saving, setSaving] = useState(false)

  const hasConflict = item.cr55d_totalquantity != null && item.cr55d_rentableqty != null && item.cr55d_brokenqty != null &&
    (item.cr55d_rentableqty + item.cr55d_brokenqty) !== item.cr55d_totalquantity

  function handleSave() {
    if (draft === (item.cr55d_notes || '')) { setEditing(false); return }
    setSaving(true)
    onSaveNotes(item.cr55d_inventoryid, draft).then(() => {
      setEditing(false)
    }).finally(() => setSaving(false))
  }

  return (
    <tr style={hasConflict ? {background:'rgba(239,68,68,.04)'} : selected ? {background:'rgba(37,99,235,.04)'} : undefined}>
      {onToggle && <td><input type="checkbox" checked={selected} onChange={onToggle} /></td>}
      <td className="font-semibold color-navy" style={{fontSize:'12px'}}>
        {item.cr55d_inventoryname || '—'}
        {hasConflict && <span className="badge badge-red ml-4" style={{fontSize:'9px',padding:'1px 5px'}}>QTY CONFLICT</span>}
      </td>
      {showCategory && <td style={{fontSize:'11.5px'}}>{item.cr55d_category_label}</td>}
      <td className="r mono">{item.cr55d_totalquantity ?? '—'}</td>
      <td className="r mono font-bold color-green">{item.cr55d_rentableqty ?? '—'}</td>
      {hasDateRange && (() => {
        const reserved = reservedByItem[item.cr55d_inventoryid] || 0
        const available = (item.cr55d_rentableqty || 0) - reserved
        return <>
          <td className="r mono" style={{color: reserved > 0 ? 'var(--bp-amber)' : 'var(--bp-light)'}}>{reserved}</td>
          <td className="r mono font-bold" style={{color: available <= 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{available}</td>
        </>
      })()}
      <td className="r mono" style={{color: item.cr55d_brokenqty > 0 ? 'var(--bp-red)' : ''}}>{item.cr55d_brokenqty ?? '—'}</td>
      <td className="text-md color-muted">{item.cr55d_warehouselocation || '—'}</td>
      <td className="text-md color-muted">{item.cr55d_storageposition || '—'}</td>
      <td className="text-md mono color-muted">{item.cr55d_lastcountdate ? item.cr55d_lastcountdate.split('T')[0] : '—'}</td>
      <td style={{minWidth:'140px'}}>
        {editing ? (
          <div className="flex gap-4" style={{alignItems:'center'}}>
            <input type="text" className="form-input" style={{flex:1,padding:'3px 6px',fontSize:'11px',minWidth:0}} value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setDraft(item.cr55d_notes || ''); setEditing(false) } }}
              autoFocus disabled={saving} />
            <button className="btn btn-ghost btn-xs" onClick={handleSave} disabled={saving} style={{padding:'2px 6px',fontSize:'10px'}}>{saving ? '...' : '✓'}</button>
            <button className="btn btn-ghost btn-xs" onClick={() => { setDraft(item.cr55d_notes || ''); setEditing(false) }} style={{padding:'2px 6px',fontSize:'10px'}}>✕</button>
          </div>
        ) : (
          <div className="text-md color-muted" style={{cursor:'pointer',minHeight:'18px'}} onClick={() => { setDraft(item.cr55d_notes || ''); setEditing(true) }} title="Click to edit">
            {item.cr55d_notes || <span style={{color:'var(--bp-light)',fontStyle:'italic',fontSize:'10px'}}>+ add note</span>}
          </div>
        )}
      </td>
    </tr>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   INVENTORY TABLE (shared by Tables, Chairs, Dance Floors)
   ═══════════════════════════════════════════════════════════════════ */
function InventoryTable({ items, loading, emptyIcon, emptyTitle, onSaveNotes, hasDateRange = false, reservedByItem = {} }) {
  if (loading) {
    return <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading...</div></div>
  }
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">{emptyIcon}</div>
          <div className="empty-state-title">{emptyTitle}</div>
          <div className="empty-state-sub">No matching items found in inventory. Items populate from Dataverse as they are counted and categorized.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="card card-flush">
      <div className="text-sm color-muted" style={{padding:'8px 14px',borderBottom:'1px solid var(--bp-border-lt)'}}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Item Name</th>
            <th className="r">Total</th>
            <th className="r">Rentable</th>
            {hasDateRange && <th className="r">Reserved</th>}
            {hasDateRange && <th className="r">Available</th>}
            <th className="r">Broken</th>
            <th>Location</th>
            <th>Position</th>
            <th>Last Count</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => <InvRow key={item.cr55d_inventoryid} item={item} showCategory={false} onSaveNotes={onSaveNotes} hasDateRange={hasDateRange} reservedByItem={reservedByItem} />)}
        </tbody>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   RESTROOM CALENDAR — Calendar-based assignment view (Spec 10.1)
   Units on left, dates across top, assign units to jobs on date ranges.
   ═══════════════════════════════════════════════════════════════════ */
function RestroomCalendar({ units, jobs }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1)
    return toISO(d)
  })
  // Assignments: { [unitId]: [{ jobId, jobName, start, end, color }] }
  const [assignments, setAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bpt_restroom_assign') || '{}') } catch { return {} }
  })
  const [assigning, setAssigning] = useState(null) // { unit, day }
  const [searchJob, setSearchJob] = useState('')

  useEffect(() => {
    try { localStorage.setItem('bpt_restroom_assign', JSON.stringify(assignments)) } catch {}
  }, [assignments])

  const COLORS = ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#4F46E5','#BE185D','#1D4ED8','#15803D']

  const days = useMemo(() => {
    return Array.from({length: 21}, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const weekLabel = `${shortDate(days[0])} — ${shortDate(days[20])}`

  function getAssignmentsForUnit(unitId) {
    return assignments[unitId] || []
  }

  function getAssignmentForCell(unitId, day) {
    return (assignments[unitId] || []).find(a => a.start <= day && a.end >= day)
  }

  function assignJob(unitId, day, job) {
    const install = isoDate(job.cr55d_installdate) || day
    const strike = isoDate(job.cr55d_strikedate) || isoDate(job.cr55d_eventdate) || install
    const color = COLORS[Math.abs(hashStr(job.cr55d_jobid)) % COLORS.length]
    setAssignments(prev => {
      const unitAssign = [...(prev[unitId] || [])]
      // Remove overlapping assignments
      const filtered = unitAssign.filter(a => a.end < install || a.start > strike)
      filtered.push({ jobId: job.cr55d_jobid, jobName: job.cr55d_clientname || job.cr55d_jobname, start: install, end: strike, color })
      return { ...prev, [unitId]: filtered }
    })
    setAssigning(null)
    setSearchJob('')
  }

  function removeAssignment(unitId, jobId, start) {
    setAssignments(prev => {
      const filtered = (prev[unitId] || []).filter(a => !(a.jobId === jobId && a.start === start))
      return { ...prev, [unitId]: filtered }
    })
  }

  const filteredJobs = useMemo(() => {
    if (!searchJob || searchJob.length < 2) return []
    const q = searchJob.toLowerCase()
    return jobs.filter(j =>
      (j.cr55d_clientname || '').toLowerCase().includes(q) ||
      (j.cr55d_jobname || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [jobs, searchJob])

  // Compute availability KPIs
  const today = toISO(new Date())
  const bookedToday = units.filter(u => u.status !== 'on order' && u.status !== 'maintenance')
    .filter(u => getAssignmentForCell(u.unit, today)).length
  const availableToday = units.filter(u => u.status !== 'on order' && u.status !== 'maintenance').length - bookedToday

  // Jobs needing restrooms: upcoming jobs not yet assigned to any unit
  const assignedJobIds = useMemo(() => {
    const ids = new Set()
    for (const unitAssigns of Object.values(assignments)) {
      for (const a of unitAssigns) ids.add(a.jobId)
    }
    return ids
  }, [assignments])

  const [selectedUnassigned, setSelectedUnassigned] = useState(null)

  const unassignedJobs = useMemo(() => {
    return jobs.filter(j => {
      if (assignedJobIds.has(j.cr55d_jobid)) return false
      const install = isoDate(j.cr55d_installdate)
      return install && install >= today
    }).sort((a, b) => (isoDate(a.cr55d_installdate) || '').localeCompare(isoDate(b.cr55d_installdate) || ''))
  }, [jobs, assignedJobIds, today])

  return (
    <div>
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Total Units</div><div className="kpi-val">{units.length}</div><div className="kpi-sub">restroom trailers</div></div>
        <div className="kpi"><div className="kpi-label">Available Today</div><div className="kpi-val color-green">{availableToday}</div><div className="kpi-sub">ready to book</div></div>
        <div className="kpi"><div className="kpi-label">Booked Today</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{bookedToday}</div><div className="kpi-sub">on jobs</div></div>
        <div className="kpi"><div className="kpi-label">Need Assignment</div><div className="kpi-val" style={{color: unassignedJobs.length > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{unassignedJobs.length}</div><div className="kpi-sub">upcoming jobs, no unit</div></div>
      </div>

      {/* Jobs Needing Restrooms */}
      {unassignedJobs.length > 0 && (
        <div className="card mb-12" style={{borderLeft:'4px solid var(--bp-amber)'}}>
          <div className="flex-between mb-6">
            <div>
              <div className="font-bold color-navy text-md">Jobs Needing Restroom Assignment</div>
              <div className="text-sm color-muted">Select a job, then click an empty cell on the calendar to assign a unit</div>
            </div>
            <span className="badge badge-amber">{unassignedJobs.length} job{unassignedJobs.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'6px'}}>
            {unassignedJobs.slice(0, 12).map(j => {
              const install = isoDate(j.cr55d_installdate)
              const strike = isoDate(j.cr55d_strikedate) || isoDate(j.cr55d_eventdate) || install
              const isSelected = selectedUnassigned?.cr55d_jobid === j.cr55d_jobid
              return (
                <div key={j.cr55d_jobid}
                  style={{
                    padding:'8px 12px',borderRadius:'6px',cursor:'pointer',transition:'all .12s',
                    background: isSelected ? 'var(--bp-blue-bg)' : 'var(--bp-alt)',
                    border: isSelected ? '2px solid var(--bp-blue)' : '2px solid transparent',
                  }}
                  onClick={() => setSelectedUnassigned(isSelected ? null : j)}>
                  <div className="font-semibold color-navy" style={{fontSize:'12px'}}>{j.cr55d_clientname || j.cr55d_jobname}</div>
                  <div style={{fontSize:'10px',color:'var(--bp-muted)',display:'flex',gap:'8px',marginTop:'2px'}}>
                    <span>{shortDate(install)} — {shortDate(strike)}</span>
                    {j.cr55d_venuename && <span>· {j.cr55d_venuename}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          {unassignedJobs.length > 12 && <div className="text-sm color-muted mt-4">+{unassignedJobs.length - 12} more</div>}
        </div>
      )}

      <div className="callout callout-blue mb-12">
        <span className="callout-icon">ℹ️</span>
        <div>
          {selectedUnassigned
            ? <><strong>Assigning: {selectedUnassigned.cr55d_clientname || selectedUnassigned.cr55d_jobname}</strong> — click an empty cell below to place a unit on this job. <button className="btn btn-ghost btn-xs" onClick={() => setSelectedUnassigned(null)}>Cancel</button></>
            : 'Select a job above, then click an empty cell to assign a restroom unit. Or click any empty cell to search for a job.'}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-between mb-8">
        <div className="flex gap-6">
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <button className="btn btn-ghost btn-xs" onClick={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); setWeekStart(toISO(d)) }}>Today</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>
        <span className="text-sm font-semibold color-navy">{weekLabel}</span>
      </div>

      {/* Calendar Grid */}
      <div className="card card-flush" style={{overflowX:'auto'}}>
        <table className="tbl" style={{minWidth:'900px'}}>
          <thead>
            <tr>
              <th style={{width:'110px',position:'sticky',left:0,background:'var(--bp-white)',zIndex:2}}>Unit</th>
              {days.map(d => {
                const dt = new Date(d + 'T00:00:00')
                const isToday = d === today
                const isWeekend = dt.getDay() === 0 || dt.getDay() === 6
                return (
                  <th key={d} style={{textAlign:'center',minWidth:'52px',fontSize:'9px',padding:'6px 2px',
                    background: isToday ? 'var(--bp-blue-bg)' : isWeekend ? 'rgba(121,150,170,.04)' : 'var(--bp-white)'}}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]}<br/>{dt.getDate()}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {units.map(u => (
              <tr key={u.unit}>
                <td style={{position:'sticky',left:0,background:'var(--bp-white)',zIndex:1,borderRight:'2px solid var(--bp-border)'}}>
                  <div className="font-bold color-navy" style={{fontSize:'12px'}}>{u.unit}</div>
                  <div style={{fontSize:'9px',color:'var(--bp-muted)'}}>{u.size} · {u.type}</div>
                </td>
                {days.map(d => {
                  const a = getAssignmentForCell(u.unit, d)
                  const isStart = a && a.start === d
                  const isEnd = a && a.end === d
                  const isToday = d === today
                  const isOOS = u.status === 'maintenance' || u.status === 'on order'

                  if (isOOS) {
                    return <td key={d} style={{background:'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,.04) 3px,rgba(0,0,0,.04) 6px)',textAlign:'center',fontSize:'8px',color:'var(--bp-light)'}}>—</td>
                  }
                  if (a) {
                    return (
                      <td key={d} style={{padding:0,position:'relative'}}>
                        <div style={{
                          background: a.color + '18', borderTop: `2px solid ${a.color}`,
                          height:'100%',minHeight:'32px',display:'flex',alignItems:'center',justifyContent:'center',
                          borderLeft: isStart ? `3px solid ${a.color}` : 'none',
                          borderRight: isEnd ? `3px solid ${a.color}` : 'none',
                          borderRadius: isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : '0',
                          cursor:'pointer',position:'relative'
                        }} title={`${a.jobName}\n${a.start} → ${a.end}\nClick to remove`}
                          onClick={() => removeAssignment(u.unit, a.jobId, a.start)}>
                          {isStart && <span style={{fontSize:'9px',fontWeight:600,color:a.color,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',padding:'0 2px',maxWidth:'100%'}}>{a.jobName}</span>}
                        </div>
                      </td>
                    )
                  }
                  return (
                    <td key={d} style={{textAlign:'center',cursor:'pointer',
                      background: selectedUnassigned && isToday ? 'rgba(37,99,235,.08)' : selectedUnassigned ? 'rgba(37,99,235,.03)' : isToday ? 'rgba(37,99,235,.03)' : undefined,
                      transition:'background .1s'}}
                      onClick={() => {
                        if (selectedUnassigned) { assignJob(u.unit, d, selectedUnassigned); setSelectedUnassigned(null); return }
                        setAssigning(assigning?.unit === u.unit && assigning?.day === d ? null : { unit: u.unit, day: d })
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedUnassigned ? 'rgba(37,99,235,.03)' : isToday ? 'rgba(37,99,235,.03)' : ''}>
                      {assigning?.unit === u.unit && assigning?.day === d ? (
                        <div style={{position:'relative'}}>
                          <div style={{position:'absolute',top:'-4px',left:'50%',transform:'translateX(-50%)',zIndex:20,background:'var(--bp-white)',border:'1px solid var(--bp-border)',borderRadius:'8px',padding:'8px',boxShadow:'var(--bp-shadow-md)',minWidth:'200px',textAlign:'left'}}
                            onClick={e => e.stopPropagation()}>
                            <input type="text" className="form-input" style={{width:'100%',padding:'4px 8px',fontSize:'11px',marginBottom:'4px'}}
                              placeholder="Search jobs..." value={searchJob} onChange={e => setSearchJob(e.target.value)} autoFocus />
                            {filteredJobs.map(j => (
                              <div key={j.cr55d_jobid} style={{padding:'4px 6px',fontSize:'11px',cursor:'pointer',borderRadius:'4px'}}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bp-alt)'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                onClick={() => assignJob(u.unit, d, j)}>
                                <div className="font-semibold color-navy">{j.cr55d_clientname || j.cr55d_jobname}</div>
                                <div style={{fontSize:'9px',color:'var(--bp-muted)'}}>
                                  {isoDate(j.cr55d_installdate) ? shortDate(isoDate(j.cr55d_installdate)) : '?'} — {isoDate(j.cr55d_strikedate) ? shortDate(isoDate(j.cr55d_strikedate)) : '?'}
                                </div>
                              </div>
                            ))}
                            {searchJob.length >= 2 && filteredJobs.length === 0 && <div style={{fontSize:'10px',color:'var(--bp-muted)',padding:'4px'}}>No matching jobs</div>}
                            <button className="btn btn-ghost btn-xs mt-4" style={{fontSize:'9px'}} onClick={() => { setAssigning(null); setSearchJob('') }}>Cancel</button>
                          </div>
                          <span style={{fontSize:'18px',opacity:.3}}>+</span>
                        </div>
                      ) : (
                        <span style={{fontSize:'14px',opacity:.15}}>+</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function hashStr(s) { let h = 0; for (let i = 0; i < (s || '').length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0 } return h }

/* ═══════════════════════════════════════════════════════════════════
   HARDWOOD TRACKER — Sq ft tracking by type (Spec 10.2)
   Calendar view with overlap detection + unassigned pool.
   ═══════════════════════════════════════════════════════════════════ */
function HardwoodTracker({ items, jobs, reservations }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1)
    return toISO(d)
  })

  const days = useMemo(() => Array.from({length: 14}, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekLabel = `${shortDate(days[0])} — ${shortDate(days[13])}`

  // Total sq ft available per hardwood type (from inventory items)
  const sqftByType = useMemo(() => {
    const map = {}
    for (const type of HARDWOOD_TYPES) map[type] = 0
    for (const item of items) {
      const name = (item.cr55d_inventoryname || '').toLowerCase()
      for (const type of HARDWOOD_TYPES) {
        if (name.includes(type.toLowerCase())) {
          map[type] += item.cr55d_rentableqty || 0
          break
        }
      }
    }
    return map
  }, [items])

  const totalSqFt = Object.values(sqftByType).reduce((s, v) => s + v, 0)

  // Hardwood assignments state (must be declared before commitmentsByDay)
  const [hwAssignments, setHwAssignments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bpt_hardwood_assign') || '{}') } catch { return {} }
  })
  const [assigningJob, setAssigningJob] = useState(null)
  const [assignForm, setAssignForm] = useState({ type: '', sqft: '' })

  // Build committed sq ft per type per day from hardwood assignments state
  const commitmentsByDay = useMemo(() => {
    const map = {}
    for (const d of days) map[d] = {}

    for (const [, entry] of Object.entries(hwAssignments)) {
      if (!entry.type || !entry.sqft || !entry.start || !entry.end) continue
      for (const d of days) {
        if (d >= entry.start && d <= entry.end) {
          if (!map[d][entry.type]) map[d][entry.type] = 0
          map[d][entry.type] += entry.sqft
        }
      }
    }
    return map
  }, [days, hwAssignments])

  useEffect(() => {
    try { localStorage.setItem('bpt_hardwood_assign', JSON.stringify(hwAssignments)) } catch {}
  }, [hwAssignments])

  // Jobs that might need hardwood (have install dates, not yet assigned)
  const unassignedJobs = useMemo(() => {
    const assignedIds = new Set(Object.keys(hwAssignments))
    return jobs.filter(j => {
      if (assignedIds.has(j.cr55d_jobid)) return false
      const install = isoDate(j.cr55d_installdate)
      return install && install >= days[0]
    }).slice(0, 20)
  }, [jobs, hwAssignments, days])

  function saveAssignment(jobId, job) {
    if (!assignForm.type || !assignForm.sqft) return
    const install = isoDate(job.cr55d_installdate) || days[0]
    const strike = isoDate(job.cr55d_strikedate) || isoDate(job.cr55d_eventdate) || install
    setHwAssignments(prev => ({
      ...prev,
      [jobId]: {
        type: assignForm.type, sqft: Number(assignForm.sqft),
        start: install, end: strike,
        jobName: job.cr55d_clientname || job.cr55d_jobname
      }
    }))
    setAssigningJob(null)
    setAssignForm({ type: '', sqft: '' })
  }

  function removeAssignment(jobId) {
    setHwAssignments(prev => { const n = { ...prev }; delete n[jobId]; return n })
  }

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Total Inventory</div><div className="kpi-val">{totalSqFt.toLocaleString()}</div><div className="kpi-sub">sq ft across all types</div></div>
        <div className="kpi"><div className="kpi-label">Types Tracked</div><div className="kpi-val">{HARDWOOD_TYPES.length}</div><div className="kpi-sub">{HARDWOOD_TYPES.join(', ')}</div></div>
        <div className="kpi"><div className="kpi-label">Active Assignments</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{Object.keys(hwAssignments).length}</div><div className="kpi-sub">jobs with hardwood booked</div></div>
        <div className="kpi"><div className="kpi-label">Unassigned Jobs</div><div className="kpi-val color-red">{unassignedJobs.length}</div><div className="kpi-sub">may need hardwood type</div></div>
      </div>

      {/* Capacity by Type */}
      <div className="card mb-12">
        <div className="card-head">Square Footage by Type</div>
        <div className="card-sub mb-8">Available inventory per hardwood type</div>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${HARDWOOD_TYPES.length},1fr)`,gap:'8px'}}>
          {HARDWOOD_TYPES.map(type => {
            const avail = sqftByType[type] || 0
            return (
              <div key={type} style={{padding:'12px',borderRadius:'8px',background: HARDWOOD_COLORS[type] + '15',border:`1px solid ${HARDWOOD_COLORS[type]}30`,textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color: HARDWOOD_COLORS[type],marginBottom:'4px'}}>{type}</div>
                <div style={{fontSize:'22px',fontWeight:700,color: HARDWOOD_COLORS[type],fontFamily:'var(--bp-mono)'}}>{avail.toLocaleString()}</div>
                <div style={{fontSize:'10px',color:'var(--bp-muted)'}}>sq ft available</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Timeline Navigation */}
      <div className="flex-between mb-8">
        <div className="flex gap-6">
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
          <button className="btn btn-ghost btn-xs" onClick={() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); setWeekStart(toISO(d)) }}>Today</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        </div>
        <span className="text-sm font-semibold color-navy">{weekLabel}</span>
      </div>

      {/* Calendar Heatmap — utilization per type per day */}
      <div className="card card-flush mb-12" style={{overflowX:'auto'}}>
        <table className="tbl" style={{minWidth:'700px'}}>
          <thead>
            <tr>
              <th style={{width:'100px',position:'sticky',left:0,background:'var(--bp-white)',zIndex:2}}>Type</th>
              {days.map(d => {
                const dt = new Date(d + 'T00:00:00')
                return <th key={d} style={{textAlign:'center',fontSize:'9px',padding:'6px 2px',minWidth:'48px'}}>
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()]}<br/>{dt.getDate()}
                </th>
              })}
            </tr>
          </thead>
          <tbody>
            {HARDWOOD_TYPES.map(type => {
              const capacity = sqftByType[type] || 0
              return (
                <tr key={type}>
                  <td style={{position:'sticky',left:0,background:'var(--bp-white)',zIndex:1,borderRight:'2px solid var(--bp-border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{width:'10px',height:'10px',borderRadius:'3px',background: HARDWOOD_COLORS[type]}}></div>
                      <span className="font-semibold" style={{fontSize:'11px'}}>{type}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'var(--bp-muted)'}}>{capacity.toLocaleString()} sq ft</div>
                  </td>
                  {days.map(d => {
                    const committed = (commitmentsByDay[d] || {})[type] || 0
                    const pct = capacity > 0 ? Math.round((committed / capacity) * 100) : 0
                    const uc = getUtilColor(pct)
                    return (
                      <td key={d} style={{textAlign:'center',padding:'4px 2px',background: committed > 0 ? uc.bg : undefined}}>
                        {committed > 0 ? (
                          <div>
                            <div style={{fontSize:'11px',fontWeight:700,color: uc.color,fontFamily:'var(--bp-mono)'}}>{committed.toLocaleString()}</div>
                            <div style={{fontSize:'8px',color: uc.color}}>{pct}%</div>
                          </div>
                        ) : (
                          <span style={{fontSize:'10px',color:'var(--bp-light)'}}>—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Active Assignments */}
      {Object.keys(hwAssignments).length > 0 && (
        <div className="card mb-12">
          <div className="card-head">Active Hardwood Assignments</div>
          <div className="card-sub mb-8">Jobs with hardwood type and square footage assigned</div>
          <table className="tbl">
            <thead><tr><th>Job</th><th>Type</th><th className="r">Sq Ft</th><th>Dates</th><th></th></tr></thead>
            <tbody>
              {Object.entries(hwAssignments).map(([jobId, a]) => (
                <tr key={jobId}>
                  <td className="font-semibold color-navy">{a.jobName}</td>
                  <td><span className="badge" style={{background: HARDWOOD_COLORS[a.type] + '20', color: HARDWOOD_COLORS[a.type]}}>{a.type}</span></td>
                  <td className="r mono font-bold">{a.sqft.toLocaleString()}</td>
                  <td className="mono text-sm color-muted">{shortDate(a.start)} — {shortDate(a.end)}</td>
                  <td><button className="btn btn-ghost btn-xs" style={{color:'var(--bp-red)'}} onClick={() => removeAssignment(jobId)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unassigned Pool */}
      <div className="card">
        <div className="card-head">Unassigned Jobs</div>
        <div className="card-sub mb-8">Upcoming jobs that may need hardwood — assign type and square footage</div>
        {unassignedJobs.length === 0 ? (
          <div className="text-sm color-muted" style={{padding:'8px 0'}}>No unassigned jobs in this period</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Job</th><th>Client</th><th>Install</th><th>Venue</th><th style={{width:'200px'}}>Assign</th></tr></thead>
            <tbody>
              {unassignedJobs.map(j => (
                <tr key={j.cr55d_jobid}>
                  <td className="font-semibold color-navy">{j.cr55d_jobname || 'Untitled'}</td>
                  <td>{j.cr55d_clientname || '—'}</td>
                  <td className="mono text-sm">{shortDate(isoDate(j.cr55d_installdate))}</td>
                  <td className="text-sm color-muted">{j.cr55d_venuename || '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {assigningJob === j.cr55d_jobid ? (
                      <div className="flex gap-4" style={{alignItems:'center'}}>
                        <select className="form-input" style={{padding:'3px 6px',fontSize:'11px',width:'80px'}} value={assignForm.type} onChange={e => setAssignForm(p => ({...p, type: e.target.value}))}>
                          <option value="">Type</option>
                          {HARDWOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input type="number" className="form-input" style={{padding:'3px 6px',fontSize:'11px',width:'70px'}} placeholder="Sq ft" value={assignForm.sqft} onChange={e => setAssignForm(p => ({...p, sqft: e.target.value}))} />
                        <button className="btn btn-primary btn-xs" onClick={() => saveAssignment(j.cr55d_jobid, j)} disabled={!assignForm.type || !assignForm.sqft}>✓</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => { setAssigningJob(null); setAssignForm({ type: '', sqft: '' }) }}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-outline btn-xs" onClick={() => setAssigningJob(j.cr55d_jobid)}>Assign Hardwood</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   CONFLICT HEATMAP — Utilization alerts + resolution (Spec 10.3)
   ═══════════════════════════════════════════════════════════════════ */
function ConflictHeatmap({ items, jobs, reservedByItem, hasDateRange, overlappingJobs }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bpt_inv_dismissed') || '{}') } catch { return {} }
  })
  const [resolveNotes, setResolveNotes] = useState({})
  const [selected, setSelected] = useState(new Set())

  function toggleSelect(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function selectAll(ids) {
    setSelected(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }
  function dismissSelected() {
    const next = { ...dismissed }
    selected.forEach(id => { next[id] = { note: resolveNotes[id] || 'Bulk dismissed', date: toISO(new Date()) } })
    setDismissed(next)
    try { localStorage.setItem('bpt_inv_dismissed', JSON.stringify(next)) } catch {}
    setSelected(new Set())
  }

  function dismiss(id, note) {
    const next = { ...dismissed, [id]: { note: note || '', date: toISO(new Date()) } }
    setDismissed(next)
    try { localStorage.setItem('bpt_inv_dismissed', JSON.stringify(next)) } catch {}
  }

  function undismiss(id) {
    const next = { ...dismissed }; delete next[id]
    setDismissed(next)
    try { localStorage.setItem('bpt_inv_dismissed', JSON.stringify(next)) } catch {}
  }

  // Find items where reserved >= 50% of rentable
  const allFlagged = useMemo(() => {
    if (!hasDateRange || !reservedByItem) return []
    const flagged = []
    for (const item of items) {
      if (!item.cr55d_rentableqty || item.cr55d_rentableqty <= 0) continue
      const reserved = reservedByItem[item.cr55d_inventoryid] || 0
      if (reserved <= 0) continue
      const pct = Math.round((reserved / item.cr55d_rentableqty) * 100)
      if (pct < 50) continue
      const hc = getUtilColor(pct)
      flagged.push({
        id: item.cr55d_inventoryid,
        name: item.cr55d_inventoryname || 'Unknown',
        category: CATEGORY_MAP[item.cr55d_category] || 'Other',
        rentable: item.cr55d_rentableqty,
        reserved,
        available: Math.max(0, item.cr55d_rentableqty - reserved),
        pct, ...hc,
      })
    }
    return flagged.sort((a, b) => b.pct - a.pct)
  }, [items, reservedByItem, hasDateRange])

  const activeConflicts = allFlagged.filter(c => !dismissed[c.id])
  const dismissedConflicts = allFlagged.filter(c => dismissed[c.id])
  const criticalCount = activeConflicts.filter(c => c.pct >= 90).length
  const highCount = activeConflicts.filter(c => c.pct >= 75 && c.pct < 90).length

  // All items with reservations for heatmap
  const heatmapItems = useMemo(() => {
    if (!hasDateRange || !reservedByItem) return []
    return items
      .filter(i => i.cr55d_rentableqty > 0 && (reservedByItem[i.cr55d_inventoryid] || 0) > 0)
      .map(i => {
        const reserved = reservedByItem[i.cr55d_inventoryid] || 0
        const pct = Math.round((reserved / i.cr55d_rentableqty) * 100)
        return { name: i.cr55d_inventoryname, pct, ...getUtilColor(pct) }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [items, reservedByItem, hasDateRange])

  if (!hasDateRange) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Set a Date Range</div>
          <div className="empty-state-sub">Use the date range filter above to see inventory conflicts for a specific period. The heatmap shows utilization across all items.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Summary KPIs */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Flagged Items</div><div className="kpi-val">{allFlagged.length}</div><div className="kpi-sub">at 50%+ utilization</div></div>
        <div className="kpi"><div className="kpi-label">Critical / Over</div><div className="kpi-val color-red">{criticalCount}</div><div className="kpi-sub">90%+ — action needed</div></div>
        <div className="kpi"><div className="kpi-label">High Utilization</div><div className="kpi-val" style={{color:'#92400e'}}>{highCount}</div><div className="kpi-sub">75-89% — monitor</div></div>
        <div className="kpi"><div className="kpi-label">Dismissed</div><div className="kpi-val color-green">{dismissedConflicts.length}</div><div className="kpi-sub">resolved or accepted</div></div>
      </div>

      {/* Active Conflicts */}
      {activeConflicts.length > 0 ? (
        <div className="card mb-12">
          <div className="card-head" style={{color: 'var(--bp-red)'}}>⚠️ Active Conflicts ({activeConflicts.length})</div>
          <div className="card-sub mb-8" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>Items at 50%+ utilization — resolve, source additional, or dismiss with notes</span>
            {selected.size > 0 && <button className="btn btn-sm" onClick={dismissSelected} style={{background:'var(--bp-navy)',color:'#fff',fontSize:'10px',padding:'4px 12px',border:'none',borderRadius:'6px'}}>Dismiss {selected.size} Selected</button>}
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:'30px'}}><input type="checkbox" onChange={() => selectAll(activeConflicts.map(c=>c.id))} checked={selected.size === activeConflicts.length && activeConflicts.length > 0} /></th>
                <th>Item</th>
                <th>Category</th>
                <th style={{textAlign:'center'}}>Rentable</th>
                <th style={{textAlign:'center'}}>Reserved</th>
                <th style={{textAlign:'center'}}>Available</th>
                <th style={{textAlign:'center',width:'100px'}}>Utilization</th>
                <th>Status</th>
                <th style={{width:'200px'}}>Resolve</th>
              </tr>
            </thead>
            <tbody>
              {activeConflicts.map(c => (
                <tr key={c.id} style={{background: selected.has(c.id) ? 'rgba(37,99,235,.04)' : undefined}}>
                  <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                  <td className="font-semibold color-navy">{c.name}</td>
                  <td className="text-sm color-muted">{c.category}</td>
                  <td className="text-center mono font-bold">{c.rentable}</td>
                  <td className="text-center mono font-bold" style={{color: c.color}}>{c.reserved}</td>
                  <td className="text-center mono font-bold" style={{color: c.available === 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{c.available}</td>
                  <td style={{padding:'4px 8px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{flex:1,height:'8px',borderRadius:'4px',background:'var(--bp-border-lt)',overflow:'hidden'}}>
                        <div style={{width: Math.min(c.pct, 100) + '%', height:'100%', borderRadius:'4px', background: c.color, transition:'width .3s'}}></div>
                      </div>
                      <span className="mono font-bold" style={{fontSize:'11px',color: c.color, minWidth:'36px', textAlign:'right'}}>{c.pct}%</span>
                    </div>
                  </td>
                  <td><span className="badge" style={{background: c.bg, color: c.color, fontSize:'10px'}}>{c.label}</span></td>
                  <td>
                    <div className="flex gap-4" style={{alignItems:'center'}}>
                      <input type="text" className="form-input" style={{flex:1,padding:'3px 6px',fontSize:'10px'}} placeholder="Notes..."
                        value={resolveNotes[c.id] || ''} onChange={e => setResolveNotes(p => ({...p, [c.id]: e.target.value}))} />
                      <button className="btn btn-ghost btn-xs" style={{fontSize:'9px',whiteSpace:'nowrap'}} onClick={() => dismiss(c.id, resolveNotes[c.id])}>Dismiss</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="callout callout-green mb-12">
          <span className="callout-icon">✅</span>
          <div><strong>No active conflicts.</strong> All items are below 50% utilization or have been dismissed.</div>
        </div>
      )}

      {/* Dismissed items (collapsible) */}
      {dismissedConflicts.length > 0 && (
        <details className="mb-12">
          <summary style={{cursor:'pointer',fontSize:'12px',fontWeight:600,color:'var(--bp-muted)',marginBottom:'8px'}}>
            {dismissedConflicts.length} Dismissed Conflict{dismissedConflicts.length !== 1 ? 's' : ''}
          </summary>
          <div className="card card-flush">
            <table className="tbl">
              <thead><tr><th>Item</th><th>Utilization</th><th>Note</th><th>Dismissed</th><th></th></tr></thead>
              <tbody>
                {dismissedConflicts.map(c => (
                  <tr key={c.id} style={{opacity:.7}}>
                    <td className="font-semibold">{c.name}</td>
                    <td><span className="mono font-bold" style={{color: c.color}}>{c.pct}%</span></td>
                    <td className="text-sm color-muted">{dismissed[c.id]?.note || '—'}</td>
                    <td className="text-sm mono color-muted">{dismissed[c.id]?.date || '—'}</td>
                    <td><button className="btn btn-ghost btn-xs" onClick={() => undismiss(c.id)}>Reopen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Heatmap grid */}
      {heatmapItems.length > 0 && (
        <div className="card">
          <div className="card-head">Utilization Heatmap</div>
          <div className="card-sub mb-8">All items with reservations in the selected period</div>
          <div style={{display:'flex',gap:'6px',marginBottom:'12px',flexWrap:'wrap'}}>
            {[{l:'Low (<50%)',c:'var(--bp-green)',b:'var(--bp-green-bg)'},{l:'Medium (50-74%)',c:'#B45309',b:'#FFFDE7'},{l:'High (75-89%)',c:'#92400e',b:'var(--bp-amber-bg)'},{l:'Critical (90-99%)',c:'#DC2626',b:'#FEF2F2'},{l:'Over (100%+)',c:'var(--bp-red)',b:'var(--bp-red-bg)'}].map(x => (
              <span key={x.l} style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'9px',color:'var(--bp-muted)'}}>
                <span style={{width:'10px',height:'10px',borderRadius:'2px',background:x.b,border:`1px solid ${x.c}30`}}></span>{x.l}
              </span>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'4px'}}>
            {heatmapItems.map((item, i) => (
              <div key={i} style={{padding:'8px',borderRadius:'6px',background: item.bg, textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:600,color: item.color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={item.name}>{item.name}</div>
                <div style={{fontSize:'16px',fontWeight:700,color: item.color,fontFamily:'var(--bp-mono)'}}>{item.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
