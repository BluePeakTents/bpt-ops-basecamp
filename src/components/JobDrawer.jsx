import { useState, useEffect, useRef, useCallback } from 'react'
import { dvFetch, dvPatch, dvPost, dvDelete } from '../hooks/useDataverse'
import { pickAndUploadFile } from '../utils/fileUpload'
import { isoDate, formatDate as sharedFormatDate, daysUntil as sharedDaysUntil, daysBetween } from '../utils/dateUtils'
import { STATUS_LABELS, STATUS_BADGE, EVENT_TYPES, optionSet } from '../constants/dataverseFields'
import { LEADERS } from '../data/crewConstants'

const DEFAULT_PMS = [
  'Cristhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

const DRAWER_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'notes', label: 'Notes' },
  { id: 'production', label: 'Production Plan' },
  { id: 'loadlist', label: 'Load List' },
  { id: 'crew', label: 'Crew' },
  { id: 'schedule', label: 'Schedule Days' },
  { id: 'trucks', label: 'Trucks' },
  { id: 'photos', label: 'Site Photos' },
  { id: 'julie', label: 'JULIE' },
  { id: 'permit', label: 'Permit' },
  { id: 'docs', label: 'Docs' },
]

function fmtCurrency(n) {
  if (!n) return '$0'
  return '$' + Math.round(n).toLocaleString()
}

