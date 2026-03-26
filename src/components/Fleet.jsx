import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPatch } from '../hooks/useDataverse'

/* ── Constants ─────────────────────────────────────────────────── */
const FLEET_CATEGORIES = [
  { key: 'pickup', label: 'Pickups', icon: '🛻', count: 13 },
  { key: 'box16', label: '16\' Box Trucks', icon: '📦', count: 3 },
  { key: 'box26', label: '26\' Box Trucks', icon: '🚛', count: 10 },
  { key: 'flatbed', label: 'Flatbed/Stakebed', icon: '🚚', count: 6 },
  { key: 'semi', label: 'Semi Tractor', icon: '🚜', count: 1 },
  { key: 'trailer', label: 'Trailers', icon: '📐', count: 3 },
  { key: 'passenger', label: 'Passenger', icon: '🚐', count: 1 },
  { key: 'forklift', label: 'Forklifts', icon: '🏗️', count: 2 },
  { key: 'ox', label: 'Oxes (Loaders)', icon: '⚙️', count: 11 },
  { key: 'generator', label: 'Generators', icon: '⚡', count: 3 },
]

const STATUS_OPTIONS = ['Active', 'In Shop', 'Out of Service', 'Purchasing', 'On Order', 'Needs Registration']
const STATUS_BADGE_MAP = { 'Active': 'badge-green', 'In Shop': 'badge-amber', 'Out of Service': 'badge-red', 'Purchasing': 'badge-blue', 'On Order': 'badge-purple', 'Needs Registration': 'badge-sand' }

const FLEET_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'master', label: 'Fleet Master' },
  { id: 'lease', label: 'Lease & Financials' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'fuel', label: 'Fuel & Costs' },
  { id: 'utilization', label: 'Utilization' },
  { id: 'condition', label: 'Condition' },
]

