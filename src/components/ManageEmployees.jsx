import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPost, dvPatch, dvDelete } from '../hooks/useDataverse'
import { EMPLOYEE_CATEGORIES } from '../data/crewConstants'

/* =================================================================
   MANAGE EMPLOYEES - Master-Detail Split Panel
   Full CRUD against cr55d_stafflists in Dataverse.
   Left: searchable/filterable roster list
   Right: view detail or edit form
   ================================================================= */

const ALL_DEPT_LABELS = {
  306280000: 'Executive', 306280001: 'Ops Mgmt', 306280002: 'Sales',
  306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member',
  306280006: 'Warehouse', 306280007: 'Admin', 306280008: 'Marketing',
  306280009: 'Finance', 306280010: 'Crew Leader'
}

// Only show ops-related departments in this view
const OPS_DEPT_KEYS = new Set([306280001, 306280003, 306280004, 306280005, 306280006, 306280010])
const DEPT_LABELS = Object.fromEntries(Object.entries(ALL_DEPT_LABELS).filter(([k]) => OPS_DEPT_KEYS.has(Number(k))))

const DEPT_COLORS = {
  306280000: '#1D3A6B', 306280001: '#1D3A6B', 306280002: '#2563EB',
  306280003: '#8B5CF6', 306280004: '#D97706', 306280005: '#2B4F8A',
  306280006: '#6B7280', 306280007: '#059669', 306280008: '#EC4899',
  306280009: '#B45309', 306280010: '#2E7D52'
}

const CDL_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'A', label: 'CDL-A (Semi + all)' },
  { value: 'B', label: 'CDL-B (Tandem, 750, C-class)' },
  { value: 'C', label: 'CDL-C (C-Stake, Box, Ox)' },
  { value: 'D', label: 'Class D (250, Sm Box)' },
  { value: 'TVDL', label: 'TVDL (Temp)' },
]

const CDL_LABEL_MAP = Object.fromEntries(CDL_OPTIONS.map(o => [o.value, o.label]))

const STATUS_MAP = { 306280000: 'Active', 306280001: 'Inactive', 306280002: 'On Leave' }
const STATUS_BADGE = { 306280000: 'badge-green', 306280001: 'badge-gray', 306280002: 'badge-amber' }

function getDisplayName(name) {
  if (!name) return ''
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return (parts[1][0] || '') + (parts[0][0] || '')
  return name.split(' ').map(n => n[0]).join('').substring(0, 2)
}

const EMPTY_FORM = { name: '', employeeid: '', department: 306280005, status: 306280000, licensetype: '', islead: false, phone: '', email: '' }

