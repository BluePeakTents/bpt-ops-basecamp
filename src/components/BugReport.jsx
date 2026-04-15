import { useState, useEffect, useRef } from 'react'
import { dvFetch } from '../hooks/useDataverse'

/* ── Conversational Bug Reporter (mirrors Sales Hub "Talk to Us") ── */

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatResponse(text) {
  // Sanitize first to prevent XSS, then apply markdown formatting
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export default function BugReport({ open, onClose, currentPage }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [systemPrompt, setSystemPrompt] = useState(null)
  const [promptError, setPromptError] = useState(null)
  const [chipsVisible, setChipsVisible] = useState(true)
  const [recentErrors, setRecentErrors] = useState([])
  const [showErrors, setShowErrors] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [reporterName, setReporterName] = useState(() => {
    try { return localStorage.getItem('bpt_reporter_name') || '' } catch(e) { return '' }
  })
  const chatRef = useRef(null)
  const inputRef = useRef(null)
  const chatHistoryRef = useRef([])

  // Initialize on open
  useEffect(() => {
    if (!open) return
    setMessages([])
    setInput('')
    setSubmitted(false)
    setChipsVisible(true)
    setPromptError(null)
    setShowErrors(false)
    chatHistoryRef.current = []
    initChat()
    loadRecentErrors()
  }, [open])

  async function loadRecentErrors() {
    try {
      const data = await dvFetch('cr55d_errorlogs?$select=cr55d_errorlogid,cr55d_name,cr55d_errormessage,cr55d_errortype,cr55d_severity,cr55d_functionname,cr55d_stacktrace,cr55d_appname,createdon&$orderby=createdon desc&$top=20')
      setRecentErrors(Array.isArray(data) ? data : [])
    } catch { setRecentErrors([]) }
  }

  function copyErrorId(id) {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {})
  }

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading])

  // Focus input when loading finishes
  useEffect(() => {
    if (!loading && open && inputRef.current) inputRef.current.focus()
  }, [loading, open])

  async function initChat() {
    setLoading(true)
    try {
      // Try to fetch the bug_report_system prompt from Dataverse
      const data = await dvFetch(`cr55d_aiinstructions?$filter=${encodeURIComponent("cr55d_name eq 'bug_report_system' and cr55d_isactive eq true")}&$select=cr55d_prompttext&$top=1`)
      if (Array.isArray(data) && data[0]?.cr55d_prompttext) {
        setSystemPrompt(data[0].cr55d_prompttext)
      } else {
        // Fall back to a simple built-in prompt
        setSystemPrompt(null)
      }
    } catch {
      setSystemPrompt(null)
    }

    // Send initial greeting via Claude
    chatHistoryRef.current = [{ role: 'user', content: 'I want to report something about Ops Base Camp.' }]
    await callAPI()
  }

  async function callAPI() {
    setLoading(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const resp = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          promptKey: 'bug_report_system',
          messages: chatHistoryRef.current,
          max_tokens: 2048,
        })
      })

      clearTimeout(timeout)

      if (!resp.ok) {
        // If API not available, fall back to simple mode
        setPromptError('ai_unavailable')
        setMessages([{ role: 'ai', html: "Hi! Tell me what's on your mind — describe the bug, feature idea, or question and I'll log it for the team." }])
        setLoading(false)
        return
      }

      let data
      try { data = await resp.json() } catch { throw new Error('Invalid response') }
      if (data.error) throw new Error(data.error)

      const reply = data.content?.[0]?.text || (typeof data.content === 'string' ? data.content : '') || "Hi! What would you like to report?"
      chatHistoryRef.current.push({ role: 'assistant', content: reply })

      setMessages(prev => [...prev, { role: 'ai', html: formatResponse(reply) }])
    } catch (e) {
      if (e.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'ai', html: "Request timed out. Tell me what's on your mind and I'll log it." }])
        setPromptError('timeout')
      } else {
        setMessages(prev => [...prev, { role: 'ai', html: "Hi! Tell me what's on your mind — describe the bug, feature idea, or question and I'll log it for the team." }])
        setPromptError('ai_unavailable')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setChipsVisible(false)
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    chatHistoryRef.current.push({ role: 'user', content: msg })

    // If AI is unavailable, do a simple Dataverse post
    if (promptError === 'ai_unavailable') {
      await submitSimple(msg)
      return
    }

    await callAPI()
  }

  async function submitReport(reportType) {
    setLoading(true)
    setMessages(prev => [...prev, { role: 'ai', html: '<span style="opacity:.6;">Submitting to Dataverse...</span>' }])

    // Build report from the conversation itself — no dependency on Claude's format
    const userMsgs = chatHistoryRef.current
      .filter(m => m.role === 'user' && m.content.length > 5 && m.content !== 'I want to report something about Ops Base Camp.')
      .map(m => m.content)
    const aiMsgs = chatHistoryRef.current
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
    const lastAI = aiMsgs[aiMsgs.length - 1] || ''

    // Try to extract structured fields from Claude's last message (bonus, not required)
    const lines = lastAI.split('\n').flatMap(l => l.split(/\s*\|\s*/))
    const getField = (label) => {
      const line = lines.find(l => new RegExp('^\\**\\s*' + label + '\\s*:', 'i').test(l.trim()))
      if (!line) return ''
      return line.replace(/^[^:]+:\s*/, '').replace(/\*\*/g, '').trim()
    }

    // Summary: structured field > first user message > fallback
    const summary = getField('Summary') || getField('Description') || getField('Issue') || getField('Request')
      || userMsgs[0]?.substring(0, 200)
      || (reportType === 'feature' ? 'Feature request' : 'Bug report')

    const fullDescription = userMsgs.join('\n\n')
    const dateSuffix = new Date().toISOString().substring(0, 10)

    const context = JSON.stringify({
      page: currentPage,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: location.href,
      chatTranscript: chatHistoryRef.current.map(m => `${m.role}: ${m.content.substring(0, 500)}`).join('\n---\n')
    })

    try {
      if (reportType === 'feature') {
        const resp = await fetch('/api/dataverse-proxy/cr55d_featurerequests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cr55d_name: `Feature: ${summary.replace(/\*\*/g,'').substring(0, 80)} (${dateSuffix})`,
            cr55d_request: fullDescription,
            cr55d_location: getField('Location') || getField('Where in app') || currentPage,
            cr55d_priority: 306280001, // Medium default
            cr55d_reportedby: reporterName || 'Ops Base Camp',
            cr55d_status: 306280000,
            cr55d_context: context,
          })
        })
        if (!resp.ok) throw new Error(`Save failed (${resp.status})`)
      } else {
        const resp = await fetch('/api/dataverse-proxy/cr55d_bugreports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cr55d_name: `Bug: ${summary.replace(/\*\*/g,'').substring(0, 80)} (${dateSuffix})`,
            cr55d_description: fullDescription,
            cr55d_expected: getField('Expected'),
            cr55d_actual: getField('Actual'),
            cr55d_context: context,
            cr55d_reportedby: reporterName || 'Ops Base Camp',
            cr55d_status: 306280000,
          })
        })
        if (!resp.ok) throw new Error(`Save failed (${resp.status})`)
      }

      const typeLabel = reportType === 'feature' ? 'Feature request' : 'Bug report'
      setSubmitted(true)
      setMessages(prev => [...prev, { role: 'ai', html: `<div class="font-semibold" style="color:var(--bp-green);">${typeLabel} submitted. Kyle will see it in the queue.</div>` }])
      setTimeout(() => { onClose() }, 2500)
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', html: `<span style="color:var(--bp-red);">Failed to submit: ${escHtml(e.message)}. Try again.</span>` }])
    } finally {
      setLoading(false)
    }
  }

  async function submitSimple(msg) {
    setLoading(true)
    const dateSuffix = new Date().toISOString().substring(0, 10)
    try {
      const resp = await fetch('/api/dataverse-proxy/cr55d_bugreports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cr55d_name: `Report: ${msg.substring(0, 80)} (${dateSuffix})`,
          cr55d_description: msg,
          cr55d_context: JSON.stringify({ page: currentPage, timestamp: new Date().toISOString() }),
          cr55d_reportedby: reporterName || 'Ops Base Camp',
          cr55d_status: 306280000,
        })
      })
      if (!resp.ok) throw new Error(`Save failed (${resp.status})`)
      setSubmitted(true)
      setMessages(prev => [...prev, { role: 'ai', html: '<div class="font-semibold" style="color:var(--bp-green);">Submitted! Kyle will see it in the queue.</div>' }])
      setTimeout(() => { onClose() }, 2500)
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', html: `<span style="color:var(--bp-red);">Failed: ${escHtml(e.message)}</span>` }])
    } finally {
      setLoading(false)
    }
  }

  // User has typed at least one real message — Submit buttons are available
  const userHasDescribed = messages.some(m => m.role === 'user')

  function quickAction(type) {
    setChipsVisible(false)
    const msgs = { bug: 'I found a bug — ', feature: 'I have a feature idea — ', question: 'Quick question — ' }
    setInput(msgs[type] || '')
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  const pageName = (currentPage || 'dashboard').charAt(0).toUpperCase() + (currentPage || 'dashboard').slice(1)

  return (
    <div className="bug-overlay" onClick={onClose}>
      <div className="bug-modal" role="dialog" aria-modal="true" aria-label="Report a bug" onClick={e => e.stopPropagation()}>

        {/* ── Navy gradient header ───────────────────────────── */}
        <div className="bug-header">
          <div className="bug-header-decor"></div>
          <div className="bug-header-content">
            <div>
              <div className="mb-4" style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span className="text-xl font-bold" style={{color:'var(--bp-white)'}}>Talk to Us</span>
              </div>
              <div className="text-base" style={{color:'rgba(255,255,255,.55)'}}>Bug reports, feature ideas, or questions</div>
            </div>
            <button className="bug-close" onClick={onClose} aria-label="Close bug report">&times;</button>
          </div>
        </div>

        {/* ── Name bar (persists in localStorage) ──────────── */}
        <div style={{padding:'6px 16px',background:'var(--bp-alt)',borderBottom:'1px solid var(--bp-border)',display:'flex',alignItems:'center',gap:'8px',fontSize:'12px'}}>
          <span style={{color:'var(--bp-muted)',fontWeight:600}}>Your name:</span>
          <input value={reporterName} onChange={e => { setReporterName(e.target.value); try { localStorage.setItem('bpt_reporter_name', e.target.value); } catch(_){} }}
            placeholder="e.g. AJ, Jake, Kyle" style={{flex:1,border:'1px solid var(--bp-border)',borderRadius:'4px',padding:'3px 8px',fontSize:'12px',fontFamily:'inherit',background:'var(--bp-white)'}} />
        </div>

        {/* ── Context bar ────────────────────────────────────── */}
        <div className="bug-context">
          <span>📍 {pageName}</span>
          <button onClick={() => setShowErrors(!showErrors)} style={{background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',padding:0,color: recentErrors.length > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>
            {recentErrors.length > 0 ? `⚠ ${recentErrors.length} recent error${recentErrors.length !== 1 ? 's' : ''} — click to view` : '✓ No recent errors'}
          </button>
        </div>

        {/* ── Error Log Panel ────────────────────────────────── */}
        {showErrors && (
          <div style={{maxHeight:'240px',overflowY:'auto',borderBottom:'1px solid var(--bp-border)',background:'var(--bp-alt)',padding:'8px 12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
              <span style={{fontSize:'11px',fontWeight:700,color:'var(--bp-navy)',textTransform:'uppercase',letterSpacing:'.05em'}}>Error Log</span>
              <button className="btn btn-ghost btn-xs" style={{fontSize:'10px'}} onClick={() => setShowErrors(false)}>Close</button>
            </div>
            {recentErrors.length === 0 ? (
              <div style={{fontSize:'11px',color:'var(--bp-muted)',padding:'8px 0'}}>No errors logged recently.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                {recentErrors.map(err => {
                  const id = err.cr55d_errorlogid || ''
                  const shortId = id.substring(0, 8)
                  const time = err.createdon ? new Date(err.createdon).toLocaleString() : '?'
                  return (
                    <div key={id} style={{padding:'6px 8px',borderRadius:'6px',background:'var(--bp-white)',border:'1px solid var(--bp-border-lt)',fontSize:'11px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2px'}}>
                        <span style={{fontWeight:700,color:'var(--bp-red)',fontFamily:'var(--bp-mono)',fontSize:'10px'}}>
                          {err.cr55d_functionname || 'Unknown'} · {err.cr55d_severity || 'error'}
                        </span>
                        <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                          <span style={{fontSize:'9px',color:'var(--bp-muted)',fontFamily:'var(--bp-mono)'}}>{time}</span>
                          <button
                            onClick={() => copyErrorId(id)}
                            style={{background: copiedId === id ? 'var(--bp-green)' : 'var(--bp-navy)',color:'#fff',border:'none',borderRadius:'4px',padding:'2px 6px',fontSize:'9px',cursor:'pointer',fontFamily:'var(--bp-mono)',fontWeight:700}}
                            title={`Copy full error ID: ${id}`}>
                            {copiedId === id ? '✓ Copied' : shortId}
                          </button>
                        </div>
                      </div>
                      <div style={{color:'var(--bp-navy)',fontWeight:500,marginBottom:'2px'}}>{err.cr55d_errormessage?.substring(0, 120) || err.cr55d_name || 'No message'}</div>
                      {err.cr55d_stacktrace && (
                        <details style={{fontSize:'9px',color:'var(--bp-muted)'}}>
                          <summary style={{cursor:'pointer'}}>Stack trace</summary>
                          <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all',margin:'4px 0',padding:'4px',background:'var(--bp-alt)',borderRadius:'4px',maxHeight:'80px',overflow:'auto',fontFamily:'var(--bp-mono)',fontSize:'9px'}}>{err.cr55d_stacktrace.substring(0, 500)}</pre>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{fontSize:'9px',color:'var(--bp-muted)',marginTop:'6px',fontStyle:'italic'}}>Click an error ID to copy it — paste it to Claude for debugging.</div>
          </div>
        )}

        {/* ── Chat messages ──────────────────────────────────── */}
        <div className="bug-messages" ref={chatRef}>
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="bug-msg-user">{m.text}</div>
            ) : (
              <div key={i} className="bug-msg-ai">
                <div dangerouslySetInnerHTML={{ __html: m.html }} />
              </div>
            )
          ))}
          {loading && (
            <div className="bug-msg-ai">
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span className="bug-typing"><span></span><span></span><span></span></span>
                <span className="text-lg color-muted" style={{fontStyle:'italic'}}>Listening...</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Quick action chips ──────────────────────────────── */}
        {chipsVisible && !loading && messages.length <= 1 && (
          <div className="bug-chips">
            <button className="bug-chip bug-chip-red" onClick={() => quickAction('bug')}>🐛 Bug</button>
            <button className="bug-chip bug-chip-blue" onClick={() => quickAction('feature')}>💡 Feature Idea</button>
            <button className="bug-chip bug-chip-gray" onClick={() => quickAction('question')}>❓ Question</button>
          </div>
        )}

        {/* ── Submit bar — always visible once user has typed something ── */}
        {userHasDescribed && !submitted && !loading && (
          <div style={{display:'flex',gap:'8px',padding:'8px 16px',borderTop:'1px solid var(--bp-border-lt)',background:'var(--bp-alt)'}}>
            <button className="btn btn-sm" onClick={() => submitReport('bug')} style={{flex:1,background:'var(--bp-red)',color:'#fff',border:'none',borderRadius:'8px',padding:'8px 12px',fontWeight:600,fontSize:'12px',cursor:'pointer'}}>Submit as Bug</button>
            <button className="btn btn-sm" onClick={() => submitReport('feature')} style={{flex:1,background:'var(--bp-blue)',color:'#fff',border:'none',borderRadius:'8px',padding:'8px 12px',fontWeight:600,fontSize:'12px',cursor:'pointer'}}>Submit as Feature</button>
          </div>
        )}

        {/* ── Input footer ────────────────────────────────────── */}
        {!submitted && (
          <div className="bug-footer">
            <textarea
              ref={inputRef}
              rows={2}
              placeholder="Tell us what's on your mind..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading || submitted}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSend} disabled={loading || !input.trim()} style={{alignSelf:'end',borderRadius:'10px',padding:'10px 16px'}}>
              {loading ? '...' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
