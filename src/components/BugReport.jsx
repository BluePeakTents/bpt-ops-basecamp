import { useState, useEffect } from 'react'
import { dvPost } from '../hooks/useDataverse'

export default function BugReport({ open, onClose, currentPage }) {
  const [type, setType] = useState('bug')
  const [page, setPage] = useState(currentPage || 'dashboard')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Sync page when the modal opens on a different tab
  useEffect(() => {
    if (open && currentPage) setPage(currentPage)
  }, [open, currentPage])

  const pages = ['Dashboard', 'Scheduling', 'Inventory', 'Fleet', 'Ops Admin', 'Ask Ops', 'Other']

  async function handleSubmit() {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      await dvPost('cr55d_bugreports', {
        cr55d_type: type,
        cr55d_page: page,
        cr55d_description: description,
        cr55d_appsource: 'Ops Base Camp',
        cr55d_status: 'open',
      })
      setSubmitted(true)
      setTimeout(() => { onClose(); setSubmitted(false); setDescription(''); setType('bug') }, 1500)
    } catch (e) {
      console.error('[BugReport] Submit failed:', e)
      alert('Failed to submit report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal bug-report-modal" onClick={e => e.stopPropagation()} style={{maxWidth:'480px'}}>
        {submitted ? (
          <div className="empty-state" style={{padding:'24px'}}>
            <div className="empty-state-icon" style={{background:'var(--bp-green-bg)',fontSize:'28px'}}>✅</div>
            <div className="empty-state-title">Report Submitted</div>
            <div className="empty-state-sub">Thanks! Your report has been added to the shared bug board.</div>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <h3>🐛 Report a Bug</h3>
              <button className="modal-close" onClick={onClose}>×</button>
            </div>

            <div className="form-group">
              <label className="form-label">Type</label>
              <div className="flex gap-6">
                <button className={`pill${type === 'bug' ? ' active' : ''}`} onClick={() => setType('bug')}>🐛 Bug</button>
                <button className={`pill${type === 'feature' ? ' active' : ''}`} onClick={() => setType('feature')}>💡 Feature Request</button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Page</label>
              <select className="form-select" value={page} onChange={e => setPage(e.target.value)}>
                {pages.map(p => <option key={p} value={p.toLowerCase()}>{p}</option>)}
              </select>
              <div className="form-hint">Auto-detected: {currentPage || 'Dashboard'}</div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" rows={4} placeholder={type === 'bug' ? 'What happened? What did you expect instead?' : 'Describe the feature you\'d like to see...'}
                value={description} onChange={e => setDescription(e.target.value)} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!description.trim() || submitting} onClick={handleSubmit}>
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
