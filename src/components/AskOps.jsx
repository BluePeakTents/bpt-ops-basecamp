import { useState, useRef, useEffect } from 'react'

/* ── Skill Cards (ops-specific) ───────────────────────────────── */
const SKILLS = [
  { id: 'loadlist', name: 'Generate Load List', desc: 'Expand line items into warehouse pull lists from the BOM Master', color: '#3B82F6',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/></svg> },
  { id: 'production', name: 'Build Production Schedule', desc: 'AI-drafted schedule in Semarjian format with crew phasing', color: '#8B5CF6',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { id: 'inventory', name: 'Check Inventory', desc: 'Query restrooms, hardwood, tables, chairs & BOM Master', color: '#059669',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg> },
  { id: 'crew', name: 'Crew Availability', desc: 'Check availability, find CDL drivers, crew composition', color: '#D97706',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { id: 'askjob', name: 'Ask About a Job', desc: 'Status, crew, schedule, JULIE, permits & all job data', color: '#EC4899',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg> },
]

const QUICK_QUESTIONS = [
  "What's going out tomorrow?",
  "Any JULIE tickets expiring this week?",
  "Overnight jobs next two weeks",
  "Which trucks are down for maintenance?",
  "Who's available Tuesday?",
  "What crew does Christhian have this week?",
  "How many box trucks do we need Thursday?",
  "Jobs still missing PM assignments",
]

/* ── Sparkle SVG ──────────────────────────────────────────────── */
const Sparkle = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>
)

/* ── Main Component ────────────────────────────────────────────── */
export default function AskOps() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeSkill, setActiveSkill] = useState(null)
  const [showWelcome, setShowWelcome] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSkillClick(skill) {
    setActiveSkill(skill.id)
    setShowWelcome(false)
    const prompts = {
      loadlist: 'I\'d like to generate a load list. Which job should I create it for? You can give me a job name, client name, or describe what you need.',
      production: 'I\'ll build a production schedule for you. Which job? I\'ll create it in Semarjian format with crew phasing, milestones, and site logistics.',
      inventory: 'What product are you checking on? I can query the full inventory — restroom trailers, hardwood flooring, tables, chairs, dance floors, and everything in the BOM Master.',
      crew: 'What crew information do you need? I can check availability, find CDL drivers, or suggest crew compositions based on job requirements.',
      askjob: 'Which job would you like to know about? I can pull status, crew assignments, JULIE/permit status, production schedule, and all connected data.',
    }
    setMessages([{ role: 'assistant', content: prompts[skill.id] || 'How can I help?' }])
    inputRef.current?.focus()
  }

  function handleQuickQuestion(q) {
    setShowWelcome(false)
    setInput('')
    setMessages([{ role: 'user', content: q }])
    doSend(q, [])
  }

  function resetAskOps() {
    setMessages([])
    setActiveSkill(null)
    setShowWelcome(true)
    setInput('')
    setIsLoading(false)
  }

  async function doSend(msg, history) {
    setIsLoading(true)
    try {
      const promptKeyMap = { loadlist: 'load_list_generator', production: 'production_schedule_generator', inventory: 'ask_ops_system', crew: 'crew_availability', askjob: 'job_query' }
      const promptKey = promptKeyMap[activeSkill] || 'ask_ops_system'

      const allMessages = [...history, { role: 'user', content: msg }]
      const firstUserIdx = allMessages.findIndex(m => m.role === 'user')
      const chatHistory = firstUserIdx >= 0 ? allMessages.slice(firstUserIdx) : allMessages

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      const resp = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
          promptKey,
          max_tokens: 4096,
        })
      })

      clearTimeout(timeout)

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(resp.status === 404 ? 'AI assistant API not available. Check that the API is deployed.' : `API error ${resp.status}: ${errText.substring(0, 100)}`)
      }

      let data
      try { data = await resp.json() } catch { throw new Error('Received invalid response from AI assistant.') }
      if (data.error) throw new Error(data.error)

      const responseText = data.content?.[0]?.text || (typeof data.content === 'string' ? data.content : null) || 'No response received.'
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }])
    } catch (e) {
      const errorMsg = e.name === 'AbortError'
        ? 'Request timed out after 60 seconds. Try a simpler question or try again.'
        : `Sorry, I encountered an error: ${e.message}`
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }])
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSend(overrideMsg) {
    const msg = overrideMsg || input
    if (!msg.trim()) return
    setInput('')
    if (showWelcome) setShowWelcome(false)
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    doSend(msg, messages)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ── Render inline markdown ──────────────────────────────────── */
  function renderInline(text) {
    const parts = text.split(/(\*\*.*?\*\*)/)
    return parts.map((part, pi) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pi}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  return (
    <div className="askbp-container">
      <div className="askbp-panel">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="askbp-head">
          <div className="askbp-head-icon sparkle-glimmer">
            <Sparkle size={20} />
          </div>
          <div>
            <div className="askbp-head-title">Ask Ops</div>
            <div className="askbp-head-sub">AI operations assistant &middot; Powered by Claude Opus</div>
          </div>
          <span style={{flex:1}}></span>
          <div className="askbp-head-status">
            <span className="askbp-status-dot"></span> Ready
          </div>
        </div>

        {/* ── Messages Area ──────────────────────────────────── */}
        <div className="askbp-messages">
          {showWelcome ? (
            <div className="askbp-welcome">
              <div className="askbp-welcome-greeting">
                <div className="askbp-welcome-icon sparkle-glimmer">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--bp-blue)" strokeWidth="1.3"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>
                </div>
                <h2>What can I help with?</h2>
                <p>Choose a skill below or just type naturally.</p>
              </div>

              {/* Skills Grid */}
              <div className="askbp-skills-grid">
                {SKILLS.map(s => (
                  <button key={s.id} className="askbp-skill-card" onClick={() => handleSkillClick(s)}>
                    <div className="askbp-skill-icon" style={{background:`${s.color}14`,color:s.color}}>
                      {s.icon}
                    </div>
                    <div className="askbp-skill-label">{s.name}</div>
                    <div className="askbp-skill-desc">{s.desc}</div>
                  </button>
                ))}
              </div>

              {/* Quick Questions */}
              <div className="askbp-suggestions">
                <div className="askbp-suggestions-label">Quick questions</div>
                <div className="askbp-suggestions-row">
                  {QUICK_QUESTIONS.map((q, i) => (
                    <button key={i} className="askbp-suggestion" onClick={() => handleQuickQuestion(q)}>{q}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role === 'user' ? 'user' : 'ai'}`}>
                  {m.content.split('\n').map((line, li) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={li} style={{fontWeight:700,marginTop: li > 0 ? '8px' : 0,marginBottom:'2px'}}>{line.replace(/\*\*/g, '')}</p>
                    }
                    if (line.startsWith('• ') || line.startsWith('- ')) {
                      return <p key={li} style={{paddingLeft:'14px',position:'relative',margin:'1px 0'}}>
                        <span style={{position:'absolute',left:0}}>•</span>
                        {renderInline(line.replace(/^[•\-]\s*/, ''))}
                      </p>
                    }
                    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
                      return <p key={li} style={{fontStyle:'italic',color:'var(--bp-muted)',marginTop:'8px',fontSize:'12px'}}>{line.replace(/^\*|\*$/g, '')}</p>
                    }
                    if (!line.trim()) return <p key={li} style={{height:'6px',margin:0}}></p>
                    return <p key={li} style={{margin:'1px 0'}}>{renderInline(line)}</p>
                  })}
                </div>
              ))}
              {isLoading && (
                <div className="chat-msg ai">
                  <div style={{display:'flex',gap:'5px',padding:'4px 0'}}>
                    <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out infinite'}}></div>
                    <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out .2s infinite'}}></div>
                    <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out .4s infinite'}}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* ── Active Skill Bar ───────────────────────────────── */}
        {activeSkill && !showWelcome && (
          <div className="askbp-active-skill">
            <button className="btn btn-ghost btn-sm" onClick={resetAskOps} style={{fontSize:'12px',padding:'3px 10px'}}>&larr; Back</button>
            <span className="askbp-skill-dot"></span>
            <span style={{fontSize:'11px',fontWeight:600,color:'var(--bp-navy)'}}>{SKILLS.find(s => s.id === activeSkill)?.name}</span>
            <span style={{flex:1}}></span>
            <button className="btn btn-ghost btn-sm" onClick={resetAskOps} style={{fontSize:'9.5px',padding:'2px 7px'}}>End Skill</button>
          </div>
        )}

        {/* ── Input Footer ───────────────────────────────────── */}
        <div className="askbp-footer">
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Ask about jobs, crews, inventory, scheduling..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button className="btn btn-primary askbp-send" onClick={() => handleSend()} disabled={isLoading || !input.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
