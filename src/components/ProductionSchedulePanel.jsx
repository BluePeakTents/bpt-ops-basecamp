import { useState, useEffect, useRef, useCallback } from 'react'
import { dvFetch, dvPatch, dvPost } from '../hooks/useDataverse'
import { isoDate, formatDate as sharedFormatDate } from '../utils/dateUtils'

const SIGNOFF_LABELS = { 306280000: 'pending', 306280001: 'signed', 306280002: 'changes' }
const COMMENT_TYPES = { 306280000: 'Sales Note', 306280001: 'Production Note', 306280002: 'Question', 306280003: 'Flag' }
const COMMENT_COLORS = { 306280000: 'var(--bp-blue)', 306280001: 'var(--bp-green)', 306280002: 'var(--bp-purple)', 306280003: '#B45309' }

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago'
  if (diff < 86400) return Math.floor(diff / 3600) + ' hr ago'
  return Math.floor(diff / 86400) + ' day' + (Math.floor(diff / 86400) !== 1 ? 's' : '') + ' ago'
}

export default function ProductionSchedulePanel({ job, activeTab }) {
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentType, setCommentType] = useState('306280001') // Production Note default for ops
  const [posting, setPosting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef(null)
  const iframeUrl = useRef(null)

  const jobId = job?.cr55d_jobid

  const loadSchedule = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    try {
      const data = await dvFetch(`/cr55d_productionschedules?$filter=_cr55d_job_value eq ${jobId}&$orderby=cr55d_generateddate desc&$top=1&$select=cr55d_productionscheduleid,cr55d_schedulename,cr55d_versionnumber,cr55d_generateddate,cr55d_pdfhtml,cr55d_signoffstatus,cr55d_signedoffby,cr55d_signedoffon,cr55d_opssignoffstatus,cr55d_opssignedoffby,cr55d_opssignedoffon,cr55d_lastchangedon,cr55d_lastchangereason`)
      const sched = data?.value?.[0] || null
      setSchedule(sched)
      if (sched?.cr55d_productionscheduleid) loadComments(sched.cr55d_productionscheduleid)
    } catch (e) {
      console.warn('[ProdSched] Load failed:', e.message)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    if (activeTab === 'production') loadSchedule()
  }, [activeTab, jobId, loadSchedule])

  const loadComments = async (schedId) => {
    try {
      const data = await dvFetch(`/cr55d_schedulecomments?$filter=_cr55d_productionschedule_value eq ${schedId}&$orderby=createdon desc&$top=50&$select=cr55d_schedulecommentid,cr55d_commenttext,cr55d_author,cr55d_commenttype,createdon`)
      setComments(data?.value || [])
    } catch (_) {}
  }

  const addComment = async () => {
    if (!commentText.trim() || !schedule?.cr55d_productionscheduleid) return
    setPosting(true)
    try {
      const resp = await dvPost('/cr55d_schedulecomments', {
        cr55d_name: commentText.substring(0, 100),
        cr55d_commenttext: commentText,
        cr55d_author: localStorage.getItem('bpt_reporter_name') || 'Ops Base Camp',
        cr55d_commenttype: parseInt(commentType),
        'cr55d_productionschedule@odata.bind': `/cr55d_productionschedules(${schedule.cr55d_productionscheduleid})`
      })
      setCommentText('')
      loadComments(schedule.cr55d_productionscheduleid)
    } catch (e) {
      console.error('Comment failed:', e.message)
    } finally {
      setPosting(false)
    }
  }

  const openEditor = () => {
    if (!schedule?.cr55d_pdfhtml) return
    setEditorOpen(true)
  }

  const saveEditor = async () => {
    if (!editorRef.current || !schedule?.cr55d_productionscheduleid) return
    setSaving(true)
    try {
      const editedBody = editorRef.current.innerHTML.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      const styleMatch = schedule.cr55d_pdfhtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
      const styleTag = styleMatch ? `<style>${styleMatch[1]}</style>` : ''
      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${schedule.cr55d_schedulename || 'Production Schedule'}</title>${styleTag}</head><body>${editedBody}</body></html>`

      await dvPatch(`/cr55d_productionschedules(${schedule.cr55d_productionscheduleid})`, { cr55d_pdfhtml: fullHtml })
      setEditorOpen(false)
      loadSchedule()
    } catch (e) {
      console.error('Save failed:', e.message)
    } finally {
      setSaving(false)
    }
  }

  // Build iframe blob URL when schedule changes
  let pdfBlobUrl = null
  if (schedule?.cr55d_pdfhtml) {
    const blob = new Blob([schedule.cr55d_pdfhtml], { type: 'text/html' })
    pdfBlobUrl = URL.createObjectURL(blob)
  }

  const salesKey = SIGNOFF_LABELS[schedule?.cr55d_signoffstatus] || 'pending'
  const opsKey = SIGNOFF_LABELS[schedule?.cr55d_opssignoffstatus] || 'pending'
  const installDate = isoDate(job?.cr55d_installdate) || isoDate(job?.cr55d_eventdate) || ''

  const opsSignOff = async () => {
    if (!schedule?.cr55d_productionscheduleid) return
    try {
      await dvPatch(`/cr55d_productionschedules(${schedule.cr55d_productionscheduleid})`, {
        cr55d_opssignoffstatus: 306280001,
        cr55d_opssignedoffby: localStorage.getItem('bpt_reporter_name') || 'Ops',
        cr55d_opssignedoffon: new Date().toISOString()
      })
      loadSchedule()
    } catch (e) { console.error('Ops sign-off failed:', e.message) }
  }

  const opsRequestChanges = async () => {
    if (!schedule?.cr55d_productionscheduleid) return
    try {
      await dvPatch(`/cr55d_productionschedules(${schedule.cr55d_productionscheduleid})`, { cr55d_opssignoffstatus: 306280002 })
      loadSchedule()
    } catch (e) { console.error('Ops request changes failed:', e.message) }
  }

  let deadlineStr = ''
  let overdue = false
  if (installDate && (salesKey !== 'signed' || opsKey !== 'signed')) {
    const dl = new Date(installDate + 'T12:00:00')
    dl.setDate(dl.getDate() - 14)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    overdue = today >= dl
    deadlineStr = sharedFormatDate(dl.toISOString().split('T')[0])
  }

  if (activeTab !== 'production') return null

  return (
    <div className={`drawer-panel active`}>
      {loading && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--bp-muted)', fontSize: '13px' }}>Loading schedule...</div>}

      {!loading && !schedule && (
        <div className="empty-state">
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-title">No Production Schedule Yet</div>
          <div className="empty-state-sub">Schedule will appear here once generated from Sales Hub</div>
        </div>
      )}

      {!loading && schedule && (
        <>
          {/* Dual sign-off banner */}
          {(() => {
            const bothSigned = salesKey === 'signed' && opsKey === 'signed'
            const anyChanges = salesKey === 'changes' || opsKey === 'changes'
            const bg = bothSigned ? 'var(--bp-green-bg)' : anyChanges ? '#fffbeb' : '#eff6ff'
            const border = bothSigned ? 'rgba(46,125,82,.2)' : anyChanges ? 'rgba(180,83,9,.2)' : 'rgba(37,99,235,.15)'
            const SignoffRow = ({ label, status, by, on, canAct }) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: status === 'signed' ? 'var(--bp-green)' : status === 'changes' ? '#B45309' : '#2563EB', fontSize: '13px' }}>{status === 'signed' ? '✓' : status === 'changes' ? '⚠' : '◉'}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: status === 'signed' ? 'var(--bp-green)' : status === 'changes' ? '#B45309' : '#2563EB' }}>{label} {status === 'signed' ? 'Signed Off' : status === 'changes' ? '— Changes Requested' : '— Pending'}</span>
                  {status === 'signed' && <span style={{ fontSize: '10px', color: 'var(--bp-muted)' }}>by {by || ''} · {on ? sharedFormatDate(on.split('T')[0]) : ''}</span>}
                </div>
                {canAct && status !== 'signed' && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {status !== 'changes' && <button className="btn btn-sm" onClick={opsRequestChanges} style={{ background: '#fffbeb', color: '#B45309', fontSize: '10px', padding: '3px 8px', border: '1px solid rgba(180,83,9,.2)', borderRadius: '5px' }}>Request Changes</button>}
                    <button className="btn btn-sm" onClick={opsSignOff} style={{ background: 'var(--bp-green)', color: '#fff', fontSize: '10px', padding: '3px 10px', border: 'none', borderRadius: '5px' }}>Sign Off</button>
                  </div>
                )}
              </div>
            )
            return (
              <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <SignoffRow label="Sales" status={salesKey} by={schedule.cr55d_signedoffby} on={schedule.cr55d_signedoffon} canAct={false} />
                <SignoffRow label="Ops" status={opsKey} by={schedule.cr55d_opssignedoffby} on={schedule.cr55d_opssignedoffon} canAct={true} />
                {deadlineStr && <div><span style={{ fontSize: '10px', fontWeight: 600, color: overdue ? 'var(--bp-red)' : 'var(--bp-muted)' }}>{overdue ? 'OVERDUE — was due ' : 'Due by '}{deadlineStr}</span></div>}
              </div>
            )
          })()}

          {/* Timeline banner */}
          {schedule.cr55d_lastchangedon && (
            <div style={{ background: '#fffbeb', border: '1px solid rgba(180,83,9,.12)', borderRadius: '6px', padding: '7px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px' }}>↻</span>
              <span style={{ fontSize: '11px', color: '#B45309', fontWeight: 600 }}>Updated {timeAgo(schedule.cr55d_lastchangedon)}</span>
              <span style={{ fontSize: '11px', color: 'var(--bp-text)' }}>{schedule.cr55d_lastchangereason || ''}</span>
            </div>
          )}

          {/* Header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--bp-navy)' }}>{schedule.cr55d_schedulename || 'Production Schedule'}</div>
              <div style={{ fontSize: '11px', color: 'var(--bp-muted)' }}>v{schedule.cr55d_versionnumber || 1} · {schedule.cr55d_generateddate ? sharedFormatDate(schedule.cr55d_generateddate.split('T')[0]) : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-sm" onClick={openEditor} style={{ background: 'var(--bp-navy)', color: '#fff', fontSize: '11px', padding: '4px 12px', border: 'none', borderRadius: '6px' }}>Edit</button>
              <button className="btn btn-primary btn-sm" onClick={() => { const w = window.open(pdfBlobUrl, '_blank'); if (w) setTimeout(() => w.print(), 500) }} style={{ fontSize: '11px' }}>Download PDF</button>
            </div>
          </div>

          {/* PDF iframe */}
          {pdfBlobUrl && <iframe src={pdfBlobUrl} style={{ width: '100%', height: '380px', border: '1px solid var(--bp-border)', borderRadius: '8px' }} />}

          {/* Comments */}
          <div style={{ marginTop: '12px', borderTop: '1px solid var(--bp-border)', paddingTop: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--bp-muted)', marginBottom: '6px' }}>Comments</div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '8px' }}>
              {comments.length === 0 ? (
                <div style={{ color: 'var(--bp-light)', fontSize: '11px', padding: '8px', textAlign: 'center' }}>No comments yet</div>
              ) : comments.map(c => (
                <div key={c.cr55d_schedulecommentid} style={{ padding: '8px 10px', border: '1px solid var(--bp-border)', borderRadius: '6px', marginBottom: '6px', borderLeft: `3px solid ${COMMENT_COLORS[c.cr55d_commenttype] || 'var(--bp-muted)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: COMMENT_COLORS[c.cr55d_commenttype] || 'var(--bp-muted)' }}>{COMMENT_TYPES[c.cr55d_commenttype] || 'Note'}</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--bp-navy)' }}>{c.cr55d_author || ''}</span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--bp-light)' }}>{timeAgo(c.createdon)}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--bp-text)', lineHeight: 1.5 }}>{c.cr55d_commenttext}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select value={commentType} onChange={e => setCommentType(e.target.value)} style={{ fontSize: '11px', padding: '4px 8px', border: '1px solid var(--bp-border)', borderRadius: '6px', background: 'var(--bp-white)', fontFamily: 'inherit' }}>
                <option value="306280001">Production Note</option>
                <option value="306280003">Flag</option>
                <option value="306280002">Question</option>
              </select>
              <input value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment() }} placeholder="Add a comment..." style={{ flex: 1, fontSize: '12px', padding: '6px 10px', border: '1px solid var(--bp-border)', borderRadius: '6px', fontFamily: 'inherit' }} />
              <button className="btn btn-sm" onClick={addComment} disabled={posting} style={{ background: 'var(--bp-navy)', color: '#fff', fontSize: '11px', padding: '4px 12px', border: 'none', borderRadius: '6px' }}>{posting ? '...' : 'Post'}</button>
            </div>
          </div>

          {/* Full-screen editor modal */}
          {editorOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) setEditorOpen(false) }}>
              <div style={{ background: 'var(--bp-white)', borderRadius: '12px', width: '100%', maxWidth: '900px', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 48px rgba(0,0,0,.2)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--bp-border)', background: 'var(--bp-navy)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: 'var(--bp-ivory)', fontSize: '14px', fontWeight: 600 }}>Edit Production Schedule</span>
                    <span style={{ color: 'var(--bp-blue)', fontSize: '11px' }}>Click any text to edit</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={saveEditor} disabled={saving} style={{ background: 'var(--bp-green)', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving...' : 'Save Changes'}</button>
                    <button onClick={() => setEditorOpen(false)} style={{ background: 'transparent', color: 'var(--bp-ivory)', border: '1px solid rgba(255,255,255,.2)', borderRadius: '6px', padding: '6px 16px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onKeyDown={e => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEditor() } if (e.key === 'Escape') setEditorOpen(false) }}
                  style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', outline: 'none', fontFamily: "'Century Gothic','Segoe UI',Helvetica,sans-serif", fontSize: '11px', lineHeight: 1.5, color: '#1A1A1A' }}
                  dangerouslySetInnerHTML={{ __html: (() => {
                    const bodyMatch = schedule.cr55d_pdfhtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
                    const styleMatch = schedule.cr55d_pdfhtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
                    const body = bodyMatch ? bodyMatch[1] : schedule.cr55d_pdfhtml
                    const style = styleMatch ? `<style>${styleMatch[1].replace(/body\b/g, '.ps-editor-scope').replace(/@page[^}]+}/g, '').replace(/@media print[^}]+\{[^}]*\}/g, '')}</style>` : ''
                    return style + body
                  })() }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
