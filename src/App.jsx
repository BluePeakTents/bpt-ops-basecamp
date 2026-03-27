import { useState, useEffect } from 'react'
import { dvFetch } from './hooks/useDataverse'
import { toLocalISO, isoDate } from './utils/dateUtils'
import { JOB_FIELDS_LIGHT, ACTIVE_JOBS_FILTER } from './constants/dataverseFields'
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

/* ── Notification Helpers ──────────────────────────────────────── */
function buildJobNotifications(jobs) {
  const now = new Date()
  const today = toLocalISO(now)
  const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7)
  const weekISO = toLocalISO(weekOut)
  const twoWeeks = new Date(now); twoWeeks.setDate(twoWeeks.getDate() + 14)
  const twoWeekISO = toLocalISO(twoWeeks)
  const notifs = []

  for (const j of jobs) {
    const install = isoDate(j.cr55d_installdate)
    const strike = isoDate(j.cr55d_strikedate)
    const name = j.cr55d_clientname || j.cr55d_jobname || 'Job'

    // JULIE deadline alert — 7 days before install, no JULIE status
    if (install && !j.cr55d_juliestatus) {
      const deadline = new Date(install + 'T12:00:00')
      deadline.setDate(deadline.getDate() - 7)
      const deadlineISO = toLocalISO(deadline)
      if (deadlineISO <= weekISO && deadlineISO >= today) {
        notifs.push({
          id: `julie-${j.cr55d_jobid}`, type: 'julie_expiring',
          title: `JULIE Needed: ${name}`,
          description: `JULIE ticket deadline is ${deadlineISO} (7 days before install on ${install}). Submit now.`,
          timestamp: now.toISOString(), read: false, jobId: j.cr55d_jobid,
          installDate: install, author: 'System'
        })
      }
    }

    // Jobs installing this week
    if (install && install >= today && install <= weekISO) {
      notifs.push({
        id: `install-${j.cr55d_jobid}`, type: 'new_job',
        title: `Installing This Week: ${name}`,
        description: `${j.cr55d_jobname || ''} at ${j.cr55d_venuename || 'venue TBD'}. Install ${install}.${j.cr55d_salesrep ? ' Rep: ' + j.cr55d_salesrep : ''}`,
        timestamp: now.toISOString(), read: false, jobId: j.cr55d_jobid,
        installDate: install, author: j.cr55d_salesrep || 'System'
      })
    }

    // Strikes this week
    if (strike && strike >= today && strike <= weekISO) {
      notifs.push({
        id: `strike-${j.cr55d_jobid}`, type: 'job_changed',
        title: `Strike This Week: ${name}`,
        description: `${j.cr55d_jobname || ''} strike scheduled for ${strike} at ${j.cr55d_venuename || 'venue TBD'}.`,
        timestamp: now.toISOString(), read: true, jobId: j.cr55d_jobid,
        installDate: strike, author: 'System'
      })
    }

    // No PM assigned but installing within 2 weeks
    if (install && install <= twoWeekISO && install >= today && !j.cr55d_pmassigned) {
      notifs.push({
        id: `nopm-${j.cr55d_jobid}`, type: 'incomplete',
        title: `No PM: ${name}`,
        description: `Installing ${install} but no PM assigned yet. Assign via Scheduling → PM Capacity.`,
        timestamp: now.toISOString(), read: false, jobId: j.cr55d_jobid,
        installDate: install, author: 'System'
      })
    }
  }

  // Sort: unread first, then by install date proximity
  notifs.sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1
    return (a.installDate || '').localeCompare(b.installDate || '')
  })

  return notifs
}

