import { useState, useEffect, useRef } from 'react'
import { dvFetch } from '../hooks/useDataverse'

/* ── Conversational Bug Reporter (mirrors Sales Hub "Talk to Us") ── */

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatResponse(text) {
  return text
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
    chatHistoryRef.current = []
    initChat()
  }, [open])

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
      const hasSummary = /\bType\s*:/i.test(reply) && /\bSummary\s*:/i.test(reply)
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
    if (lastAI && (lastAI.content.includes('Does this look right?') || lastAI.content.includes('Say yes to submit') || lastAI.content.includes('look correct')) &&
        (ml === 'yes' || ml === 'y' || ml.includes('yes') || ml.includes('submit') || ml.includes('looks right') || ml.includes('looks good'))) {
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
    const summary = getField('Summary') || (isFeature ? 'Feature request' : 'Bug report')
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

        await fetch('/api/dataverse-proxy/cr55d_featurerequests', {
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
      } else {
        const expected = getField('Expected')
        const actual = getField('Actual')
        const steps = getField('Steps') || lines.filter(l => /^\d+\./.test(l.trim())).map(l => l.trim()).join('\n')

        await fetch('/api/dataverse-proxy/cr55d_bugreports', {
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
      }

      const typeLabel = isFeature ? 'Feature request' : 'Bug report'
      setSubmitted(true)
      setMessages(prev => [...prev, { role: 'ai', html: `<div style="color:var(--bp-green);font-weight:600;">${typeLabel} submitted. Kyle will see it in the queue.</div>` }])

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
      await fetch('/api/dataverse-proxy/cr55d_bugreports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cr55d_name: `Report: ${msg.substring(0, 80)} (${dateSuffix})`,
          cr55d_description: msg,
          cr55d_context: JSON.stringify({ page: currentPage, timestamp: new Date().toISOString() }),
          cr55d_reportedby: 'Ops Base Camp',
          cr55d_status: 306280000,
          cr55d_appsource: 'Ops Base Camp',
        })
      })
      setSubmitted(true)
      setMessages(prev => [...prev, { role: 'ai', html: '<div style="color:var(--bp-green);font-weight:600;">Submitted! Kyle will see it in the queue.</div>' }])
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
      <div className="bug-modal" onClick={e => e.stopPropagation()}>

        {/* ── Navy gradient header ───────────────────────────── */}
        <div className="bug-header">
          <div className="bug-header-decor"></div>
          <div className="bug-header-content">
            <div>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                <span style={{fontSize:'16px',fontWeight:700,color:'var(--bp-white)'}}>Talk to Us</span>
              </div>
              <div style={{fontSize:'12px',color:'rgba(255,255,255,.55)'}}>Bug reports, feature ideas, or questions</div>
            </div>
            <button className="bug-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* ── Context bar ────────────────────────────────────── */}
        <div className="bug-context">
          <span>📍 {pageName}</span>
          <span style={{color:'var(--bp-green)'}}>✓ No recent errors</span>
        </div>

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
                <span style={{fontSize:'13px',color:'var(--bp-muted)',fontStyle:'italic'}}>Listening...</span>
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
