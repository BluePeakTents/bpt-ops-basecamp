import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPost, dvPatch, dvDelete } from '../hooks/useDataverse'
import { EMPLOYEE_CATEGORIES } from '../data/crewConstants'

/* ═══════════════════════════════════════════════════════════════════
   MANAGE EMPLOYEES MODAL
   Full CRUD against cr55d_stafflists in Dataverse.
   View, add, edit, deactivate employees with CDL class, department,
   lead status, days off, phone, email.
   ═══════════════════════════════════════════════════════════════════ */

const DEPT_LABELS = {
  306280000: 'Executive', 306280001: 'Ops Mgmt', 306280002: 'Sales',
  306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member',
  306280006: 'Warehouse', 306280007: 'Admin', 306280008: 'Marketing',
  306280009: 'Finance', 306280010: 'Crew Leader'
}
const OPS_DEPTS = [306280001, 306280003, 306280004, 306280005, 306280006, 306280010]

const CDL_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'A', label: 'CDL-A (Semi + all)' },
  { value: 'B', label: 'CDL-B (Tandem, 750, C-class)' },
  { value: 'C', label: 'CDL-C (C-Stake, Box, Ox)' },
  { value: 'D', label: 'Class D (250, Sm Box)' },
  { value: 'TVDL', label: 'TVDL (Temp)' },
]

const STATUS_MAP = { 306280000: 'Active', 306280001: 'Inactive', 306280002: 'On Leave' }