/* ── Main App ──────────────────────────────────────────────────── */
function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('bpt_nav_collapsed') === '1' } catch { return false }
  })
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)

  const unreadCount = notifications.filter(n => !n.read).length

  // Load real notifications from Dataverse + generate smart alerts from jobs + recent notes
  useEffect(() => {
    let readIds = new Set()
    try { const saved = localStorage.getItem('bpt_notif_read'); if (saved) readIds = new Set(JSON.parse(saved)) } catch {}

    async function loadNotifications() {
      try {
        // Fetch notifications, jobs, AND recent notes in parallel
        const [dvNotifs, jobs, recentNotes] = await Promise.all([
          dvFetch('cr55d_notifications?$orderby=createdon desc&$top=50').catch(() => []),
          dvFetch(`cr55d_jobs?$select=${JOB_FIELDS_LIGHT}&$filter=${ACTIVE_JOBS_FILTER}&$orderby=cr55d_installdate asc&$top=200`).catch(() => []),
          dvFetch('cr55d_jobnotes?$orderby=createdon desc&$top=30&$select=cr55d_jobnoteid,cr55d_title,cr55d_details,cr55d_submittedby,cr55d_notetype,cr55d_jobname,createdon,_cr55d_job_value').catch(() => []),
        ])

        // Build job lookup for cross-referencing note → job install date
        const jobMap = {}
        const safeJobs = Array.isArray(jobs) ? jobs : []
        for (const j of safeJobs) { jobMap[j.cr55d_jobid] = j }

        // Map Dataverse notifications to our format
        const realNotifs = (Array.isArray(dvNotifs) ? dvNotifs : []).map(n => ({
          id: n.cr55d_notificationid || n.cr55d_notificationsid,
          type: n.cr55d_notificationtype || 'job_changed',
          title: n.cr55d_name || 'Notification',
          description: n.cr55d_description || '',
          timestamp: n.createdon || new Date().toISOString(),
          read: readIds.has(n.cr55d_notificationid || n.cr55d_notificationsid),
          jobId: n._cr55d_jobid_value || null,
          installDate: n.cr55d_installdate?.split('T')[0] || null,
          author: n.cr55d_author || 'System',
        }))

        // Convert recent notes into notifications
        const noteNotifs = (Array.isArray(recentNotes) ? recentNotes : []).map(n => {
          const linkedJob = n._cr55d_job_value ? jobMap[n._cr55d_job_value] : null
          const jobName = linkedJob?.cr55d_clientname || linkedJob?.cr55d_jobname || n.cr55d_jobname || ''
          return {
            id: `note-${n.cr55d_jobnoteid}`,
            type: 'note_added',
            title: `Note: ${jobName || 'Job'}`,
            description: `${n.cr55d_title || ''}${n.cr55d_details ? ' — ' + n.cr55d_details.substring(0, 120) : ''}`,
            timestamp: n.createdon || new Date().toISOString(),
            read: readIds.has(`note-${n.cr55d_jobnoteid}`),
            jobId: n._cr55d_job_value || null,
            installDate: linkedJob?.cr55d_installdate?.split('T')[0] || null,
            author: n.cr55d_submittedby || 'Sales Hub',
          }
        })

        // Generate smart notifications from job data
        const smartNotifs = buildJobNotifications(safeJobs)

        // Merge: notes first (most actionable), then Dataverse notifs, then smart alerts
        const seen = new Set()
        const merged = []
        for (const n of [...noteNotifs, ...realNotifs, ...smartNotifs]) {
          if (!seen.has(n.id)) { seen.add(n.id); merged.push(n) }
        }

        // Sort by timestamp descending
        merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

        setNotifications(merged)
      } catch (e) {
        console.error('[Notifications] Load failed:', e)
      }
    }

    loadNotifications()
    // Poll every 2 minutes for new notes/changes
    const interval = setInterval(loadNotifications, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

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

  function persistRead(ids) {
    try { localStorage.setItem('bpt_notif_read', JSON.stringify([...ids])) } catch {}
  }

  function handleMarkRead(id) {
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true } : n)
      persistRead(new Set(next.filter(n => n.read).map(n => n.id)))
      return next
    })
  }

  function handleMarkAllRead() {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }))
      persistRead(new Set(next.map(n => n.id)))
      return next
    })
  }

  function handleSnooze(id, date) {
    setNotifications(prev => {
      const next = prev.map(n => n.id === id ? { ...n, read: true, snoozedUntil: date } : n)
      persistRead(new Set(next.filter(n => n.read).map(n => n.id)))
      return next
    })
  }

  async function handleNavigateToJob(jobId) {
    setNotifOpen(false)
    setActiveTab('dashboard')
    if (!jobId) return
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      const job = await dvFetch(`cr55d_jobs(${safeId})?$select=${JOB_FIELDS_LIGHT}`)
      if (job) {
        setSelectedJob(job)
        setDrawerOpen(true)
      }
    } catch (e) {
      console.error('[App] Failed to load job for notification:', e)
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
          <div>
            <img src="/logo-sidebar.png" alt="Blue Peak" className="logo-full" />
            <p className="side-logo-text">Operations Hub</p>
          </div>
          <button className="nav-toggle" onClick={toggleNav} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 19l-7-7 7-7"/><path d="M18 19l-7-7 7-7" opacity=".4"/></svg>
          </button>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0}}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span className="nav-label">Report Bug</span>
          </button>
        </div>

        <div className="side-ver">v1.0 · March 2026</div>
      </aside>

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="main">
        {/* Top bar */}
        <div className="main-header">
          <button className={`notif-bell${unreadCount > 0 ? ' has-unread' : ''}`} onClick={() => setNotifOpen(true)} title={`${unreadCount} unread notifications`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
          </button>
        </div>

        {/* Active Tab Content */}
        <div key={activeTab} className="tab-enter">
          {renderTab()}
        </div>
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