export default function ManageEmployees({ open, onClose, onRefresh }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('view')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const [deduping, setDeduping] = useState(false)
  const [dedupeResult, setDedupeResult] = useState(null)

  useEffect(() => {
    if (open) {
      loadStaff()
      setSelectedId(null)
      setMode('view')
    }
  }, [open])

  async function loadStaff() {
    setLoading(true)
    try {
      const data = await dvFetch('cr55d_stafflists?$select=cr55d_stafflistid,cr55d_name,cr55d_employeeid,cr55d_department,cr55d_status,cr55d_licensetype,cr55d_islead,cr55d_phone,cr55d_email,cr55d_isoperational,createdon&$orderby=cr55d_name asc&$top=500')
      setStaff(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('[ManageEmployees] Load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  async function runDedupe() {
    setDeduping(true)
    setDedupeResult(null)
    try {
      // Group by normalized name
      const groups = {}
      staff.forEach(s => {
        const key = (s.cr55d_name || '').trim().toLowerCase()
        if (!key) return
        if (!groups[key]) groups[key] = []
        groups[key].push(s)
      })

      let deactivated = 0
      const names = []

      for (const [, group] of Object.entries(groups)) {
        if (group.length < 2) continue
        // Sort by createdon ascending — oldest first
        group.sort((a, b) => new Date(a.createdon) - new Date(b.createdon))
        const keep = group[0]
        // Deactivate all newer duplicates
        for (let i = 1; i < group.length; i++) {
          const dupe = group[i]
          if (dupe.cr55d_status === 306280001) continue // already inactive
          await dvPatch('cr55d_stafflists(' + dupe.cr55d_stafflistid + ')', { cr55d_status: 306280001 })
          deactivated++
        }
        if (group.length > 1) names.push(getDisplayName(keep.cr55d_name))
      }

      setDedupeResult({ deactivated, names })
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('[ManageEmployees] Dedupe failed:', e)
      showToast('Dedupe error: ' + e.message)
    } finally {
      setDeduping(false)
    }
  }

  const filtered = useMemo(() => {
    return staff.filter(s => {
      // Only show ops-related departments
      if (!OPS_DEPT_KEYS.has(s.cr55d_department)) return false
      if (search) {
        const q = search.toLowerCase()
        const name = getDisplayName(s.cr55d_name).toLowerCase()
        if (!name.includes(q) && !(s.cr55d_employeeid || '').includes(q)) return false
      }
      if (deptFilter && s.cr55d_department !== parseInt(deptFilter, 10)) return false
      if (statusFilter === 'active' && s.cr55d_status !== 306280000) return false
      if (statusFilter === 'inactive' && s.cr55d_status === 306280000) return false
      return true
    })
  }, [staff, search, deptFilter, statusFilter])

  const selected = useMemo(() => {
    if (!selectedId) return null
    return staff.find(s => s.cr55d_stafflistid === selectedId) || null
  }, [staff, selectedId])

  // Track which names appear more than once (for duplicate badges)
  const duplicateNames = useMemo(() => {
    const counts = {}
    staff.forEach(s => {
      const n = (s.cr55d_name || '').trim().toLowerCase()
      if (n) counts[n] = (counts[n] || 0) + 1
    })
    return new Set(Object.keys(counts).filter(n => counts[n] > 1))
  }, [staff])

  const opsStaff = useMemo(() => staff.filter(s => OPS_DEPT_KEYS.has(s.cr55d_department)), [staff])
  const kpis = useMemo(() => ({
    active: opsStaff.filter(s => s.cr55d_status === 306280000).length,
    leaders: opsStaff.filter(s => s.cr55d_islead && s.cr55d_status === 306280000).length,
    cdl: opsStaff.filter(s => s.cr55d_licensetype && s.cr55d_licensetype !== '' && s.cr55d_status === 306280000).length,
    onLeave: opsStaff.filter(s => s.cr55d_status === 306280002).length,
  }), [opsStaff])

  function handleSelect(emp) {
    setSelectedId(emp.cr55d_stafflistid)
    setMode('view')
    setConfirmDeactivate(null)
  }

  function startAdd() {
    setSelectedId(null)
    setMode('add')
    setForm({ ...EMPTY_FORM })
    setConfirmDeactivate(null)
    setConfirmDuplicate(false)
  }

  function startEdit() {
    if (!selected) return
    setMode('edit')
    setForm({
      name: selected.cr55d_name || '',
      employeeid: selected.cr55d_employeeid || '',
      department: selected.cr55d_department || 306280005,
      status: selected.cr55d_status || 306280000,
      licensetype: selected.cr55d_licensetype || '',
      islead: !!selected.cr55d_islead,
      phone: selected.cr55d_phone || '',
      email: selected.cr55d_email || '',
    })
    setConfirmDeactivate(null)
  }

  function cancelEdit() {
    setMode('view')
    setConfirmDeactivate(null)
    setConfirmDuplicate(false)
  }

  async function handleSave(forceCreate = false) {
    if (!form.name.trim()) return

    // Check for duplicate name when adding
    if (mode === 'add' && !forceCreate) {
      const nameNorm = form.name.trim().toLowerCase()
      const existing = staff.find(s => (s.cr55d_name || '').trim().toLowerCase() === nameNorm)
      if (existing) {
        setConfirmDuplicate(true)
        return
      }
    }
    setConfirmDuplicate(false)

    setSaving(true)
    try {
      const body = {
        cr55d_name: form.name.trim(),
        cr55d_employeeid: form.employeeid.trim(),
        cr55d_department: parseInt(form.department, 10),
        cr55d_status: parseInt(form.status, 10),
        cr55d_licensetype: form.licensetype,
        cr55d_islead: form.islead,
        cr55d_phone: form.phone.trim(),
        cr55d_email: form.email.trim(),
      }

      if (mode === 'add') {
        const result = await dvPost('cr55d_stafflists', body)
        showToast('Added ' + getDisplayName(form.name))
        // Auto-select the newly created employee
        if (result?.cr55d_stafflistid) setSelectedId(result.cr55d_stafflistid)
      } else if (selectedId) {
        await dvPatch('cr55d_stafflists(' + selectedId + ')', body)
        showToast('Updated ' + getDisplayName(form.name))
      }
      await loadStaff()
      setMode('view')
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('[ManageEmployees] Save failed:', e)
      showToast('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!selected || saving) return
    setSaving(true)
    try {
      await dvPatch('cr55d_stafflists(' + selected.cr55d_stafflistid + ')', { cr55d_status: 306280001 })
      showToast('Deactivated ' + getDisplayName(selected.cr55d_name))
      setConfirmDeactivate(null)
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      showToast('Failed to deactivate: ' + e.message)
    } finally { setSaving(false) }
  }

  async function handleReactivate() {
    if (!selected || saving) return
    setSaving(true)
    try {
      await dvPatch('cr55d_stafflists(' + selected.cr55d_stafflistid + ')', { cr55d_status: 306280000 })
      showToast('Reactivated ' + getDisplayName(selected.cr55d_name))
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      showToast('Failed to reactivate: ' + e.message)
    } finally { setSaving(false) }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function updateForm(key, val) {
    setForm(p => ({ ...p, [key]: val }))
  }

  if (!open) return null

  const sep = <span className="text-md" style={{color:'var(--bp-border)'}}>|</span>

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal emp-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="emp-header">
          <div className="flex-between mb-8">
            <div>
              <h3 className="text-2xl font-bold color-navy" style={{marginBottom:'1px'}}>Employee Roster</h3>
              <div className="text-md color-muted">{staff.length} total employees in system</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              {duplicateNames.size > 0 && (
                <button className="btn btn-sm" style={{background:'var(--bp-red)',color:'#fff',borderColor:'var(--bp-red)',fontSize:'12px'}} onClick={runDedupe} disabled={deduping}>
                  {deduping ? 'Deduplicating...' : `Dedupe (${duplicateNames.size} dupes)`}
                </button>
              )}
              <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
            </div>
          </div>
          {dedupeResult && (
            <div className="callout callout-green" style={{marginTop:'8px'}}>
              <span className="callout-icon">&#10003;</span>
              <div style={{flex:1}}>
                <div className="font-semibold">Deduplicated {dedupeResult.deactivated} record{dedupeResult.deactivated !== 1 ? 's' : ''}</div>
                {dedupeResult.names.length > 0 && (
                  <div className="text-md" style={{marginTop:'4px',color:'var(--bp-muted)'}}>Affected: {dedupeResult.names.join(', ')}</div>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDedupeResult(null)} style={{fontSize:'11px'}}>Dismiss</button>
            </div>
          )}
        </div>

        {/* KPI Bar */}
        <div className="emp-kpi-row">
          <div className="emp-kpi">
            <div className="kpi-label">Active Headcount</div>
            <div className="kpi-val" style={{color:'var(--bp-navy)'}}>{kpis.active}</div>
          </div>
          <div className="emp-kpi">
            <div className="kpi-label">Crew Leaders</div>
            <div className="kpi-val" style={{color:'var(--bp-green)'}}>{kpis.leaders}</div>
          </div>
          <div className="emp-kpi">
            <div className="kpi-label">CDL Holders</div>
            <div className="kpi-val" style={{color:'var(--bp-info)'}}>{kpis.cdl}</div>
          </div>
          <div className="emp-kpi">
            <div className="kpi-label">On Leave</div>
            <div className="kpi-val" style={{color: kpis.onLeave > 0 ? 'var(--bp-amber)' : 'var(--bp-light)'}}>{kpis.onLeave}</div>
          </div>
        </div>

        {/* Split Body */}
        <div className="emp-split">

          {/* Left: Employee List */}
          <div className="emp-list-pane">
            <div className="emp-list-toolbar">
              <input className="form-input text-base" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
              <div className="emp-list-filters">
                <select className="form-select text-md" style={{flex:1}} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                  <option value="">All Departments</option>
                  {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="form-select text-md" style={{width:'90px'}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </div>
              <button className="btn btn-primary btn-sm" style={{width:'100%'}} onClick={startAdd}>+ Add Employee</button>
            </div>

            <div className="emp-list-scroll">
              {loading ? (
                <div className="loading-state" style={{padding:'40px'}}><div className="loading-spinner mb-12"></div>Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="empty-state" style={{padding:'30px 16px'}}>
                  <div className="empty-state-icon">&#128100;</div>
                  <div className="empty-state-title">No matches</div>
                  <div className="empty-state-sub">Try adjusting your search or filters</div>
                </div>
              ) : (
                filtered.map(emp => {
                  const isSelected = selectedId === emp.cr55d_stafflistid
                  const isInactive = emp.cr55d_status !== 306280000
                  return (
                    <div key={emp.cr55d_stafflistid} className={'emp-list-item' + (isSelected ? ' selected' : '')} style={isInactive ? {opacity:.6} : undefined} onClick={() => handleSelect(emp)}>
                      <div className="emp-avatar">{getInitials(emp.cr55d_name)}</div>
                      <div className="emp-info">
                        <div className="emp-name">{getDisplayName(emp.cr55d_name)}</div>
                        <div className="emp-dept">
                          {DEPT_LABELS[emp.cr55d_department] || 'Unknown'}
                          {emp.cr55d_employeeid && <span style={{marginLeft:'6px',fontFamily:'var(--bp-mono)',fontSize:'10.5px',color:'var(--bp-light)'}}>#{emp.cr55d_employeeid}</span>}
                        </div>
                      </div>
                      <div className="emp-list-meta">
                        {duplicateNames.has((emp.cr55d_name || '').trim().toLowerCase()) && <span className="badge badge-red" style={{fontSize:'10px',padding:'1px 5px'}}>DUPE</span>}
                        {emp.cr55d_islead && <span className="badge badge-green" style={{fontSize:'10px',padding:'1px 5px'}}>LEAD</span>}
                        {emp.cr55d_licensetype && <span className="badge badge-blue" style={{fontSize:'10px',padding:'1px 5px'}}>{emp.cr55d_licensetype}</span>}
                        {emp.cr55d_status === 306280002 && <span className="badge badge-amber" style={{fontSize:'10px',padding:'1px 5px'}}>LEAVE</span>}
                        {emp.cr55d_status === 306280001 && <span className="badge badge-gray" style={{fontSize:'10px',padding:'1px 5px'}}>OFF</span>}
                      </div>
                    </div>
                  )
                })
              )}
              {!loading && <div className="text-sm" style={{padding:'8px 14px',color:'var(--bp-light)',borderTop:'1px solid var(--bp-border-lt)'}}>{filtered.length} of {staff.length} shown</div>}
            </div>
          </div>

          {/* Right: Detail / Form */}
          <div className="emp-detail-pane">
            {mode === 'view' && !selected ? (
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <div className="empty-state">
                  <div className="empty-state-icon">&#128101;</div>
                  <div className="empty-state-title">Select an Employee</div>
                  <div className="empty-state-sub">Choose someone from the list or add a new team member</div>
                </div>
              </div>

            ) : (mode === 'edit' || mode === 'add') ? (
              <>
                <div className="emp-detail-header">
                  <h3 className="font-bold color-navy" style={{fontSize:'15px',marginBottom:'2px'}}>
                    {mode === 'add' ? 'New Employee' : 'Edit: ' + getDisplayName(selected?.cr55d_name)}
                  </h3>
                  <div className="text-sm color-muted">* Required fields</div>
                </div>
                <div className="emp-detail-body">
                  <div className="emp-section">
                    <div className="emp-section-title">Personal Information</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                      <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <input className="form-input" placeholder="Last, First" value={form.name} onChange={e => updateForm('name', e.target.value)} autoFocus />
                        <div className="form-hint">Format: Last, First (e.g. Hernandez, Jorge)</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Employee ID</label>
                        <input className="form-input" placeholder="e.g. 1042" value={form.employeeid} onChange={e => updateForm('employeeid', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="emp-section">
                    <div className="emp-section-title">Role &amp; Licensing</div>
                    <div className="mb-8" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                      <div className="form-group">
                        <label className="form-label">Department *</label>
                        <select className="form-select" value={form.department} onChange={e => updateForm('department', e.target.value)}>
                          {Object.entries(DEPT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">CDL / License</label>
                        <select className="form-select" value={form.licensetype} onChange={e => updateForm('licensetype', e.target.value)}>
                          {CDL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                      <div className="form-group">
                        <label className="form-label" style={{display:'block',marginBottom:'6px'}}>Crew Lead</label>
                        <label style={{display:'flex',alignItems:'center',gap:'7px',cursor:'pointer'}}>
                          <input type="checkbox" checked={form.islead} onChange={e => updateForm('islead', e.target.checked)} />
                          <span className="text-base" style={{color:'var(--bp-text)'}}>This employee is a crew leader</span>
                        </label>
                      </div>
                      {mode === 'edit' && (
                        <div className="form-group">
                          <label className="form-label">Status</label>
                          <select className="form-select" value={form.status} onChange={e => updateForm('status', e.target.value)}>
                            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="emp-section">
                    <div className="emp-section-title">Contact Information</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input className="form-input" type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={e => updateForm('phone', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" placeholder="name@bluepeaktents.com" value={form.email} onChange={e => updateForm('email', e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>

                {confirmDuplicate && (
                  <div className="callout callout-amber" style={{margin:'0 16px 12px'}}>
                    <span className="callout-icon">&#9888;</span>
                    <div style={{flex:1}}>
                      <div className="font-semibold mb-4">Duplicate Name Detected</div>
                      <div className="text-md mb-8">An employee named "{form.name.trim()}" already exists. Add anyway?</div>
                      <div style={{display:'flex',gap:'8px'}}>
                        <button className="btn btn-sm" style={{background:'var(--bp-amber)',color:'#fff',borderColor:'var(--bp-amber)'}} onClick={() => handleSave(true)}>Add Anyway</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDuplicate(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="emp-detail-actions">
                  <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={saving || !form.name.trim()}>
                    {saving ? 'Saving...' : mode === 'add' ? 'Add Employee' : 'Save Changes'}
                  </button>
                </div>
              </>

            ) : selected ? (
              <>
                <div className="emp-detail-header">
                  <div style={{display:'flex',alignItems:'flex-start',gap:'14px'}}>
                    <div className="text-2xl font-bold color-navy" style={{width:'48px',height:'48px',borderRadius:'12px',background:'var(--bp-navy-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {getInitials(selected.cr55d_name)}
                    </div>
                    <div style={{flex:1}}>
                      <h3 className="font-bold color-navy mb-4" style={{fontSize:'18px',lineHeight:1.2}}>
                        {getDisplayName(selected.cr55d_name)}
                      </h3>
                      <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                        {selected.cr55d_employeeid && <span className="text-md color-muted" style={{fontFamily:'var(--bp-mono)'}}>#{selected.cr55d_employeeid}</span>}
                        {selected.cr55d_employeeid && sep}
                        <span className="text-md font-semibold" style={{color: DEPT_COLORS[selected.cr55d_department] || 'var(--bp-muted)'}}>{DEPT_LABELS[selected.cr55d_department] || 'Unknown'}</span>
                        {sep}
                        <span className={'badge text-xs ' + (STATUS_BADGE[selected.cr55d_status] || 'badge-gray')}>{STATUS_MAP[selected.cr55d_status] || 'Unknown'}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'8px',marginTop:'14px'}}>
                    <button className="btn btn-outline btn-sm" onClick={startEdit}>Edit</button>
                    {selected.cr55d_status === 306280000 ? (
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--bp-red)'}} onClick={() => setConfirmDeactivate(selected.cr55d_stafflistid)}>Deactivate</button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" style={{color:'var(--bp-green)'}} onClick={handleReactivate}>Reactivate</button>
                    )}
                  </div>
                </div>

                <div className="emp-detail-body">
                  {confirmDeactivate && (
                    <div className="callout callout-red" style={{marginBottom:'16px'}}>
                      <span className="callout-icon">&#9888;</span>
                      <div style={{flex:1}}>
                        <div className="font-semibold mb-4">Deactivate {getDisplayName(selected.cr55d_name)}?</div>
                        <div className="text-md mb-8">They will be removed from scheduling and active crew lists.</div>
                        <div style={{display:'flex',gap:'8px'}}>
                          <button className="btn btn-sm" style={{background:'var(--bp-red)',color:'#fff',borderColor:'var(--bp-red)'}} onClick={handleDeactivate}>Confirm Deactivation</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeactivate(null)}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="emp-section">
                    <div className="emp-section-title">Role &amp; Licensing</div>
                    <div className="emp-field">
                      <span className="emp-field-label">Department</span>
                      <span className="emp-field-value" style={{color: DEPT_COLORS[selected.cr55d_department] || 'var(--bp-text)'}}>{DEPT_LABELS[selected.cr55d_department] || '\u2014'}</span>
                    </div>
                    <div className="emp-field">
                      <span className="emp-field-label">CDL / License Class</span>
                      <span className="emp-field-value">
                        {selected.cr55d_licensetype ? (
                          <span className="badge badge-blue text-sm">{CDL_LABEL_MAP[selected.cr55d_licensetype] || selected.cr55d_licensetype}</span>
                        ) : <span style={{color:'var(--bp-light)'}}>None</span>}
                      </span>
                    </div>
                    <div className="emp-field">
                      <span className="emp-field-label">Crew Leader</span>
                      <span className="emp-field-value">
                        {selected.cr55d_islead ? (
                          <span className="font-bold" style={{color:'var(--bp-green)'}}>{'\u2713'} Yes</span>
                        ) : <span style={{color:'var(--bp-light)'}}>No</span>}
                      </span>
                    </div>
                  </div>

                  <div className="emp-section">
                    <div className="emp-section-title">Contact Information</div>
                    <div className="emp-field">
                      <span className="emp-field-label">Phone</span>
                      <span className="emp-field-value">{selected.cr55d_phone || <span style={{color:'var(--bp-light)'}}>Not set</span>}</span>
                    </div>
                    <div className="emp-field">
                      <span className="emp-field-label">Email</span>
                      <span className="emp-field-value">{selected.cr55d_email || <span style={{color:'var(--bp-light)'}}>Not set</span>}</span>
                    </div>
                  </div>

                  <div className="emp-section">
                    <div className="emp-section-title">Status</div>
                    <div className="emp-field">
                      <span className="emp-field-label">Current Status</span>
                      <span className="emp-field-value">
                        <span className={'badge text-sm ' + (STATUS_BADGE[selected.cr55d_status] || 'badge-gray')}>{STATUS_MAP[selected.cr55d_status] || 'Unknown'}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        {toast && <div className="toast show info" style={{position:'fixed',bottom:'24px',right:'24px',zIndex:10001}}>{toast}</div>}
      </div>
    </div>
  )
}