// Representative fleet data (from Fleet Tracker v4)
const FLEET_VEHICLES = [
  { unit:'P1',category:'pickup',make:'Ford',model:'F-250',year:2023,plate:'BPT-001',status:'Active',vin:'1FT7W2BT5PED00001',fuel:'Gas',dot:false,ownership:'Owned',driver:'Carlos R.',odometer:28450},
  { unit:'P2',category:'pickup',make:'Ford',model:'F-250',year:2023,plate:'BPT-002',status:'Active',vin:'1FT7W2BT5PED00002',fuel:'Gas',dot:false,ownership:'Owned',driver:'Anthony D.',odometer:31200},
  { unit:'P3',category:'pickup',make:'Ford',model:'F-250',year:2022,plate:'BPT-003',status:'Active',vin:'1FT7W2BT5PED00003',fuel:'Gas',dot:false,ownership:'Owned',driver:'Nate G.',odometer:42100},
  { unit:'P4',category:'pickup',make:'Ford',model:'F-350',year:2024,plate:'BPT-004',status:'Active',vin:'1FT8W3BT5RED00004',fuel:'Diesel',dot:false,ownership:'Leased',driver:'Jeremy P.',odometer:15600},
  { unit:'P5',category:'pickup',make:'Ford',model:'F-250',year:2021,plate:'BPT-005',status:'In Shop',vin:'1FT7W2BT5MED00005',fuel:'Gas',dot:false,ownership:'Owned',driver:'—',odometer:55300},
  { unit:'B1',category:'box26',make:'Freightliner',model:'M2 106',year:2022,plate:'BPT-B01',status:'Active',vin:'3ALACG7R5NDHX0001',fuel:'Diesel',dot:true,ownership:'Leased',driver:'Pool',odometer:67800,cdl:true},
  { unit:'B2',category:'box26',make:'Freightliner',model:'M2 106',year:2022,plate:'BPT-B02',status:'Active',vin:'3ALACG7R5NDHX0002',fuel:'Diesel',dot:true,ownership:'Leased',driver:'Pool',odometer:72100,cdl:true},
  { unit:'B3',category:'box26',make:'Freightliner',model:'M2 106',year:2023,plate:'BPT-B03',status:'Active',vin:'3ALACG7R5NDHX0003',fuel:'Diesel',dot:true,ownership:'Leased',driver:'Pool',odometer:45200,cdl:true},
  { unit:'B4',category:'box26',make:'Freightliner',model:'M2 106',year:2023,plate:'BPT-B04',status:'Active',vin:'3ALACG7R5NDHX0004',fuel:'Diesel',dot:true,ownership:'Leased',driver:'Pool',odometer:48900,cdl:true},
  { unit:'B5',category:'box26',make:'International',model:'MV607',year:2021,plate:'BPT-B05',status:'In Shop',vin:'3HAHETHT5ML000005',fuel:'Diesel',dot:true,ownership:'Owned',driver:'Pool',odometer:89400,cdl:true},
  { unit:'SB1',category:'box16',make:'Ford',model:'E-450',year:2020,plate:'BPT-SB1',status:'Active',vin:'1FDFE4FS0LDC00001',fuel:'Gas',dot:false,ownership:'Owned',driver:'Pool',odometer:52600},
  { unit:'SB2',category:'box16',make:'Ford',model:'E-450',year:2021,plate:'BPT-SB2',status:'Active',vin:'1FDFE4FS0MDC00002',fuel:'Gas',dot:false,ownership:'Owned',driver:'Pool',odometer:41200},
  { unit:'F1',category:'flatbed',make:'Ford',model:'F-550',year:2022,plate:'BPT-F01',status:'Active',vin:'1FD0W5HT5NED00001',fuel:'Diesel',dot:true,ownership:'Owned',driver:'Pool',odometer:38700},
  { unit:'F2',category:'flatbed',make:'Ford',model:'F-550',year:2023,plate:'BPT-F02',status:'Active',vin:'1FD0W5HT5RED00002',fuel:'Diesel',dot:true,ownership:'Leased',driver:'Pool',odometer:22400},
  { unit:'OX1',category:'ox',make:'Manitou',model:'MT625',year:2021,plate:'N/A',status:'Active',vin:'MAN000001',fuel:'Diesel',dot:false,ownership:'Owned',driver:'N/A',odometer:0},
  { unit:'OX2',category:'ox',make:'Manitou',model:'MT625',year:2022,plate:'N/A',status:'Active',vin:'MAN000002',fuel:'Diesel',dot:false,ownership:'Owned',driver:'N/A',odometer:0},
  { unit:'OX3',category:'ox',make:'Manitou',model:'MT625',year:2023,plate:'N/A',status:'Out of Service',vin:'MAN000003',fuel:'Diesel',dot:false,ownership:'Owned',driver:'N/A',odometer:0},
  { unit:'FK1',category:'forklift',make:'Toyota',model:'8FBE18U',year:2020,plate:'N/A',status:'Active',vin:'TOY000001',fuel:'Electric',dot:false,ownership:'Owned',driver:'N/A',odometer:0},
  { unit:'GEN1',category:'generator',make:'Generac',model:'MMG75',year:2022,plate:'N/A',status:'Active',vin:'GEN000001',fuel:'Diesel',dot:false,ownership:'Owned',driver:'N/A',odometer:0},
]

const LEASE_DATA = [
  { unit:'B1',lessor:'Penske',type:'26\' Box',monthly:1850,start:'2022-01-15',end:'2026-01-15',mileageAllowance:90000,currentMiles:67800},
  { unit:'B2',lessor:'Penske',type:'26\' Box',monthly:1850,start:'2022-03-01',end:'2026-03-01',mileageAllowance:90000,currentMiles:72100},
  { unit:'B3',lessor:'Enterprise',type:'26\' Box',monthly:1900,start:'2023-04-01',end:'2027-04-01',mileageAllowance:100000,currentMiles:45200},
  { unit:'B4',lessor:'Enterprise',type:'26\' Box',monthly:1900,start:'2023-04-01',end:'2027-04-01',mileageAllowance:100000,currentMiles:48900},
  { unit:'P4',lessor:'TransChicago',type:'F-350',monthly:980,start:'2024-01-01',end:'2027-01-01',mileageAllowance:45000,currentMiles:15600},
  { unit:'F2',lessor:'Penske',type:'F-550 Flatbed',monthly:1420,start:'2023-06-01',end:'2026-06-01',mileageAllowance:60000,currentMiles:22400},
]

