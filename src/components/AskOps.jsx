import { useState, useRef, useEffect } from 'react'

/* ── Skill Cards ───────────────────────────────────────────────── */
const SKILLS = [
  { id: 'loadlist', icon: '📋', name: 'Generate Load List', desc: 'Upload a sales invoice or select a job to expand line items into warehouse pull lists from the BOM Master.', color: '#3B82F6' },
  { id: 'production', icon: '📅', name: 'Build Production Schedule', desc: 'AI-drafted production schedule in Semarjian format. Scales by complexity with crew phasing and milestones.', color: '#8B5CF6' },
  { id: 'inventory', icon: '📦', name: 'Check Inventory', desc: 'Natural language queries against the 17-tab inventory count sheet and BOM Master.', color: '#059669' },
  { id: 'crew', icon: '👥', name: 'Crew Availability', desc: 'Check who\'s available, find CDL drivers, and get crew composition suggestions.', color: '#D97706' },
  { id: 'askjob', icon: '🔍', name: 'Ask About a Job', desc: 'Free-form Q&A across all connected data — status, crew, schedule, JULIE, permits, docs.', color: '#EC4899' },
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

/* ── Main Component ────────────────────────────────────────────── */
export default function AskOps() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Welcome to Ask Ops! I\'m your AI operations assistant. I can help with load lists, production schedules, inventory checks, crew availability, and general job questions.\n\nClick a skill card above or ask me anything about Blue Peak operations.' }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeSkill, setActiveSkill] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSkillClick(skill) {
    setActiveSkill(skill.id)
    const prompts = {
      loadlist: 'I\'d like to generate a load list. Which job should I create it for? You can give me a job name, client name, or describe what you need.',
      production: 'I\'ll build a production schedule for you. Which job? I\'ll create it in Semarjian format with crew phasing, milestones, and site logistics.',
      inventory: 'What product are you checking on? I can query the full inventory — restroom trailers, hardwood flooring, tables, chairs, dance floors, and everything in the BOM Master.',
      crew: 'What crew information do you need? I can check availability, find CDL drivers, or suggest crew compositions based on job requirements.',
      askjob: 'Which job would you like to know about? I can pull status, crew assignments, JULIE/permit status, production schedule, and all connected data.',
    }
    setMessages(prev => [...prev, { role: 'assistant', content: prompts[skill.id] || 'How can I help?' }])
    inputRef.current?.focus()
  }

  function handleQuickQuestion(q) {
    setInput(q)
    handleSend(q)
  }

  async function handleSend(overrideMsg) {
    const msg = overrideMsg || input
    if (!msg.trim()) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setIsLoading(true)

    try {
      // Determine prompt key based on active skill
      const promptKeyMap = { loadlist: 'load_list_generator', production: 'production_schedule_generator', inventory: 'ask_ops_system', crew: 'crew_availability', askjob: 'job_query' }
      const promptKey = promptKeyMap[activeSkill] || 'ask_ops_system'

      const chatHistory = [...messages.filter(m => m.role !== 'system'), { role: 'user', content: msg }]

      const resp = await fetch('/api/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory.map(m => ({ role: m.role, content: m.content })),
          promptKey,
          max_tokens: 4096,
        })
      })

      if (!resp.ok) {
        throw new Error(`API returned ${resp.status}`)
      }

      const data = await resp.json()
      const responseText = data.content?.[0]?.text || data.content || 'No response received.'

      setMessages(prev => [...prev, { role: 'assistant', content: responseText }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${e.message}. Please try again.` }])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Ask Ops</h1>
        <div className="sub">AI assistant for operations — powered by Claude</div>
      </div>

      {/* Skill Cards */}
      <div className="ai-skills animate-in">
        {SKILLS.map((s, i) => (
          <div key={s.id} className="ai-skill-card" onClick={() => handleSkillClick(s)} style={{animationDelay: `${i * 50}ms`}}>
            <div className="ai-skill-icon" style={{background: `${s.color}15`}}>
              <span>{s.icon}</span>
            </div>
            <div className="ai-skill-name">{s.name}</div>
            <div className="ai-skill-desc">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Quick Questions */}
      <div className="quick-questions animate-in-1">
        {QUICK_QUESTIONS.map((q, i) => (
          <button key={i} className="quick-q" onClick={() => handleQuickQuestion(q)}>
            {q}
          </button>
        ))}
      </div>

      {/* Chat Area */}
      <div className="ai-chat-area animate-in-2">
        <div className="ai-messages">
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              <div className="ai-msg-avatar">
                {m.role === 'assistant' ? '⛰️' : 'You'}
              </div>
              <div className="ai-msg-body">
                {m.content.split('\n').map((line, li) => {
                  if (line.startsWith('**') && line.endsWith('**')) {
                    return <div key={li} style={{fontWeight:700,marginTop: li > 0 ? '8px' : 0}}>{line.replace(/\*\*/g, '')}</div>
                  }
                  if (line.startsWith('• ') || line.startsWith('- ')) {
                    return <div key={li} style={{paddingLeft:'12px',position:'relative'}}>
                      <span style={{position:'absolute',left:0}}>•</span>
                      {line.replace(/^[•\-]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}
                    </div>
                  }
                  if (line.startsWith('*') && line.endsWith('*')) {
                    return <div key={li} style={{fontStyle:'italic',color:'var(--bp-muted)',marginTop:'8px',fontSize:'12px'}}>{line.replace(/^\*|\*$/g, '')}</div>
                  }
                  if (!line.trim()) return <div key={li} style={{height:'8px'}}></div>
                  return <div key={li}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</div>
                })}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="ai-msg assistant">
              <div className="ai-msg-avatar">⛰️</div>
              <div className="ai-msg-body">
                <div className="flex gap-4">
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out infinite'}}></div>
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out .2s infinite'}}></div>
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--bp-blue)',animation:'pulse 1s ease-in-out .4s infinite'}}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="ai-input-area">
          <input ref={inputRef} className="form-input" placeholder="Ask anything about operations..."
            value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} disabled={isLoading} />
          <button className="btn btn-primary" onClick={() => handleSend()} disabled={isLoading || !input.trim()}>
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
