import { useState, useEffect, useCallback } from 'react'
import './styles/basecamp.css'
import Dashboard from './components/Dashboard'
import Scheduling from './components/Scheduling'
import Inventory from './components/Inventory'
import Fleet from './components/Fleet'
import OpsAdmin from './components/OpsAdmin'
import AskOps from './components/AskOps'
import JobDrawer from './components/JobDrawer'
import NotificationPanel from './components/NotificationPanel'
import BugReport from './components/BugReport'

/* ── Icons (SVG) ───────────────────────────────────────────────── */
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

/* ── Sample Notifications ──────────────────────────────────────── */
function generateNotifications() {
  const now = new Date()
  return [
    {
      id: '1', type: 'new_job', title: 'New Job Invoiced',
      description: 'Henderson Wedding — 60×120 structure at Butterfield Country Club. Sales rep: David Cesar.',
      timestamp: new Date(now - 3600000).toISOString(), read: false, jobId: null,
      installDate: '2026-04-18', author: 'David Cesar'
    },
    {
      id: '2', type: 'note_added', title: 'Note Added: Johnson Corporate',
      description: 'Client changed tent from 6x23 marquee to 6x75 — need to update load list and truck allocation.',
      timestamp: new Date(now - 7200000).toISOString(), read: false, jobId: null,
      installDate: '2026-04-12', author: 'Kyle Turriff'
    },
    {
      id: '3', type: 'job_changed', title: 'Schedule Change: Geneva Festival',
      description: 'Install dates moved from Apr 20-22 to Apr 18-20. Strike moved to Apr 24.',
      timestamp: new Date(now - 14400000).toISOString(), read: false, jobId: null,
      installDate: '2026-04-18', author: 'Glen Hansen'
    },
    {
      id: '4', type: 'julie_expiring', title: 'JULIE Ticket Expiring',
      description: 'Blackhawks Community Event — JULIE confirmation expires in 3 days. Resubmission needed.',
      timestamp: new Date(now - 28800000).toISOString(), read: false, jobId: null,
      installDate: '2026-04-05', author: 'System'
    },
    {
      id: '5', type: 'purchase_request', title: 'Purchase Request',
      description: 'Client wants a 21x45 but we only have 21x40 — need to order one more bay section.',
      timestamp: new Date(now - 43200000).toISOString(), read: false, jobId: null,
      installDate: '2026-05-15', author: 'Desiree Pearson'
    },
    {
      id: '6', type: 'note_added', title: 'Drawing Uploaded: Smith Wedding',
      description: 'Site map and tent layout drawing added to job documents. Review for load list generation.',
      timestamp: new Date(now - 86400000).toISOString(), read: true, jobId: null,
      installDate: '2026-04-25', author: 'Larrisa Henington'
    },
    {
      id: '7', type: 'job_changed', title: 'Crew Count Updated',
      description: 'Lake County Fair — crew count increased from 8 to 12 for install day 1. Additional trucks may be needed.',
      timestamp: new Date(now - 172800000).toISOString(), read: true, jobId: null,
      installDate: '2026-04-30', author: 'AJ'
    },
    {
      id: '8', type: 'new_job', title: 'New Job Invoiced',
      description: 'Martinez Social — 40×60 clearspan at Elgin Country Club. Sales rep: Glen Hansen.',
      timestamp: new Date(now - 259200000).toISOString(), read: true, jobId: null,
      installDate: '2026-05-10', author: 'Glen Hansen'
    },
  ]
}

/* ── Main App ──────────────────────────────────────────────────── */
function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('bpt_nav_collapsed') === '1' } catch { return false }
  })
  const [notifications, setNotifications] = useState(generateNotifications)
  const [notifOpen, setNotifOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  function toggleNav() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem('bpt_nav_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  function handleSelectJob(job) {
    setSelectedJob(job)
    setDrawerOpen(true)
  }

  function handleCloseDrawer() {
    setDrawerOpen(false)
    setTimeout(() => setSelectedJob(null), 300)
  }

  function handleMarkRead(id) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  function handleSnooze(id, date) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, snoozedUntil: date } : n))
  }

  function handleNavigateToJob(jobId) {
    setNotifOpen(false)
    if (jobId) {
      // Would navigate to specific job — for now, switch to dashboard
      setActiveTab('dashboard')
    }
  }

  // Render active tab component
  function renderTab() {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onSelectJob={handleSelectJob} />
      case 'scheduling': return <Scheduling onSelectJob={handleSelectJob} />
      case 'inventory': return <Inventory />
      case 'fleet': return <Fleet />
      case 'admin': return <OpsAdmin onSelectJob={handleSelectJob} />
      case 'askops': return <AskOps />
      default: return <Dashboard onSelectJob={handleSelectJob} />
    }
  }

  return (
    <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="side">
        <div className="side-logo">
          <div className="side-logo-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bp-ivory)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21l9-18 9 18H3z"/>
              <line x1="7" y1="15" x2="17" y2="15" opacity=".5"/>
            </svg>
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

        <div className="side-footer">
          <button className="side-bug-btn" onClick={() => setBugReportOpen(true)}>
            <span style={{marginRight:'6px'}}>🐛</span>
            <span className="nav-label">Report a Bug</span>
          </button>
        </div>

        <div className="side-toggle">
          <button onClick={toggleNav} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <div className="side-ver">v1.0 · March 2026</div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="main">
        {/* Top bar with notification bell */}
        <div className="main-header">
          <button className="notif-bell" onClick={() => setNotifOpen(true)} title={`${unreadCount} unread notifications`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
        </div>

        {/* Active Tab Content */}
        {renderTab()}
      </div>

      {/* ── Job Detail Drawer ──────────────────────────────────── */}
      <JobDrawer job={selectedJob} open={drawerOpen} onClose={handleCloseDrawer} />

      {/* ── Notification Panel ─────────────────────────────────── */}
      <NotificationPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onSnooze={handleSnooze}
        onNavigateToJob={handleNavigateToJob}
      />

      {/* ── Bug Report Modal ───────────────────────────────────── */}
      <BugReport open={bugReportOpen} onClose={() => setBugReportOpen(false)} currentPage={activeTab} />
    </div>
  )
}

export default App