function getDisplayName(name) {
  if (!name) return ''
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

export default function ManageEmployees({ open, onClose, onRefresh }) {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [editingId, setEditingId] = useState(null)
  const [addingNew, setAddingNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Form state for add/edit
  const [form, setForm] = useState({
    name: '', employeeid: '', department: 306280005, status: 306280000,
    licensetype: '', islead: false, phone: '', email: '',
  })

  useEffect(() => {
    if (open) loadStaff()
  }, [open])

  async function loadStaff() {
    setLoading(true)
    try {
      const data = await dvFetch('cr55d_stafflists?$select=cr55d_stafflistid,cr55d_name,cr55d_employeeid,cr55d_department,cr55d_status,cr55d_licensetype,cr55d_islead,cr55d_phone,cr55d_email,cr55d_isoperational&$orderby=cr55d_name asc&$top=200')
      setStaff(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('[ManageEmployees] Load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return staff.filter(s => {
      if (search) {
        const q = search.toLowerCase()
        const name = getDisplayName(s.cr55d_name).toLowerCase()
        if (!name.includes(q) && !(s.cr55d_employeeid || '').includes(q)) return false
      }
      if (deptFilter && s.cr55d_department !== parseInt(deptFilter)) return false
      if (statusFilter === 'active' && s.cr55d_status !== 306280000) return false
      if (statusFilter === 'inactive' && s.cr55d_status === 306280000) return false
      return true
    })
  }, [staff, search, deptFilter, statusFilter])

  function startEdit(emp) {
    setEditingId(emp.cr55d_stafflistid)
    setForm({
      name: emp.cr55d_name || '',
      employeeid: emp.cr55d_employeeid || '',
      department: emp.cr55d_department || 306280005,
      status: emp.cr55d_status || 306280000,
      licensetype: emp.cr55d_licensetype || '',
      islead: !!emp.cr55d_islead,
      phone: emp.cr55d_phone || '',
      email: emp.cr55d_email || '',
    })
    setAddingNew(false)
  }

  function startAdd() {
    setAddingNew(true)
    setEditingId(null)
    setForm({ name: '', employeeid: '', department: 306280005, status: 306280000, licensetype: '', islead: false, phone: '', email: '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setAddingNew(false)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        cr55d_name: form.name.trim(),
        cr55d_employeeid: form.employeeid.trim(),
        cr55d_department: parseInt(form.department),
        cr55d_status: parseInt(form.status),
        cr55d_licensetype: form.licensetype,
        cr55d_islead: form.islead,
        cr55d_phone: form.phone.trim(),
        cr55d_email: form.email.trim(),
      }

      if (addingNew) {
        await dvPost('cr55d_stafflists', body)
        showToast(`Added ${getDisplayName(form.name)}`)
      } else if (editingId) {
        await dvPatch(`cr55d_stafflists(${editingId})`, body)
        showToast(`Updated ${getDisplayName(form.name)}`)
      }
      cancelEdit()
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('[ManageEmployees] Save failed:', e)
      showToast(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(emp) {
    if (!confirm(`Deactivate ${getDisplayName(emp.cr55d_name)}? They won't appear in scheduling.`)) return
    try {
      await dvPatch(`cr55d_stafflists(${emp.cr55d_stafflistid})`, { cr55d_status: 306280001 })
      showToast(`Deactivated ${getDisplayName(emp.cr55d_name)}`)
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('[ManageEmployees] Deactivate failed:', e)
    }
  }

  async function handleReactivate(emp) {
    try {
      await dvPatch(`cr55d_stafflists(${emp.cr55d_stafflistid})`, { cr55d_status: 306280000 })
      showToast(`Reactivated ${getDisplayName(emp.cr55d_name)}`)
      await loadStaff()
      if (onRefresh) onRefresh()
    } catch (e) {
      console.error('[ManageEmployees] Reactivate failed:', e)
    }
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (!open) return null

  const activeCount = staff.filter(s => s.cr55d_status === 306280000).length
  const leaderCount = staff.filter(s => s.cr55d_islead).length
  const cdlCount = staff.filter(s => s.cr55d_licensetype && s.cr55d_licensetype !== '').length

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'900px',maxHeight:'85vh',display:'flex',flexDirection:'column',padding:0}}>
        {/* Header */}
        <div style={{padding:'18px 22px',borderBottom:'1px solid var(--bp-border)',flexShrink:0}}>
          <div className="flex-between">
            <div>
              <h3 style={{fontSize:'16px',fontWeight:700,color:'var(--bp-navy)',marginBottom:'2px'}}>Manage Employees</h3>
              <div style={{fontSize:'11px',color:'var(--bp-muted)'}}>{activeCount} active · {leaderCount} leaders · {cdlCount} CDL holders</div>
            </div>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{padding:'10px 22px',borderBottom:'1px solid var(--bp-border-lt)',background:'var(--bp-alt)',flexShrink:0}}>
          <div className="flex gap-8">
            <input className="form-input" placeholder="Search name or ID..." style={{maxWidth:'220px',fontSize:'12px'}} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-select" style={{width:'150px',fontSize:'11px'}} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All Departments</option>
              {OPS_DEPTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
            </select>
            <select className="form-select" style={{width:'110px',fontSize:'11px'}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
            <div className="ml-auto">
              <button className="btn btn-primary btn-sm" onClick={startAdd}>+ Add Employee</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'0'}}>
          {loading ? (
            <div className="loading-state" style={{padding:'40px'}}><div className="loading-spinner" style={{marginBottom:'12px'}}></div>Loading roster...</div>
          ) : (
            <table className="tbl" style={{fontSize:'12px'}}>
              <thead>
                <tr>
                  <th style={{width:'22%',paddingLeft:'22px'}}>Name</th>
                  <th style={{width:'7%'}}>ID</th>
                  <th style={{width:'12%'}}>Department</th>
                  <th style={{width:'8%'}}>CDL</th>
                  <th style={{width:'6%'}}>Lead</th>
                  <th style={{width:'12%'}}>Phone</th>
                  <th style={{width:'15%'}}>Email</th>
                  <th style={{width:'8%'}}>Status</th>
                  <th style={{width:'10%'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Add New Row */}
                {addingNew && (
                  <tr style={{background:'rgba(46,125,82,.04)'}}>
                    <td style={{paddingLeft:'22px'}}><input className="form-input" style={{fontSize:'11px',padding:'4px 8px'}} placeholder="Last, First" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} autoFocus /></td>
                    <td><input className="form-input" style={{fontSize:'11px',padding:'4px 6px',width:'50px'}} placeholder="#" value={form.employeeid} onChange={e => setForm(p => ({...p, employeeid: e.target.value}))} /></td>
                    <td>
                      <select className="form-select" style={{fontSize:'10px',padding:'3px 4px'}} value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))}>
                        {OPS_DEPTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="form-select" style={{fontSize:'10px',padding:'3px 4px'}} value={form.licensetype} onChange={e => setForm(p => ({...p, licensetype: e.target.value}))}>
                        {CDL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value || '—'}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" checked={form.islead} onChange={e => setForm(p => ({...p, islead: e.target.checked}))} /></td>
                    <td><input className="form-input" style={{fontSize:'10px',padding:'3px 6px'}} placeholder="Phone" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} /></td>
                    <td><input className="form-input" style={{fontSize:'10px',padding:'3px 6px'}} placeholder="Email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} /></td>
                    <td><span className="badge badge-green" style={{fontSize:'9px'}}>New</span></td>
                    <td>
                      <div className="flex gap-4">
                        <button className="btn btn-success btn-xs" onClick={handleSave} disabled={saving}>{saving ? '...' : 'Save'}</button>
                        <button className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                )}

                {filtered.map(emp => {
                  const isEditing = editingId === emp.cr55d_stafflistid
                  return (
                    <tr key={emp.cr55d_stafflistid} style={{background: isEditing ? 'rgba(37,99,235,.04)' : ''}}>
                      <td style={{paddingLeft:'22px'}}>
                        {isEditing ? (
                          <input className="form-input" style={{fontSize:'11px',padding:'4px 8px'}} value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
                        ) : (
                          <div>
                            <span style={{fontWeight:600,color:'var(--bp-navy)'}}>{getDisplayName(emp.cr55d_name)}</span>
                            {emp.cr55d_islead && <span className="badge badge-navy" style={{fontSize:'8px',marginLeft:'6px',padding:'1px 5px'}}>LEAD</span>}
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{fontSize:'11px',color:'var(--bp-muted)'}}>
                        {isEditing ? (
                          <input className="form-input" style={{fontSize:'10px',padding:'3px 6px',width:'50px'}} value={form.employeeid} onChange={e => setForm(p => ({...p, employeeid: e.target.value}))} />
                        ) : emp.cr55d_employeeid || '—'}
                      </td>
                      <td>
                        {isEditing ? (
                          <select className="form-select" style={{fontSize:'10px',padding:'3px 4px'}} value={form.department} onChange={e => setForm(p => ({...p, department: e.target.value}))}>
                            {OPS_DEPTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                          </select>
                        ) : (
                          <span style={{fontSize:'10px'}}>{DEPT_LABELS[emp.cr55d_department] || '—'}</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <select className="form-select" style={{fontSize:'10px',padding:'3px 4px'}} value={form.licensetype} onChange={e => setForm(p => ({...p, licensetype: e.target.value}))}>
                            {CDL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value || '—'}</option>)}
                          </select>
                        ) : (
                          emp.cr55d_licensetype ? <span className="badge badge-blue" style={{fontSize:'9px'}}>{emp.cr55d_licensetype}</span> : <span style={{color:'var(--bp-light)'}}>—</span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input type="checkbox" checked={form.islead} onChange={e => setForm(p => ({...p, islead: e.target.checked}))} />
                        ) : (
                          emp.cr55d_islead ? <span style={{color:'var(--bp-green)',fontWeight:700,fontSize:'11px'}}>✓</span> : ''
                        )}
                      </td>
                      <td style={{fontSize:'10px',color:'var(--bp-muted)'}}>
                        {isEditing ? (
                          <input className="form-input" style={{fontSize:'10px',padding:'3px 6px'}} value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
                        ) : emp.cr55d_phone || ''}
                      </td>
                      <td style={{fontSize:'10px',color:'var(--bp-muted)'}}>
                        {isEditing ? (
                          <input className="form-input" style={{fontSize:'10px',padding:'3px 6px'}} value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
                        ) : emp.cr55d_email || ''}
                      </td>
                      <td>
                        <span className={`badge ${emp.cr55d_status === 306280000 ? 'badge-green' : emp.cr55d_status === 306280002 ? 'badge-amber' : 'badge-gray'}`} style={{fontSize:'9px'}}>
                          {STATUS_MAP[emp.cr55d_status] || '—'}
                        </span>
                      </td>
                      <td>
                        {isEditing ? (
                          <div className="flex gap-4">
                            <button className="btn btn-success btn-xs" onClick={handleSave} disabled={saving}>{saving ? '...' : 'Save'}</button>
                            <button className="btn btn-ghost btn-xs" onClick={cancelEdit}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <button className="btn btn-ghost btn-xs" onClick={() => startEdit(emp)}>Edit</button>
                            {emp.cr55d_status === 306280000 ? (
                              <button className="btn btn-ghost btn-xs" style={{color:'var(--bp-red)',fontSize:'9px'}} onClick={() => handleDeactivate(emp)}>Deactivate</button>
                            ) : (
                              <button className="btn btn-ghost btn-xs" style={{color:'var(--bp-green)',fontSize:'9px'}} onClick={() => handleReactivate(emp)}>Reactivate</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}

                {filtered.length === 0 && !addingNew && (
                  <tr><td colSpan={9} className="tbl-empty">No employees match your filters</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'10px 22px',borderTop:'1px solid var(--bp-border)',flexShrink:0,background:'var(--bp-alt)'}}>
          <div className="flex-between">
            <span style={{fontSize:'11px',color:'var(--bp-muted)'}}>{filtered.length} of {staff.length} employees shown</span>
            <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Toast */}
        {toast && <div className="toast show info" style={{position:'fixed',bottom:'24px',right:'24px',zIndex:10001}}>{toast}</div>}
      </div>
    </div>
  )
}
