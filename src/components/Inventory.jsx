import { useState, useEffect, useMemo, useCallback } from 'react'
import { dvFetch } from '../hooks/useDataverse'

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
  { id: 'browse',      label: 'Browse All',        icon: '🔍', color: '#1D3A6B' },
]

/* ── Restroom trailer fleet (from Fleet Master — not in inventory table) */
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

  // Date range filter (by last count date)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { loadInventory() }, [])

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

  const activeItems = useMemo(() => {
    let list = items.filter(i => i.cr55d_isactive)
    if (dateFrom) list = list.filter(i => i.cr55d_lastcountdate && i.cr55d_lastcountdate.split('T')[0] >= dateFrom)
    if (dateTo) list = list.filter(i => i.cr55d_lastcountdate && i.cr55d_lastcountdate.split('T')[0] <= dateTo)
    return list
  }, [items, dateFrom, dateTo])

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
      await dvFetch(`cr55d_inventories(${inventoryId})`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cr55d_notes: notes })
      })
      setItems(prev => prev.map(i => i.cr55d_inventoryid === inventoryId ? { ...i, cr55d_notes: notes } : i))
    } catch (e) {
      console.error('[Inventory] Save notes failed:', e)
      alert('Failed to save notes: ' + e.message)
    }
  }, [])

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

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Inventory</h1><div className="sub">Product availability &amp; tracking</div><div className="page-head-accent"></div></div>
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={loadInventory} disabled={loading} title="Refresh from Dataverse">↻ Refresh</button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-8 mb-12" style={{alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'11px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-light)'}}>Last Count Range</span>
        <input type="date" className="form-input" style={{width:'150px',padding:'5px 10px',fontSize:'12px'}} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>to</span>
        <input type="date" className="form-input" style={{width:'150px',padding:'5px 10px',fontSize:'12px'}} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && <button className="btn btn-ghost btn-xs" onClick={() => { setDateFrom(''); setDateTo('') }}>Clear</button>}
        {(dateFrom || dateTo) && <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>{activeItems.length} items in range</span>}
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
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Total Units' : 'Items'}</div><div className="kpi-val">{kpiTotal}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'restroom trailers' : 'in this view'}</div></div>
        <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Available Now' : 'Total Quantity'}</div><div className="kpi-val color-green">{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'available').length : kpiTotalQty.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'ready to book' : 'across all items'}</div></div>
        <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Currently Booked' : 'Rentable'}</div><div className="kpi-val" style={{color: activeReport === 'restrooms' ? 'var(--bp-amber)' : 'var(--bp-green)'}}>{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'booked').length : kpiRentable.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'on jobs' : 'available for jobs'}</div></div>
        <div className="kpi"><div className="kpi-label">{activeReport === 'restrooms' ? 'Maintenance' : 'Broken / Out'}</div><div className="kpi-val color-red">{activeReport === 'restrooms' ? RESTROOM_UNITS.filter(u => u.status === 'maintenance').length : kpiBroken.toLocaleString()}</div><div className="kpi-sub">{activeReport === 'restrooms' ? 'out of service' : 'needs repair'}</div></div>
      </div>

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
      {activeReport === 'restrooms' && <RestroomReport units={RESTROOM_UNITS} />}
      {activeReport === 'hardwood' && <InventoryTable items={hardwoodItems} loading={loading} emptyIcon="🪵" emptyTitle="Hardwood Flooring" onSaveNotes={saveNotes} />}
      {activeReport === 'tables' && <InventoryTable items={tableItems} loading={loading} emptyIcon="🍽️" emptyTitle="Tables" onSaveNotes={saveNotes} />}
      {activeReport === 'chairs' && <InventoryTable items={chairItems} loading={loading} emptyIcon="🪑" emptyTitle="Chairs" onSaveNotes={saveNotes} />}
      {activeReport === 'dancefloors' && <InventoryTable items={danceFloorItems} loading={loading} emptyIcon="💃" emptyTitle="Dance Floors" onSaveNotes={saveNotes} />}

      {/* ── Browse All ──────────────────────────────────────────── */}
      {activeReport === 'browse' && (
        <div>
          {/* Search & Category filter toolbar */}
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
              <div className="text-sm color-muted" style={{padding:'8px 14px',borderBottom:'1px solid var(--bp-border-lt)'}}>{browseFiltered.length} item{browseFiltered.length !== 1 ? 's' : ''}</div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_inventoryname')}>Item Name{sortArrow('cr55d_inventoryname')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_category')}>Category{sortArrow('cr55d_category')}</th>
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_totalquantity')}>Total{sortArrow('cr55d_totalquantity')}</th>
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_rentableqty')}>Rentable{sortArrow('cr55d_rentableqty')}</th>
                    <th className="r" style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_brokenqty')}>Broken{sortArrow('cr55d_brokenqty')}</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_warehouselocation')}>Location{sortArrow('cr55d_warehouselocation')}</th>
                    <th>Position</th>
                    <th style={{cursor:'pointer'}} onClick={() => handleSort('cr55d_lastcountdate')}>Last Count{sortArrow('cr55d_lastcountdate')}</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {browseFiltered.map(item => <InvRow key={item.cr55d_inventoryid} item={item} onSaveNotes={saveNotes} />)}
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
function InvRow({ item, showCategory = true, onSaveNotes }) {
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
    <tr style={hasConflict ? {background:'rgba(239,68,68,.04)'} : undefined}>
      <td className="font-semibold color-navy" style={{fontSize:'12px'}}>
        {item.cr55d_inventoryname || '—'}
        {hasConflict && <span className="badge badge-red ml-4" style={{fontSize:'9px',padding:'1px 5px'}}>QTY CONFLICT</span>}
      </td>
      {showCategory && <td style={{fontSize:'11.5px'}}>{item.cr55d_category_label}</td>}
      <td className="r mono">{item.cr55d_totalquantity ?? '—'}</td>
      <td className="r mono font-bold color-green">{item.cr55d_rentableqty ?? '—'}</td>
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
   INVENTORY TABLE (shared by Hardwood, Tables, Chairs, Dance Floors)
   ═══════════════════════════════════════════════════════════════════ */
function InventoryTable({ items, loading, emptyIcon, emptyTitle, onSaveNotes }) {
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
            <th className="r">Broken</th>
            <th>Location</th>
            <th>Position</th>
            <th>Last Count</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => <InvRow key={item.cr55d_inventoryid} item={item} showCategory={false} onSaveNotes={onSaveNotes} />)}
        </tbody>
      </table>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   RESTROOM REPORT (fleet units — not from inventory table)
   ═══════════════════════════════════════════════════════════════════ */
function RestroomReport({ units }) {
  return (
    <div>
      <div className="card card-flush">
        <table className="tbl">
          <thead>
            <tr>
              <th>Unit #</th>
              <th>Size</th>
              <th>Type</th>
              <th>Make</th>
              <th>Year</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u, i) => (
              <tr key={i}>
                <td className="font-bold color-navy">{u.unit}</td>
                <td>{u.size}</td>
                <td><span className={`badge ${u.type === 'Guest' ? 'badge-blue' : 'badge-navy'}`}>{u.type}</span></td>
                <td className="text-md">{u.make || '—'}</td>
                <td className="mono text-md">{u.year || '—'}</td>
                <td>
                  <span className={`badge ${u.status === 'available' ? 'badge-green' : u.status === 'booked' ? 'badge-amber' : u.status === 'maintenance' ? 'badge-red' : 'badge-gray'}`}>
                    {u.status}
                  </span>
                </td>
                <td className="text-md color-light">{u.note || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>Restroom trailers are tracked as fleet units, not inventory items. Unit-level booking and calendar assignment coming soon.</div>
      </div>
    </div>
  )
}
