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

      // Check if Claude produced a structured summary (ready to submit)
      const hasSummary = (/\bType\s*:/i.test(reply) || /\bSeverity\s*:/i.test(reply)) && (/\bSummary\s*:/i.test(reply) || /\bDescription\s*:/i.test(reply) || /Confirm/i.test(reply))
      setMessages(prev => [...prev, { role: 'ai', html: formatResponse(reply), canSubmit: hasSummary }])
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

    // Check if user is confirming a submission
    const lastAI = chatHistoryRef.current.filter(m => m.role === 'assistant').pop()
    const ml = msg.toLowerCase()
    const isConfirmation = ml === 'yes' || ml === 'y' || ml.includes('yes') || ml.includes('submit') || ml.includes('looks right') || ml.includes('looks good') || ml.includes('confirm') || ml.includes('correct') || ml.includes('go ahead') || ml.includes('send it') || ml.includes('lgtm')
    const aiHasSummary = lastAI && (/\bType\s*:/i.test(lastAI.content) || /\bSummary\s*:/i.test(lastAI.content) || /\bSeverity\s*:/i.test(lastAI.content) || lastAI.content.includes('Confirm') || lastAI.content.includes('look right') || lastAI.content.includes('look correct') || lastAI.content.includes('submit'))
    if (lastAI && isConfirmation && aiHasSummary) {
      await submitReport(lastAI.content)
      return
    }

    // If AI is unavailable, do a simple Dataverse post
    if (promptError === 'ai_unavailable') {
      await submitSimple(msg)
      return
    }

    await callAPI()
  }

  async function submitReport(aiSummary) {
    setLoading(true)
    setMessages(prev => [...prev, { role: 'ai', html: '<span style="opacity:.6;">Submitting to Dataverse...</span>' }])

    const lines = aiSummary.split('\n')
    const getField = (label) => {
      const line = lines.find(l => l.toLowerCase().includes(label.toLowerCase()))
      return line ? line.replace(/^[^:]+:\s*/, '').replace(/\*\*/g, '').trim() : ''
    }

    const typeField = getField('Type')
    const isFeature = typeField.toLowerCase().includes('feature')
    const summary = getField('Summary') || getField('Description') || getField('Issue') || getField('Bug') || aiSummary.split('\n').find(l => l.trim().length > 10)?.replace(/\*\*/g,'').trim() || (isFeature ? 'Feature request' : 'Bug report')
    const dateSuffix = new Date().toISOString().substring(0, 10)

    const context = JSON.stringify({
      page: currentPage,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: location.href,
      chatTranscript: chatHistoryRef.current.map(m => `${m.role}: ${m.content.substring(0, 500)}`).join('\n---\n')
    })

    try {
      if (isFeature) {
        const request = getField('Request') || summary
        const location = getField('Where in app') || getField('Location') || currentPage
        const priorityText = getField('Priority').toLowerCase()
        const priority = priorityText.includes('high') ? 306280002 : priorityText.includes('medium') ? 306280001 : 306280000

        const featureResp = await fetch('/api/dataverse-proxy/cr55d_featurerequests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cr55d_name: `Feature: ${summary.substring(0, 80)} (${dateSuffix})`,
            cr55d_request: request,
            cr55d_location: location,
            cr55d_priority: priority,
            cr55d_reportedby: 'Ops Base Camp',
            cr55d_status: 306280000,
            cr55d_context: context,
          })
        })
        if (!featureResp.ok) throw new Error(`Save failed (${featureResp.status})`)
      } else {
        const expected = getField('Expected')
        const actual = getField('Actual')
        const steps = getField('Steps') || lines.filter(l => /^\d+\./.test(l.trim())).map(l => l.trim()).join('\n')

        const bugResp = await fetch('/api/dataverse-proxy/cr55d_bugreports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cr55d_name: `Bug: ${summary.substring(0, 80)} (${dateSuffix})`,
            cr55d_description: summary + (steps ? '\n\nSteps:\n' + steps : ''),
            cr55d_expected: expected,
            cr55d_actual: actual,
            cr55d_context: context,
            cr55d_reportedby: 'Ops Base Camp',
            cr55d_status: 306280000,
          })
        })
        if (!bugResp.ok) throw new Error(`Save failed (${bugResp.status})`)
      }

      const typeLabel = isFeature ? 'Feature request' : 'Bug report'
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
          cr55d_reportedby: 'Ops Base Camp',
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

  function handleSubmitClick(idx) {
    const lastAI = chatHistoryRef.current.filter(m => m.role === 'assistant').pop()
    if (lastAI) submitReport(lastAI.content)
    else setMessages(prev => [...prev, { role: 'ai', html: 'Describe the issue first so I can generate a report to submit.' }])
  }

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
                {m.canSubmit && !submitted && (
                  <div style={{marginTop:'8px'}}>
                    <button className="btn btn-primary btn-sm" onClick={() => handleSubmitClick(i)}>Submit to Dataverse</button>
                  </div>
                )}
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