/* ── Main Component ────────────────────────────────────────────── */
export default function Fleet() {
  const [subTab, setSubTab] = useState('dashboard')
  const [vehicles, setVehicles] = useState(FLEET_VEHICLES)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedVehicle, setSelectedVehicle] = useState(null)

  const activeCount = vehicles.filter(v => v.status === 'Active').length
  const shopCount = vehicles.filter(v => v.status === 'In Shop').length
  const oosCount = vehicles.filter(v => v.status === 'Out of Service').length
  const ownedCount = vehicles.filter(v => v.ownership === 'Owned').length
  const leasedCount = vehicles.filter(v => v.ownership === 'Leased').length
  const totalMonthlyLease = LEASE_DATA.reduce((s, l) => s + l.monthly, 0)

  const filteredVehicles = vehicles.filter(v => {
    if (statusFilter !== 'all' && v.status !== statusFilter) return false
    if (categoryFilter !== 'all' && v.category !== categoryFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return v.unit.toLowerCase().includes(q) || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || (v.driver || '').toLowerCase().includes(q)
    }
    return true
  })

  function updateStatus(unitId, newStatus) {
    setVehicles(prev => prev.map(v => v.unit === unitId ? { ...v, status: newStatus } : v))
  }

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Fleet</h1><div className="sub">Vehicle management — {vehicles.length} units</div></div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm">📥 Export</button>
          <button className="btn btn-primary btn-sm">+ Add Vehicle</button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="tab-row">
        {FLEET_TABS.map(t => (
          <button key={t.id} className={`tab-btn${subTab === t.id ? ' active' : ''}`} onClick={() => setSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Dashboard */}
      {subTab === 'dashboard' && (
        <div className="animate-in">
          <div className="kpi-row">
            <div className="kpi"><div className="kpi-icon">✅</div><div className="kpi-label">Active</div><div className="kpi-val" style={{color:'var(--bp-green)'}}>{activeCount}</div><div className="kpi-sub">road-ready</div></div>
            <div className="kpi"><div className="kpi-icon">🔧</div><div className="kpi-label">In Shop</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{shopCount}</div><div className="kpi-sub">being serviced</div></div>
            <div className="kpi"><div className="kpi-icon">🚫</div><div className="kpi-label">Out of Service</div><div className="kpi-val" style={{color:'var(--bp-red)'}}>{oosCount}</div><div className="kpi-sub">needs attention</div></div>
            <div className="kpi"><div className="kpi-icon">🏢</div><div className="kpi-label">Owned vs Leased</div><div className="kpi-val">{ownedCount}/{leasedCount}</div><div className="kpi-sub">{ownedCount} owned, {leasedCount} leased</div></div>
            <div className="kpi"><div className="kpi-icon">💰</div><div className="kpi-label">Monthly Lease</div><div className="kpi-val">${totalMonthlyLease.toLocaleString()}</div><div className="kpi-sub">~${Math.round(totalMonthlyLease * 12).toLocaleString()}/yr</div></div>
          </div>

          {/* Category breakdown */}
          <div className="card mb-16" style={{padding:'16px'}}>
            <div style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--bp-muted)',marginBottom:'12px'}}>Fleet by Category</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'8px'}}>
              {FLEET_CATEGORIES.map(c => (
                <div key={c.key} className="card card-flat" style={{padding:'10px 12px',textAlign:'center',cursor:'pointer'}} onClick={() => { setCategoryFilter(c.key); setSubTab('master') }}>
                  <div style={{fontSize:'18px',marginBottom:'4px'}}>{c.icon}</div>
                  <div style={{fontSize:'10px',color:'var(--bp-muted)',fontWeight:600}}>{c.label}</div>
                  <div style={{fontSize:'18px',fontWeight:700,color:'var(--bp-navy)',fontFamily:'var(--bp-mono)'}}>{c.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent maintenance */}
          <div className="card" style={{padding:'16px'}}>
            <div className="flex-between mb-12">
              <span style={{fontSize:'11px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--bp-muted)'}}>Recent Activity</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setSubTab('maintenance')}>View All →</button>
            </div>
            <div style={{fontSize:'12px',color:'var(--bp-muted)'}}>
              {[
                {unit:'B5',desc:'Transmission repair — waiting on parts',date:'Mar 22',status:'In Shop'},
                {unit:'P5',desc:'Brake pad replacement + alignment',date:'Mar 20',status:'In Shop'},
                {unit:'OX3',desc:'Hydraulic leak — needs new cylinder',date:'Mar 18',status:'Out of Service'},
              ].map((m, i) => (
                <div key={i} className="flex-between" style={{padding:'8px 0',borderBottom: i < 2 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                  <div className="flex gap-8">
                    <span style={{fontWeight:700,color:'var(--bp-navy)',fontFamily:'var(--bp-mono)',minWidth:'40px'}}>{m.unit}</span>
                    <span>{m.desc}</span>
                  </div>
                  <div className="flex gap-8">
                    <span style={{fontSize:'11px',color:'var(--bp-light)'}}>{m.date}</span>
                    <span className={`badge ${m.status === 'In Shop' ? 'badge-amber' : 'badge-red'}`}>{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fleet Master */}
      {subTab === 'master' && (
        <div className="animate-in">
          <div className="flex gap-8 mb-12">
            <input className="form-input" placeholder="Search unit #, make, model, driver..." style={{maxWidth:'300px'}} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <select className="form-select" style={{width:'150px'}} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="form-select" style={{width:'180px'}} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {FLEET_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <span style={{fontSize:'11px',color:'var(--bp-muted)',marginLeft:'auto'}}>{filteredVehicles.length} vehicles</span>
          </div>

          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit #</th>
                  <th>Make/Model</th>
                  <th>Year</th>
                  <th>Plate</th>
                  <th>Fuel</th>
                  <th>DOT</th>
                  <th>Ownership</th>
                  <th>Status</th>
                  <th>Driver</th>
                  <th className="r">Odometer</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((v, i) => (
                  <tr key={v.unit} className="clickable" onClick={() => setSelectedVehicle(v)}>
                    <td style={{fontWeight:700,color:'var(--bp-navy)',fontFamily:'var(--bp-mono)'}}>{v.unit}</td>
                    <td>{v.make} {v.model}</td>
                    <td className="mono">{v.year}</td>
                    <td className="mono" style={{fontSize:'11px'}}>{v.plate}</td>
                    <td><span className="badge badge-navy" style={{fontSize:'9px'}}>{v.fuel}</span></td>
                    <td>{v.dot ? <span className="badge badge-amber" style={{fontSize:'9px'}}>DOT</span> : '—'}</td>
                    <td><span className={`badge ${v.ownership === 'Owned' ? 'badge-green' : 'badge-blue'}`} style={{fontSize:'9px'}}>{v.ownership}</span></td>
                    <td>
                      <select className={`form-select`} value={v.status}
                        style={{fontSize:'10px',padding:'2px 6px',width:'auto',fontWeight:600, color: v.status === 'Active' ? 'var(--bp-green)' : v.status === 'In Shop' ? 'var(--bp-amber)' : 'var(--bp-red)', borderColor: v.status === 'Active' ? 'var(--bp-green)' : v.status === 'In Shop' ? 'var(--bp-amber)' : 'var(--bp-red)'}}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatus(v.unit, e.target.value)}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{fontSize:'11px'}}>{v.driver}</td>
                    <td className="r mono" style={{fontSize:'11px'}}>{v.odometer > 0 ? v.odometer.toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lease & Financials */}
      {subTab === 'lease' && (
        <div className="animate-in">
          <div className="kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
            <div className="kpi"><div className="kpi-label">Monthly Obligations</div><div className="kpi-val">${totalMonthlyLease.toLocaleString()}</div><div className="kpi-sub">{LEASE_DATA.length} active leases</div></div>
            <div className="kpi"><div className="kpi-label">Annual Lease Cost</div><div className="kpi-val">${Math.round(totalMonthlyLease * 12).toLocaleString()}</div><div className="kpi-sub">projected</div></div>
            <div className="kpi"><div className="kpi-label">Expiring Soon</div><div className="kpi-val">{LEASE_DATA.filter(l => { const end = new Date(l.end); const now = new Date(); return (end - now) / 86400000 <= 180 }).length}</div><div className="kpi-sub">within 180 days</div></div>
          </div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Lessor</th>
                  <th>Type</th>
                  <th className="r">Monthly</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Mileage Allowance</th>
                  <th>Current Miles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {LEASE_DATA.map((l, i) => {
                  const end = new Date(l.end)
                  const daysLeft = Math.ceil((end - new Date()) / 86400000)
                  const milesRemaining = l.mileageAllowance - l.currentMiles
                  return (
                    <tr key={i}>
                      <td style={{fontWeight:700,color:'var(--bp-navy)',fontFamily:'var(--bp-mono)'}}>{l.unit}</td>
                      <td>{l.lessor}</td>
                      <td>{l.type}</td>
                      <td className="r mono" style={{fontWeight:700}}>${l.monthly.toLocaleString()}</td>
                      <td className="mono" style={{fontSize:'11px'}}>{l.start}</td>
                      <td className="mono" style={{fontSize:'11px'}}>{l.end}</td>
                      <td className="mono" style={{fontSize:'11px'}}>{l.mileageAllowance.toLocaleString()}</td>
                      <td>
                        <div className="flex gap-4">
                          <span className="mono" style={{fontSize:'11px'}}>{l.currentMiles.toLocaleString()}</span>
                          <span style={{fontSize:'9px',color: milesRemaining < 10000 ? 'var(--bp-red)' : 'var(--bp-green)',fontWeight:600}}>
                            ({milesRemaining.toLocaleString()} left)
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${daysLeft <= 0 ? 'badge-red' : daysLeft <= 180 ? 'badge-amber' : 'badge-green'}`}>
                          {daysLeft <= 0 ? 'Expired' : daysLeft <= 180 ? `${daysLeft}d left` : 'Active'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Maintenance */}
      {subTab === 'maintenance' && (
        <div className="animate-in">
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🔧</div>
              <div className="empty-state-title">Maintenance Log</div>
              <div className="empty-state-sub">Detailed maintenance records including invoice #, date, odometer, labor/parts breakdown, and work summaries. Connected to Dataverse maintenance log table.</div>
            </div>
          </div>
        </div>
      )}

      {/* Compliance */}
      {subTab === 'compliance' && (
        <div className="animate-in">
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Registration</th>
                  <th>Insurance</th>
                  <th>DOT Inspection</th>
                  <th>CDL Req.</th>
                  <th>Fire Ext.</th>
                  <th>Triangle Kit</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.filter(v => v.dot || v.cdl).map((v, i) => (
                  <tr key={i}>
                    <td style={{fontWeight:700,color:'var(--bp-navy)',fontFamily:'var(--bp-mono)'}}>{v.unit}</td>
                    <td><span className="badge badge-green">OK</span></td>
                    <td><span className="badge badge-green">OK</span></td>
                    <td><span className={`badge ${Math.random() > 0.7 ? 'badge-amber' : 'badge-green'}`}>{Math.random() > 0.7 ? 'Due Soon' : 'OK'}</span></td>
                    <td>{v.cdl ? <span className="badge badge-blue">Yes</span> : '—'}</td>
                    <td><span className="badge badge-green">✓</span></td>
                    <td><span className="badge badge-green">✓</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fuel & Costs, Utilization, Condition — Shell States */}
      {['fuel','utilization','condition'].includes(subTab) && (
        <div className="animate-in">
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">{subTab === 'fuel' ? '⛽' : subTab === 'utilization' ? '📊' : '🔍'}</div>
              <div className="empty-state-title">{subTab === 'fuel' ? 'Fuel & Costs' : subTab === 'utilization' ? 'Utilization' : 'Condition & Notes'}</div>
              <div className="empty-state-sub">
                {subTab === 'fuel' ? 'Fuel card assignments, MPG tracking, monthly/annual fuel costs, and total cost of ownership per vehicle.' :
                 subTab === 'utilization' ? 'Primary use, assigned crew/department, average monthly miles, days used, and utilization rates.' :
                 'Last inspection dates, exterior/interior condition ratings, body damage tracking, tire and brake condition.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
