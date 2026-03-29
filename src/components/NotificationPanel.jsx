import { useState, useEffect } from 'react'
import { isoDate } from '../utils/dateUtils'

const NOTIF_TYPES = {
  new_job: { icon: '📋', label: 'New Job', iconClass: 'new-job' },
  note_added: { icon: '💬', label: 'Note', iconClass: 'note' },
  job_changed: { icon: '⚠️', label: 'Change', iconClass: 'change' },
  julie_expiring: { icon: '🔴', label: 'JULIE', iconClass: 'julie' },
  permit_deadline: { icon: '📋', label: 'Permit', iconClass: 'permit' },
  job_ready: { icon: '✅', label: 'Ready', iconClass: 'ready' },
  purchase_request: { icon: '🛒', label: 'Purchase', iconClass: 'purchase' },
  drawing_added: { icon: '📐', label: 'Drawing', iconClass: 'note' },
  portapotty: { icon: '🚽', label: 'Porta-Potty', iconClass: 'change' },
  sub_rental: { icon: '📦', label: 'Sub-Rental', iconClass: 'change' },
  incomplete: { icon: '🔴', label: 'Incomplete', iconClass: 'julie' },
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function formatInstallDate(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}`
}

function daysUntilInstall(d) {
  if (!d) return null
  const install = new Date(d + 'T12:00:00')
  const now = new Date()
  now.setHours(12,0,0,0)
  return Math.ceil((install - now) / 86400000)
}

export default function NotificationPanel({ open, onClose, notifications, onMarkRead, onMarkAllRead, onSnooze, onNavigateToJob }) {
  const [filter, setFilter] = useState('all')
  const [snoozeTarget, setSnoozeTarget] = useState(null)
  const [snoozeDate, setSnoozeDate] = useState('')

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'new_job', label: 'New Jobs' },
    { id: 'note_added', label: 'Notes' },
    { id: 'job_changed', label: 'Changes' },
    { id: 'urgent', label: 'Urgent' },
  ]

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.read
    if (filter === 'urgent') {
      const days = daysUntilInstall(n.installDate)
      return days !== null && days <= 14 && !n.read
    }
    return n.type === filter
  })

  const handleSnooze = (notifId) => {
    if (snoozeDate) {
      const today = isoDate(new Date().toISOString())
      if (snoozeDate <= today) return // Can't snooze to past/today
      onSnooze(notifId, snoozeDate)
      setSnoozeTarget(null)
      setSnoozeDate('')
    }
  }

  return (
    <>
      <div className={`notif-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`notif-panel${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="notif-panel-header">
          <h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            Notifications
            {notifications.filter(n => !n.read).length > 0 && (
              <span className="notif-count">{notifications.filter(n => !n.read).length} new</span>
            )}
          </h2>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={onMarkAllRead} style={{color:'var(--bp-sand)',border:'1px solid rgba(255,255,255,.15)'}}>
              Mark All Read
            </button>
            <button onClick={onClose} className="drawer-close" aria-label="Close notifications">×</button>
          </div>
        </div>

        <div className="notif-panel-actions">
          {filters.map(f => (
            <button key={f.id} className={`notif-filter${filter === f.id ? ' active' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="notif-list">
          {filtered.length === 0 ? (
            <div className="empty-state" style={{padding:'40px 20px'}}>
              <div className="empty-state-icon">🔔</div>
              <div className="empty-state-title">All caught up</div>
              <div className="empty-state-sub">No {filter === 'all' ? '' : (filters.find(f => f.id === filter)?.label || '') + ' '}notifications to show</div>
            </div>
          ) : filtered.map((n, i) => {
            const typeInfo = NOTIF_TYPES[n.type] || NOTIF_TYPES.job_changed
            const days = daysUntilInstall(n.installDate)
            const urgencyClass = days !== null && days <= 7 ? 'red' : days !== null && days <= 14 ? 'amber' : ''
            return (
              <div key={n.id || i} className={`notif-item${!n.read ? ' unread' : ''}`} style={{animationDelay: `${i * 30}ms`}}
                onClick={() => { onMarkRead(n.id); onNavigateToJob && onNavigateToJob(n.jobId) }}>
                <div className={`notif-icon ${typeInfo.iconClass}`}>{typeInfo.icon}</div>
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-desc">{n.description}</div>
                  <div className="notif-meta">
                    <span>{timeAgo(n.timestamp)}</span>
                    {n.author && <span>by {n.author}</span>}
                    {n.installDate && (
                      <span className="install-date" style={{color: urgencyClass === 'red' ? 'var(--bp-red)' : urgencyClass === 'amber' ? 'var(--bp-amber)' : ''}}>
                        Install: {formatInstallDate(n.installDate)}
                        {days !== null && days >= 0 && <> ({days}d away)</>}
                      </span>
                    )}
                  </div>
                  <div className="notif-actions" onClick={e => e.stopPropagation()}>
                    {snoozeTarget === n.id ? (
                      <div className="flex gap-4">
                        <input type="date" className="form-input" style={{padding:'2px 6px',fontSize:'11.5px',width:'140px'}}
                          value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)} />
                        <button className="notif-snooze" onClick={() => handleSnooze(n.id)}>Set</button>
                        <button className="notif-dismiss" onClick={() => setSnoozeTarget(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <button className="notif-snooze" onClick={() => { setSnoozeTarget(snoozeTarget === n.id ? null : n.id); setSnoozeDate('') }}>⏰ Snooze</button>
                        <button className="notif-dismiss" onClick={() => onMarkRead(n.id)}>Dismiss</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