export default function JobDrawer({ job, open, onClose, onJobUpdated, pmList, leaders }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [uploadToast, setUploadToast] = useState(null)
  const [notes, setNotes] = useState([])
  const [julieTickets, setJulieTickets] = useState([])
  const [permits, setPermits] = useState([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editToast, setEditToast] = useState(null)
  const [jobScheduleDays, setJobScheduleDays] = useState([]) // existing records
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [invoiceData, setInvoiceData] = useState(null)
  const [loadingInvoice, setLoadingInvoice] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  const prevJobIdRef = useRef(null)
  useEffect(() => {
    if (job && open) {
      const jobId = job.cr55d_jobid
      // Only reset and reload if this is a different job
      if (jobId !== prevJobIdRef.current) {
        prevJobIdRef.current = jobId
        setActiveTab('overview')
        setNotes([])
        setJulieTickets([])
        setPermits([])
        setJobScheduleDays([])
        setInvoiceData(null)
        loadJobDetails(jobId)
        loadJobScheduleDays(jobId)
        loadInvoice(jobId)
      }
    }
    if (!open) prevJobIdRef.current = null
  }, [job?.cr55d_jobid, open])

  async function loadJobDetails(jobId) {
    if (!jobId) return
    // Sanitize jobId for OData query (strip anything that isn't a GUID character)
    const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
    setLoadingNotes(true)
    try {
      const [notesData, julieData, permitData] = await Promise.all([
        dvFetch(`cr55d_jobnotes?$filter=_cr55d_jobid_value eq '${safeId}'&$orderby=createdon desc&$top=20`).catch(() => []),
        dvFetch(`cr55d_julietickets?$filter=_cr55d_jobid_value eq '${safeId}'&$top=5`).catch(() => []),
        dvFetch(`cr55d_permits?$filter=_cr55d_jobid_value eq '${safeId}'&$top=5`).catch(() => []),
      ])
      setNotes(Array.isArray(notesData) ? notesData : [])
      setJulieTickets(Array.isArray(julieData) ? julieData : [])
      setPermits(Array.isArray(permitData) ? permitData : [])
    } catch (e) {
      console.error('[JobDrawer] Failed to load details:', e)
    } finally {
      setLoadingNotes(false)
    }
  }

  async function loadInvoice(jobId) {
    if (!jobId) return
    setLoadingInvoice(true)
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      const qvs = await dvFetch(`cr55d_quoteversions?$filter=_cr55d_job_value eq '${safeId}'&$select=cr55d_quoteversionid,cr55d_estimatenumber,cr55d_estimatedtotal,cr55d_lineitems,cr55d_jsondata,cr55d_salesrep,cr55d_status,cr55d_versionletter&$orderby=cr55d_versionnumber desc&$top=1`).catch(() => [])
      const qv = Array.isArray(qvs) && qvs.length > 0 ? qvs[0] : null
      if (!qv) { setInvoiceData(null); return }
      // Parse line items
      let lineItems = []
      try {
        if (qv.cr55d_lineitems) {
          const data = JSON.parse(qv.cr55d_lineitems)
          if (data.sections) {
            for (const [section, items] of Object.entries(data.sections)) {
              if (Array.isArray(items)) items.forEach(it => lineItems.push({ ...it, section }))
            }
          }
        } else if (qv.cr55d_jsondata) {
          const data = JSON.parse(qv.cr55d_jsondata)
          if (data.lineItems) lineItems = data.lineItems.map(it => ({ name: it.desc || it.name, qty: it.qty, unitPrice: it.price || it.unitPrice, section: it.section || 'Products' }))
        }
      } catch {}
      setInvoiceData({ ...qv, lineItems })
    } catch (e) {
      console.error('[JobDrawer] Failed to load invoice:', e)
    } finally {
      setLoadingInvoice(false)
    }
  }

  async function downloadInvoicePdf() {
    if (!invoiceData) return
    setDownloadingPdf(true)
    try {
      // Build minimal PDF payload
      const groups = []
      const bySection = {}
      invoiceData.lineItems.forEach(it => {
        const sec = it.section || 'Products'
        if (!bySection[sec]) bySection[sec] = []
        bySection[sec].push({ name: it.name || it.desc || '', qty: it.qty || 1, unit_price: it.unitPrice || it.price || 0, total: (it.qty || 1) * (it.unitPrice || it.price || 0) })
      })
      Object.entries(bySection).forEach(([section, items]) => {
        groups.push({ section, items: items.map(i => ({ description: i.name, quantity: i.qty, unit_price: i.unit_price, total: i.total })) })
      })
      const resp = await fetch('https://bpt-pdf-service.azurewebsites.net/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: 'invoice',
          estimate_number: invoiceData.cr55d_estimatenumber || '',
          customer_name: job.cr55d_clientname || job.cr55d_jobname || '',
          event_name: job.cr55d_jobname || '',
          sales_rep: invoiceData.cr55d_salesrep || job.cr55d_salesrep || '',
          groups,
          subtotal: invoiceData.cr55d_estimatedtotal || 0,
          grand_total: invoiceData.cr55d_estimatedtotal || 0,
        })
      })
      if (!resp.ok) throw new Error('PDF generation failed: ' + resp.status)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (invoiceData.cr55d_estimatenumber || 'invoice') + '.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[JobDrawer] PDF download failed:', e)
      alert('Failed to download PDF: ' + e.message)
    } finally {
      setDownloadingPdf(false)
    }
  }

  function startEdit() {
    setEditForm({
      crewcount: job.cr55d_crewcount || '',
      trucksneeded: job.cr55d_trucksneeded || '',
      pmassigned: job.cr55d_pmassigned || '',
      crewleader: job.cr55d_crewleader || '',
      installdate: isoDate(job.cr55d_installdate) || '',
      strikedate: isoDate(job.cr55d_strikedate) || '',
      eventdate: isoDate(job.cr55d_eventdate) || '',
    })
    setEditing(true)
  }

  function cancelEdit() { setEditing(false); setEditForm({}) }

  async function saveEdit() {
    setSaving(true)
    try {
      const safeId = String(job.cr55d_jobid).replace(/[^a-f0-9-]/gi, '')
      const body = {}
      if (editForm.crewcount !== (job.cr55d_crewcount || '')) body.cr55d_crewcount = editForm.crewcount ? (parseInt(editForm.crewcount, 10) || null) : null
      if (editForm.trucksneeded !== (job.cr55d_trucksneeded || '')) body.cr55d_trucksneeded = editForm.trucksneeded ? (parseInt(editForm.trucksneeded, 10) || null) : null
      if (editForm.pmassigned !== (job.cr55d_pmassigned || '')) body.cr55d_pmassigned = editForm.pmassigned
      if (editForm.crewleader !== (job.cr55d_crewleader || '')) body.cr55d_crewleader = editForm.crewleader
      if ((editForm.installdate || '') !== (isoDate(job.cr55d_installdate) || '')) body.cr55d_installdate = editForm.installdate || null
      if ((editForm.strikedate || '') !== (isoDate(job.cr55d_strikedate) || '')) body.cr55d_strikedate = editForm.strikedate || null
      if ((editForm.eventdate || '') !== (isoDate(job.cr55d_eventdate) || '')) body.cr55d_eventdate = editForm.eventdate || null

      if (Object.keys(body).length === 0) { setEditing(false); return }

      await dvPatch(`cr55d_jobs(${safeId})`, body)

      // Log the change
      try {
        const changes = Object.entries(body).map(([k, v]) => `${k.replace('cr55d_', '')}: ${v}`).join(', ')
        await dvPost('cr55d_schedulingchanges', {
          cr55d_changetype: 'edit_job',
          cr55d_author: 'Ops Base Camp',
          cr55d_jobname: job.cr55d_clientname || job.cr55d_jobname || '',
          cr55d_description: `Edited ${job.cr55d_clientname || job.cr55d_jobname}: ${changes}`,
        })
      } catch (e) { console.error('[Audit] Log failed:', e) }

      setEditing(false)
      setEditToast('Changes saved')
      setTimeout(() => setEditToast(null), 3000)
      if (onJobUpdated) onJobUpdated()
    } catch (e) {
      console.error('[JobDrawer] Save failed:', e)
      setEditToast('Save failed: ' + e.message)
      setTimeout(() => setEditToast(null), 4000)
    } finally { setSaving(false) }
  }

  function updateField(key, val) { setEditForm(prev => ({ ...prev, [key]: val })) }

  // Inline date save (no edit mode needed)
  async function saveDate(field, value) {
    if (!job) return
    const safeId = String(job.cr55d_jobid).replace(/[^a-f0-9-]/gi, '')
    try {
      await dvPatch(`cr55d_jobs(${safeId})`, { [field]: value || null })
      setEditToast('Date updated')
      setTimeout(() => setEditToast(null), 2500)
      if (onJobUpdated) onJobUpdated()
    } catch (e) {
      setEditToast('Save failed: ' + e.message)
      setTimeout(() => setEditToast(null), 4000)
    }
  }

  async function addNote() {
    if (!newNote.trim() || !job) return
    setSavingNote(true)
    try {
      const safeId = String(job.cr55d_jobid).replace(/[^a-f0-9-]/gi, '')
      await dvPost('cr55d_jobnotes', {
        'cr55d_job@odata.bind': `/cr55d_jobs(${safeId})`,
        cr55d_title: 'Ops Note',
        cr55d_details: newNote.trim(),
        cr55d_submittedby: 'Ops Base Camp',
        cr55d_notetype: 306280000,
      })
      setNewNote('')
      await loadJobDetails(job.cr55d_jobid)
    } catch (e) {
      setEditToast('Note failed: ' + e.message)
      setTimeout(() => setEditToast(null), 4000)
    } finally { setSavingNote(false) }
  }

  async function loadJobScheduleDays(jobId) {
    if (!jobId) return
    setLoadingSchedule(true)
    try {
      const safeId = String(jobId).replace(/[^a-f0-9-]/gi, '')
      const data = await dvFetch(`cr55d_jobscheduledays?$filter=_cr55d_jobid_value eq '${safeId}'&$orderby=cr55d_scheduledate asc&$top=100`)
      setJobScheduleDays(Array.isArray(data) ? data : [])
    } catch (e) { setJobScheduleDays([]) }
    finally { setLoadingSchedule(false) }
  }

  async function toggleScheduleDay(dateStr) {
    if (!job) return
    const existing = jobScheduleDays.find(d => d.cr55d_scheduledate && d.cr55d_scheduledate.split('T')[0] === dateStr)
    if (existing) {
      // Remove this day
      try {
        await dvDelete(`cr55d_jobscheduledays(${existing.cr55d_jobscheduledayid})`)
        await loadJobScheduleDays(job.cr55d_jobid)
        if (onJobUpdated) onJobUpdated()
      } catch (e) { console.error('[Schedule] Delete failed:', e) }
    } else {
      // Add this day
      try {
        await dvPost('cr55d_jobscheduledays', {
          'cr55d_JobRef@odata.bind': `/cr55d_jobs(${String(job.cr55d_jobid).replace(/[^a-f0-9-]/gi, '')})`,
          cr55d_name: `${job.cr55d_clientname || job.cr55d_jobname} — ${dateStr}`,
          cr55d_scheduledate: dateStr,
          cr55d_daytype: 'Install',
          cr55d_pmassigned: job.cr55d_pmassigned || '',
        })
        await loadJobScheduleDays(job.cr55d_jobid)
        if (onJobUpdated) onJobUpdated()
      } catch (e) { console.error('[Schedule] Create failed:', e) }
    }
  }

  // Generate all dates between install and strike
  function getDateRange() {
    if (!job?.cr55d_installdate) return []
    const start = isoDate(job.cr55d_installdate)
    const end = isoDate(job.cr55d_strikedate) || start
    if (!start) return []
    const dates = []
    const cursor = new Date(start + 'T12:00:00')
    const endDate = new Date(end + 'T12:00:00')
    while (cursor <= endDate) {
      const y = cursor.getFullYear(), m = String(cursor.getMonth() + 1).padStart(2, '0'), d = String(cursor.getDate()).padStart(2, '0')
      dates.push(`${y}-${m}-${d}`)
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  }

  if (!job) return null

  const installDays = sharedDaysUntil(isoDate(job.cr55d_installdate))

  // Completeness checks
  const checks = [
    { label: 'PM Assigned', done: !!job.cr55d_pmassigned },
    { label: 'Crew Planned', done: !!job.cr55d_crewplanned },
    { label: 'Trucks Assigned', done: !!job.cr55d_trucksassigned },
    { label: 'JULIE Complete', done: julieTickets.some(t => t.cr55d_status === 'completed' || t.cr55d_julieticketstatusid === 408420002) },
    { label: 'Permit Approved', done: permits.some(p => p.cr55d_status === 'approved' || p.cr55d_permitstatusid === 408420003) },
    { label: 'Load List Ready', done: !!job.cr55d_loadlistready },
  ]
  const completionPct = Math.round((checks.filter(c => c.done).length / checks.length) * 100)

  return (
    <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Job details" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-header-top">
            <div>
              <h2>{job.cr55d_jobname || 'Untitled Job'}</h2>
              <div className="drawer-sub">{job.cr55d_clientname}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              {!editing ? (
                <button className="btn btn-outline btn-sm" onClick={startEdit}>Edit</button>
              ) : (
                <>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Cancel</button>
                </>
              )}
              <button className="drawer-close" onClick={onClose} aria-label="Close job details">✕</button>
            </div>
          </div>
          <div className="drawer-header-meta">
            <span><span className={`badge ${STATUS_BADGE[optionSet(job.cr55d_jobstatus)] || 'badge-navy'}`}>{STATUS_LABELS[optionSet(job.cr55d_jobstatus)] || 'Draft'}</span></span>
            {job.cr55d_eventtype && <span>{EVENT_TYPES[optionSet(job.cr55d_eventtype)] || ''}</span>}
            {job.cr55d_quotedamount && <span className="font-mono font-bold">{fmtCurrency(job.cr55d_quotedamount)}</span>}
            {installDays !== null && (
              <span style={{color: installDays <= 7 ? 'var(--bp-red)' : installDays <= 14 ? 'var(--bp-amber)' : 'inherit', fontWeight: installDays <= 14 ? 700 : 400}}>
                {installDays < 0 ? `${Math.abs(installDays)}d ago` : installDays === 0 ? 'TODAY' : `${installDays}d until install`}
              </span>
            )}
          </div>
        </div>

        {/* Completeness bar */}
        <div style={{padding:'12px 24px 14px',background:'var(--bp-alt)',borderBottom:'1px solid var(--bp-border)'}}>
          <div className="flex-between" style={{marginBottom:'6px'}}>
            <span className="form-label" style={{marginBottom:0}}>Job Readiness</span>
            <span className="text-base font-mono font-bold" style={{color: completionPct === 100 ? 'var(--bp-green)' : completionPct >= 50 ? 'var(--bp-amber)' : 'var(--bp-red)'}}>{completionPct}%</span>
          </div>
          <div className="progress-bar" style={{height:'6px',marginBottom:'10px'}}>
            <div className={`progress-fill ${completionPct === 100 ? 'green' : completionPct >= 50 ? 'amber' : 'red'}`} style={{width:`${completionPct}%`}}></div>
          </div>
          <div className="completeness">
            {checks.map((c, i) => (
              <span key={i} className={`completeness-item ${c.done ? 'done' : 'missing'}`}>
                {c.done ? '✓' : '✗'} {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs" role="tablist">
          {DRAWER_TABS.map(t => (
            <button key={t.id} className={`drawer-tab${activeTab === t.id ? ' active' : ''}`} role="tab" aria-selected={t.id === activeTab} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="drawer-body">
          {/* Overview Tab */}
          <div className={`drawer-panel${activeTab === 'overview' ? ' active' : ''}`}>
            {/* Schedule — inline editable dates */}
            <div className="drawer-section">
              <div className="drawer-section-title">Schedule</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                {[
                  {label:'Install',field:'cr55d_installdate',color:'var(--bp-navy)'},
                  {label:'Event',field:'cr55d_eventdate',color:'var(--bp-green)'},
                  {label:'Strike',field:'cr55d_strikedate',color:'var(--bp-amber)'},
                ].map(d => (
                  <div key={d.field} style={{background:'var(--bp-alt)',borderRadius:'var(--bp-r-sm)',padding:'10px 12px',borderTop:`3px solid ${d.color}`}}>
                    <div className="text-sm font-bold" style={{color:d.color,marginBottom:'6px',textTransform:'uppercase',letterSpacing:'.04em'}}>{d.label}</div>
                    <input type="date" className="form-input" style={{width:'100%',padding:'4px 8px',fontSize:'12px',fontFamily:'var(--bp-mono)',border:'1px solid var(--bp-border-lt)',borderRadius:'4px',background:'var(--bp-white)'}}
                      defaultValue={isoDate(job[d.field]) || ''}
                      onBlur={e => {
                        const newVal = e.target.value
                        const oldVal = isoDate(job[d.field]) || ''
                        if (newVal !== oldVal) saveDate(d.field, newVal)
                      }}
                    />
                    <div className="text-sm color-muted" style={{marginTop:'4px'}}>{sharedFormatDate(isoDate(job[d.field])) || '—'}</div>
                  </div>
                ))}
              </div>
              {job.cr55d_installdate && job.cr55d_strikedate && (
                <div className="text-md color-muted" style={{textAlign:'right'}}>
                  {daysBetween(job.cr55d_installdate, job.cr55d_strikedate)} day span
                </div>
              )}
            </div>

            {/* Event Details */}
            <div className="drawer-section">
              <div className="drawer-section-title">Event Details</div>
              <div className="drawer-field"><span className="drawer-field-label">Venue</span><span className="drawer-field-value">{job.cr55d_venuename || '—'}</span></div>
              {job.cr55d_venueaddress && (
                <div className="drawer-field"><span className="drawer-field-label">Address</span><span className="drawer-field-value" style={{maxWidth:'360px',textAlign:'right',fontSize:'12px'}}>{job.cr55d_venueaddress}</span></div>
              )}
              <div className="drawer-field"><span className="drawer-field-label">Event Type</span><span className="drawer-field-value">{EVENT_TYPES[optionSet(job.cr55d_eventtype)] || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Sales Rep</span><span className="drawer-field-value">{job.cr55d_salesrep || '—'}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Amount</span><span className="drawer-field-value font-mono font-bold">{fmtCurrency(job.cr55d_quotedamount)}</span></div>
            </div>

            {/* Notes — with inline composer */}
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>Notes</span>
                <span className="text-sm color-muted">{notes.length}</span>
              </div>
              {/* Add note form */}
              <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
                <input type="text" className="form-input" style={{flex:1,padding:'8px 12px',fontSize:'12px'}} placeholder="Add a note..." value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) addNote() }}
                  disabled={savingNote}
                />
                <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!newNote.trim() || savingNote} style={{padding:'8px 14px',fontSize:'11px'}}>
                  {savingNote ? '...' : 'Add'}
                </button>
              </div>
              {loadingNotes ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : notes.length === 0 ? (
                <div className="text-base color-muted" style={{padding:'8px 0',fontStyle:'italic'}}>No notes yet — add one above</div>
              ) : notes.map((n, i) => (
                <div key={i} style={{padding:'10px 0',borderBottom: i < notes.length - 1 ? '1px solid var(--bp-border-lt)' : 'none'}}>
                  <div className="flex-between" style={{marginBottom:'3px'}}>
                    <span className="text-md font-semibold color-navy">{n.cr55d_title || 'Note'}</span>
                    <span className="text-sm color-light">{n.createdon ? new Date(n.createdon).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}</span>
                  </div>
                  <div className="text-base" style={{color:'var(--bp-text)',lineHeight:1.5}}>{n.cr55d_details || n.cr55d_content || ''}</div>
                  {n.cr55d_submittedby && <div className="text-sm color-light" style={{marginTop:'4px'}}>— {n.cr55d_submittedby}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Invoice Tab */}
          <div className={`drawer-panel${activeTab === 'invoice' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>Invoice / Estimate</span>
                {invoiceData && (
                  <button className="btn btn-primary btn-sm" onClick={downloadInvoicePdf} disabled={downloadingPdf} style={{fontSize:'11px',padding:'5px 14px',display:'flex',alignItems:'center',gap:'5px'}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {downloadingPdf ? 'Generating...' : 'Download PDF'}
                  </button>
                )}
              </div>
              {loadingInvoice ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : !invoiceData ? (
                <div className="empty-state" style={{padding:'30px'}}>
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-title">No Invoice Found</div>
                  <div className="empty-state-sub">No quote or invoice is linked to this job yet</div>
                </div>
              ) : (
                <>
                  {/* Invoice header */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'16px'}}>
                    <div style={{background:'var(--bp-alt)',borderRadius:'8px',padding:'12px'}}>
                      <div className="text-sm color-muted" style={{marginBottom:'2px'}}>Invoice #</div>
                      <div className="font-mono font-bold" style={{fontSize:'15px',color:'var(--bp-navy)'}}>{invoiceData.cr55d_estimatenumber || '—'}</div>
                    </div>
                    <div style={{background:'var(--bp-alt)',borderRadius:'8px',padding:'12px'}}>
                      <div className="text-sm color-muted" style={{marginBottom:'2px'}}>Total</div>
                      <div className="font-mono font-bold" style={{fontSize:'15px',color:'var(--bp-navy)'}}>{invoiceData.cr55d_estimatedtotal ? '$' + invoiceData.cr55d_estimatedtotal.toLocaleString('en-US',{minimumFractionDigits:2}) : '—'}</div>
                    </div>
                  </div>

                  {/* Line items table */}
                  {invoiceData.lineItems.length > 0 ? (
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                      <thead>
                        <tr style={{borderBottom:'2px solid var(--bp-border)'}}>
                          <th style={{textAlign:'left',padding:'8px 10px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-muted)'}}>Item</th>
                          <th style={{textAlign:'right',padding:'8px 10px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-muted)',width:'50px'}}>Qty</th>
                          <th style={{textAlign:'right',padding:'8px 10px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-muted)',width:'80px'}}>Unit $</th>
                          <th style={{textAlign:'right',padding:'8px 10px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--bp-muted)',width:'90px'}}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let currentSection = ''
                          return invoiceData.lineItems.map((li, idx) => {
                            const rows = []
                            if (li.section !== currentSection) {
                              currentSection = li.section
                              rows.push(
                                <tr key={'sec-'+idx} style={{background:'var(--bp-alt)'}}>
                                  <td colSpan={4} style={{padding:'6px 10px',fontWeight:700,fontSize:'11px',color:'var(--bp-navy)',textTransform:'uppercase',letterSpacing:'.04em'}}>{currentSection}</td>
                                </tr>
                              )
                            }
                            const qty = li.qty || 1
                            const price = li.unitPrice || li.price || 0
                            const total = qty * price
                            rows.push(
                              <tr key={idx} style={{borderBottom:'1px solid var(--bp-border-lt)'}}>
                                <td style={{padding:'6px 10px',color:'var(--bp-text)',lineHeight:1.4}}>{li.name || li.desc || '—'}</td>
                                <td style={{textAlign:'right',padding:'6px 10px',fontFamily:'var(--bp-mono)',color:'var(--bp-text)'}}>{qty}</td>
                                <td style={{textAlign:'right',padding:'6px 10px',fontFamily:'var(--bp-mono)',color:'var(--bp-text)'}}>${price.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                                <td style={{textAlign:'right',padding:'6px 10px',fontFamily:'var(--bp-mono)',fontWeight:600,color:'var(--bp-navy)'}}>${total.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                              </tr>
                            )
                            return rows
                          })
                        })()}
                      </tbody>
                      <tfoot>
                        <tr style={{borderTop:'2px solid var(--bp-navy)'}}>
                          <td colSpan={3} style={{padding:'10px',fontWeight:700,color:'var(--bp-navy)',fontSize:'13px'}}>Total</td>
                          <td style={{textAlign:'right',padding:'10px',fontFamily:'var(--bp-mono)',fontWeight:700,color:'var(--bp-navy)',fontSize:'14px'}}>${(invoiceData.cr55d_estimatedtotal || 0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <div className="text-base color-muted" style={{padding:'12px 0',fontStyle:'italic'}}>No line items available</div>
                  )}

                  {invoiceData.cr55d_salesrep && (
                    <div className="text-sm color-muted" style={{marginTop:'12px'}}>Sales Rep: {invoiceData.cr55d_salesrep}</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Notes Tab (read-only, dedicated view) */}
          <div className={`drawer-panel${activeTab === 'notes' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>Job Notes</span>
                <span className="text-sm color-muted">{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
              </div>
              {loadingNotes ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : notes.length === 0 ? (
                <div className="empty-state" style={{padding:'30px'}}>
                  <div className="empty-state-icon">📝</div>
                  <div className="empty-state-title">No Notes Yet</div>
                  <div className="empty-state-sub">Notes added in Sales Hub will appear here</div>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:'0'}}>
                  {notes.map((n, i) => (
                    <div key={n.cr55d_jobnoteid || i} style={{padding:'14px 16px',borderBottom:'1px solid var(--bp-border-lt)',background: i % 2 === 0 ? 'transparent' : 'var(--bp-alt)',borderRadius: i === 0 ? '8px 8px 0 0' : i === notes.length - 1 ? '0 0 8px 8px' : '0'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'4px'}}>
                        <span style={{fontWeight:600,fontSize:'13px',color:'var(--bp-navy)',lineHeight:1.3}}>{n.cr55d_title || 'Note'}</span>
                        <span className="text-sm color-light" style={{whiteSpace:'nowrap',marginLeft:'12px'}}>{n.createdon ? new Date(n.createdon).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''}</span>
                      </div>
                      {n.cr55d_details && (
                        <div style={{fontSize:'12.5px',color:'var(--bp-text)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{n.cr55d_details}</div>
                      )}
                      {n.cr55d_submittedby && (
                        <div className="text-sm" style={{marginTop:'6px',color:'var(--bp-light)',fontStyle:'italic'}}>— {n.cr55d_submittedby}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Production Plan Tab */}
          <div className={`drawer-panel${activeTab === 'production' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">Production Schedule</div>
              <div className="drawer-field"><span className="drawer-field-label">Install</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_installdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Event</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_eventdate))}</span></div>
              <div className="drawer-field"><span className="drawer-field-label">Strike</span><span className="drawer-field-value font-mono">{sharedFormatDate(isoDate(job.cr55d_strikedate))}</span></div>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No Production Schedule Yet</div>
              <div className="empty-state-sub">Generate one with the AI assistant</div>
              <button className="btn btn-primary btn-sm mt-12" onClick={() => { if (window.__bptSetTab) window.__bptSetTab('askops') }}>Build with Ask Ops →</button>
            </div>
          </div>

          {/* Load List Tab */}
          <div className={`drawer-panel${activeTab === 'loadlist' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>Load List</span>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  // Navigate to Ask Ops with load list context
                  if (window.__bptSetTab) window.__bptSetTab('askops')
                }}>Generate with AI</button>
              </div>
              <div className="callout callout-blue mb-12">
                <span className="callout-icon">💡</span>
                <div>Load lists are generated by AI from the BOM Master in Dataverse. Use Ask Ops → "Generate Load List" to create one.</div>
              </div>
            </div>
            <div className="empty-state" style={{padding:'20px'}}>
              <div className="empty-state-icon">📦</div>
              <div className="empty-state-title">No Load List</div>
              <div className="empty-state-sub">Generate a load list via Ask Ops to see warehouse pull items here</div>
            </div>
          </div>

          {/* Crew Tab */}
          <div className={`drawer-panel${activeTab === 'crew' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">Crew Assignment</div>
              {editing ? (
                <>
                  <div className="drawer-field">
                    <span className="drawer-field-label">PM Assigned</span>
                    <select className="form-select" style={{maxWidth:'180px'}} value={editForm.pmassigned} onChange={e => updateField('pmassigned', e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {(pmList || DEFAULT_PMS).map(pm => <option key={pm} value={pm}>{pm}</option>)}
                    </select>
                  </div>
                  <div className="drawer-field">
                    <span className="drawer-field-label">Crew Leader</span>
                    <select className="form-select" style={{maxWidth:'180px'}} value={editForm.crewleader} onChange={e => updateField('crewleader', e.target.value)}>
                      <option value="">— None —</option>
                      {(leaders || LEADERS).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="drawer-field">
                    <span className="drawer-field-label">Crew Size</span>
                    <input type="number" className="form-input" style={{maxWidth:'80px',textAlign:'right'}} min="0" value={editForm.crewcount} onChange={e => updateField('crewcount', e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="drawer-field"><span className="drawer-field-label">PM Assigned</span><span className="drawer-field-value">{job.cr55d_pmassigned || '—'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Crew Leader</span><span className="drawer-field-value">{job.cr55d_crewleader || '—'}</span></div>
                  <div className="drawer-field"><span className="drawer-field-label">Crew Size</span><span className="drawer-field-value">{job.cr55d_crewcount || '—'}</span></div>
                </>
              )}
            </div>
            {!editing && !job.cr55d_pmassigned && (
              <div className="empty-state" style={{padding:'20px'}}>
                <div className="empty-state-icon">👥</div>
                <div className="empty-state-title">Crew Not Yet Assigned</div>
                <div className="empty-state-sub">Assign a PM via the PM Capacity Calendar, then plan crew in the Scheduler</div>
              </div>
            )}
          </div>

          {/* Schedule Days Tab */}
          <div className={`drawer-panel${activeTab === 'schedule' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">Schedule Days</div>
              <p className="text-md color-muted mb-12">
                Click dates to toggle them on/off. When specific days are selected, the job only appears on those dates in the PM Capacity calendar (instead of the full install→strike range).
              </p>
              {loadingSchedule ? (
                <div className="loading-state"><div className="loading-spinner"></div></div>
              ) : (() => {
                const allDates = getDateRange()
                const activeDates = new Set(jobScheduleDays.map(d => d.cr55d_scheduledate?.split('T')[0]).filter(Boolean))
                const hasCustomSchedule = jobScheduleDays.length > 0
                const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                return allDates.length === 0 ? (
                  <div className="text-md color-muted">No install date set — can't create schedule.</div>
                ) : (
                  <>
                    <div className="text-sm mb-8" style={{color: hasCustomSchedule ? 'var(--bp-blue)' : 'var(--bp-muted)'}}>
                      {hasCustomSchedule ? `${activeDates.size} of ${allDates.length} days selected (custom schedule)` : `${allDates.length} days in range (continuous — click to customize)`}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>
                      {allDates.map(dateStr => {
                        const d = new Date(dateStr + 'T12:00:00')
                        const isActive = hasCustomSchedule ? activeDates.has(dateStr) : true
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6
                        return (
                          <button key={dateStr} onClick={() => toggleScheduleDay(dateStr)} style={{
                            width: '52px', padding: '4px 2px', borderRadius: '6px', border: '1px solid',
                            borderColor: isActive ? 'var(--bp-navy)' : 'var(--bp-border-lt)',
                            background: isActive ? 'rgba(29,58,107,.1)' : isWeekend ? 'rgba(213,167,42,.04)' : 'var(--bp-white)',
                            color: isActive ? 'var(--bp-navy)' : 'var(--bp-light)',
                            cursor: 'pointer', fontFamily: 'var(--bp-font)', textAlign: 'center',
                            fontSize: '10px', fontWeight: isActive ? 700 : 400, transition: 'all .15s',
                          }}>
                            <div style={{fontSize:'9px',color: isWeekend ? 'var(--bp-amber)' : 'inherit'}}>{DAY_NAMES[d.getDay()]}</div>
                            <div>{d.getDate()}</div>
                            <div style={{fontSize:'8px'}}>{d.toLocaleString('default',{month:'short'})}</div>
                          </button>
                        )
                      })}
                    </div>
                    {hasCustomSchedule && (
                      <button className="btn btn-ghost btn-sm mt-12" style={{color:'var(--bp-red)',fontSize:'11px'}} onClick={async () => {
                        for (const d of jobScheduleDays) {
                          await dvDelete(`cr55d_jobscheduledays(${d.cr55d_jobscheduledayid})`).catch(() => {})
                        }
                        setJobScheduleDays([])
                        if (onJobUpdated) onJobUpdated()
                      }}>Reset to continuous (remove all custom days)</button>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* Trucks Tab */}
          <div className={`drawer-panel${activeTab === 'trucks' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">Vehicle Assignment</div>
              {editing ? (
                <div className="drawer-field">
                  <span className="drawer-field-label">Trucks Needed</span>
                  <input type="number" className="form-input" style={{maxWidth:'80px',textAlign:'right'}} min="0" value={editForm.trucksneeded} onChange={e => updateField('trucksneeded', e.target.value)} />
                </div>
              ) : (
                <div className="drawer-field"><span className="drawer-field-label">Trucks Needed</span><span className="drawer-field-value">{job.cr55d_trucksneeded || '—'}</span></div>
              )}
            </div>
            {!editing && (
              <div className="empty-state" style={{padding:'20px'}}>
                <div className="empty-state-icon">🚚</div>
                <div className="empty-state-title">No Trucks Assigned</div>
                <div className="empty-state-sub">Assign vehicles via the Truck Schedule in the Scheduling tab</div>
              </div>
            )}
          </div>

          {/* Site Photos Tab */}
          <div className={`drawer-panel${activeTab === 'photos' ? ' active' : ''}`}>
            <div className="empty-state">
              <div className="empty-state-icon">📸</div>
              <div className="empty-state-title">No Site Photos</div>
              <div className="empty-state-sub">Photos will appear here when uploaded by PMs via the field app (Outpost)</div>
            </div>
          </div>

          {/* JULIE Tab */}
          <div className={`drawer-panel${activeTab === 'julie' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">JULIE Status</div>
              {julieTickets.length === 0 ? (
                <div>
                  <div className="callout callout-amber mb-12">
                    <span className="callout-icon">⚠️</span>
                    <div>Every tent job requires a JULIE ticket. This job needs one submitted.</div>
                  </div>
                  {job.cr55d_installdate && (
                    <div className="text-base color-muted">
                      Deadline: <strong style={{color:'var(--bp-text)'}}>{sharedFormatDate((() => { const d = new Date(job.cr55d_installdate.split('T')[0] + 'T12:00:00'); d.setDate(d.getDate() - 7); const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}` })())}</strong>
                      <span style={{color:'var(--bp-red)',fontWeight:600,marginLeft:'8px'}}>
                        (7 days before install)
                      </span>
                    </div>
                  )}
                </div>
              ) : julieTickets.map((t, i) => (
                <div key={i} className="card" style={{padding:'12px 14px',marginBottom:'8px'}}>
                  <div className="flex-between" style={{marginBottom:'4px'}}>
                    <span className="text-base font-semibold">{t.cr55d_ticketnumber || 'JULIE Ticket'}</span>
                    <span className={`badge ${t.cr55d_status === 'completed' ? 'badge-green' : t.cr55d_status === 'expired' ? 'badge-red' : 'badge-amber'}`}>
                      {t.cr55d_status || 'Pending'}
                    </span>
                  </div>
                  {t.cr55d_expirationdate && (
                    <div className="text-md color-muted">
                      Expires: {sharedFormatDate(isoDate(t.cr55d_expirationdate))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permit Tab */}
          <div className={`drawer-panel${activeTab === 'permit' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title">Permit Status</div>
              {permits.length === 0 ? (
                <div className="callout callout-amber mb-12">
                  <span className="callout-icon">⚠️</span>
                  <div>All jobs are auto-flagged as needing a permit. Toggle off in Ops Admin if not required.</div>
                </div>
              ) : permits.map((p, i) => (
                <div key={i} className="card" style={{padding:'12px 14px',marginBottom:'8px'}}>
                  <div className="flex-between" style={{marginBottom:'4px'}}>
                    <span className="text-base font-semibold">{p.cr55d_permitnumber || 'Permit'}</span>
                    <span className={`badge ${p.cr55d_status === 'approved' ? 'badge-green' : p.cr55d_status === 'expired' ? 'badge-red' : 'badge-amber'}`}>
                      {p.cr55d_status || 'Not Started'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Docs Tab */}
          <div className={`drawer-panel${activeTab === 'docs' ? ' active' : ''}`}>
            <div className="drawer-section">
              <div className="drawer-section-title flex-between">
                <span>Documents</span>
                <button className="btn btn-outline btn-sm" onClick={() => {
                  pickAndUploadFile(
                    job.cr55d_jobid,
                    `Document - ${job.cr55d_clientname || job.cr55d_jobname}`,
                    '.pdf,.doc,.docx,.jpg,.png,.dwg',
                    (name) => { setUploadToast(`Uploaded ${name}`); setTimeout(() => setUploadToast(null), 3000) },
                    (err) => { setUploadToast(`Upload failed: ${err}`); setTimeout(() => setUploadToast(null), 4000) }
                  )
                }}>Upload</button>
              </div>
              <div className="callout callout-blue mb-12">
                <span className="callout-icon">📂</span>
                <div>Documents are stored in SharePoint job folders. Upload documents here to auto-save to the right folder.</div>
              </div>
              <div className="empty-state" style={{padding:'20px'}}>
                <div className="empty-state-icon">📄</div>
                <div className="empty-state-title">No Documents</div>
                <div className="empty-state-sub">Drawings, contracts, and site maps will appear here</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {uploadToast && <div className="toast show info" style={{zIndex:10002}}>{uploadToast}</div>}
      {editToast && <div className="toast show success" style={{zIndex:10002}}>{editToast}</div>}
    </div>
  )
}
