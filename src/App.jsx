import { useState } from 'react'
import './styles/basecamp.css'

function Dashboard() {
  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Dashboard</h1><div className="sub">Daily command center</div></div>
        <div className="flex">
          <button className="pill active">All</button>
          <button className="pill">Loading</button>
          <button className="pill">Installing</button>
          <button className="pill">Event Day</button>
          <button className="pill">Striking</button>
          <button className="pill">Returned</button>
        </div>
      </div>
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Jobs Installing This Week</div><div className="kpi-val">0</div><div className="kpi-sub">0 crew days</div></div>
        <div className="kpi"><div className="kpi-label">Crews Deployed Today</div><div className="kpi-val">0</div><div className="kpi-sub">active in field</div></div>
        <div className="kpi"><div className="kpi-label">Trucks Out</div><div className="kpi-val">0 / 49</div><div className="kpi-sub">assigned vs total</div></div>
        <div className="kpi"><div className="kpi-label">In Removal</div><div className="kpi-val">0</div><div className="kpi-sub">striking this week</div></div>
        <div className="kpi"><div className="kpi-label">Overnights This Month</div><div className="kpi-val">0</div><div className="kpi-sub">travel jobs</div></div>
      </div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <div className="empty-state-title">Delivery Schedule</div>
          <div className="empty-state-sub">Jobs will appear here when invoiced from the Sales Hub</div>
        </div>
      </div>
    </div>
  )
}

function Scheduling() {
  return (
    <div>
      <div className="page-head"><h1>Scheduling</h1><div className="sub">Crew, trucks, PMs, event techs</div></div>
      <div className="flex" style={{gap:'6px',marginBottom:'16px'}}>
        <button className="pill active">Crew Schedule</button>
        <button className="pill">Truck Schedule</button>
        <button className="pill">PM Capacity</button>
        <button className="pill">Event Techs</button>
        <button className="pill">Leader Sheet</button>
        <button className="pill">Travel</button>
      </div>
      <div className="card"><div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-title">Crew Scheduler</div><div className="empty-state-sub">Crew scheduling will be built here</div></div></div>
    </div>
  )
}

function Inventory() {
  return (
    <div>
      <div className="page-head"><h1>Inventory</h1><div className="sub">Product availability reporting</div></div>
      <div className="flex" style={{gap:'6px',marginBottom:'16px'}}>
        <button className="pill active">Restrooms</button>
        <button className="pill">Hardwood Flooring</button>
        <button className="pill">Tables</button>
        <button className="pill">Chairs</button>
        <button className="pill">Dance Floors</button>
      </div>
      <div className="card"><div className="empty-state"><div className="empty-state-icon">📦</div><div className="empty-state-title">Inventory Reports</div><div className="empty-state-sub">Select a report above to check availability</div></div></div>
    </div>
  )
}

function Fleet() {
  return (
    <div>
      <div className="page-head flex-between"><div><h1>Fleet</h1><div className="sub">Vehicle management</div></div><div className="flex"><button className="btn btn-primary btn-sm">+ Add Vehicle</button></div></div>
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Pickups</div><div className="kpi-val">13</div></div>
        <div className="kpi"><div className="kpi-label">Box Trucks</div><div className="kpi-val">13</div></div>
        <div className="kpi"><div className="kpi-label">Flatbeds</div><div className="kpi-val">6</div></div>
        <div className="kpi"><div className="kpi-label">Loaders (Oxes)</div><div className="kpi-val">11</div></div>
        <div className="kpi"><div className="kpi-label">Total Fleet</div><div className="kpi-val">49</div><div className="kpi-sub">37 owned, 12 leased</div></div>
      </div>
      <div className="card"><div className="empty-state"><div className="empty-state-icon">🚚</div><div className="empty-state-title">Fleet Master</div><div className="empty-state-sub">Vehicle inventory will load from Dataverse</div></div></div>
    </div>
  )
}

function OpsAdmin() {
  return (
    <div>
      <div className="page-head"><h1>Ops Admin</h1><div className="sub">JULIE, permits, sub-rentals, porta-potties</div></div>
      <div className="flex" style={{gap:'6px',marginBottom:'16px'}}>
        <button className="pill active">JULIE Tracker</button>
        <button className="pill">Permits</button>
        <button className="pill">Sub-Rentals</button>
        <button className="pill">Purchase Requests</button>
      </div>
      <div className="card"><div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-title">JULIE Tracker</div><div className="empty-state-sub">JULIE tickets auto-populate from invoiced jobs</div></div></div>
    </div>
  )
}

function AskOps() {
  return (
    <div>
      <div className="page-head"><h1>Ask Ops</h1><div className="sub">AI assistant for operations</div></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'20px'}}>
        {[
          {icon:'📋',name:'Generate Load List',desc:'From invoice or job record'},
          {icon:'📅',name:'Build Production Schedule',desc:'AI-drafted in Semarjian format'},
          {icon:'📦',name:'Check Inventory',desc:'Natural language product queries'},
          {icon:'👥',name:'Crew Availability',desc:'Who is available when?'},
          {icon:'🔍',name:'Ask About a Job',desc:'Status, crew, schedule, docs'},
        ].map((s,i) => (
          <div key={i} className="card" style={{cursor:'pointer',padding:'14px 16px'}}>
            <div style={{fontSize:'20px',marginBottom:'6px'}}>{s.icon}</div>
            <div style={{fontSize:'13px',fontWeight:600,color:'var(--bp-navy)',marginBottom:'2px'}}>{s.name}</div>
            <div style={{fontSize:'11px',color:'var(--bp-muted)'}}>{s.desc}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{padding:'16px'}}>
        <div style={{fontSize:'11px',color:'var(--bp-muted)',marginBottom:'8px'}}>Quick questions</div>
        <div className="flex" style={{flexWrap:'wrap',gap:'6px',marginBottom:'12px'}}>
          {["What's going out tomorrow?","Any JULIE tickets expiring?","Overnight jobs next 2 weeks","Which trucks are down?","Who's available Tuesday?"].map((q,i) => (
            <button key={i} className="pill" style={{fontSize:'10px',padding:'4px 10px'}}>{q}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <input className="form-input" placeholder="Ask anything about operations..." style={{flex:1}} />
          <button className="btn btn-primary">Send</button>
        </div>
      </div>
    </div>
  )
}

const icons = {
  dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  scheduling: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  inventory: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  fleet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  admin: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  askops: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>,
}

const navTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
  { id: 'scheduling', label: 'Scheduling', icon: icons.scheduling },
  { id: 'inventory', label: 'Inventory', icon: icons.inventory },
  { id: 'fleet', label: 'Fleet', icon: icons.fleet },
  { id: 'admin', label: 'Ops Admin', icon: icons.admin },
  { id: 'askops', label: 'Ask Ops', icon: icons.askops },
]

const tabComponents = { dashboard: Dashboard, scheduling: Scheduling, inventory: Inventory, fleet: Fleet, admin: OpsAdmin, askops: AskOps }

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [notifCount] = useState(3)
  const ActiveComponent = tabComponents[activeTab]

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      <aside className="side">
        <div className="side-logo">
          <div className="side-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bp-ivory)" strokeWidth="2"><path d="M3 21l9-18 9 18H3z"/></svg>
          </div>
          <div>
            <div className="side-logo-text">Base Camp</div>
            <div className="side-logo-sub">Operations Hub</div>
          </div>
        </div>
        <nav>
          {navTabs.map(t => (
            <a key={t.id} className={activeTab === t.id ? 'active' : ''} onClick={() => setActiveTab(t.id)}>
              {t.icon}<span className="nav-label">{t.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-toggle">
          <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '→' : '←'}
          </button>
        </div>
        <div className="side-ver">v1.0 · March 2026</div>
      </aside>
      <div className="main">
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'4px'}}>
          <button className="notif-bell" title="Notifications">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--bp-navy)" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            {notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
          </button>
        </div>
        <ActiveComponent />
      </div>
    </div>
  )
}

export default App
