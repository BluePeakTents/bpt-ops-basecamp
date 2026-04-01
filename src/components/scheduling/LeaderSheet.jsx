import { useMemo, useState, useEffect } from 'react'
import { generateLeaderSheet } from '../../utils/generateLeaderSheet'
import { generateDriverSheets, generateProductionSchedulePDF } from '../../utils/generateDriverSheet'
import { toLocalISO, isoDate, shortDate } from '../../utils/dateUtils'
import { LEADERS, LEADER_COLORS, ACCT_CODES } from '../../data/crewConstants'

/* ── Helpers ───────────────────────────────────────────────────── */
const DAYS_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function formatFullDate(d) {
  return `${DAYS_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
}

function getAcctMgrName(rep) {
  if (!rep) return ''
  const code = rep.split('-')[0]
  return ACCT_CODES[code] || rep
}

/* ═══════════════════════════════════════════════════════════════════
   LEADER SHEET — 3-week lookahead with PDF/DOCX generation
   Week 1: Confirmed   |   Weeks 2-3: Tentative
   ═══════════════════════════════════════════════════════════════════ */
export default function LeaderSheet({ jobs, staff, weekDates, deliveryRows = [], onSelectJob }) {
  const leaders = staff.filter(s => s.cr55d_department === 306280010 || s.cr55d_islead)
  const [autoGenPrompt, setAutoGenPrompt] = useState(false)
  const [lastAutoGen, setLastAutoGen] = useState(() => {
    try { return localStorage.getItem('bpt_leader_sheet_last_gen') || '' } catch { return '' }
  })

  // Auto-prompt on Monday mornings if not already generated this week
  useEffect(() => {
    const now = new Date()
    if (now.getDay() === 1 && now.getHours() < 12) {
      const weekKey = toLocalISO(weekDates[0])
      if (lastAutoGen !== weekKey) {
        setAutoGenPrompt(true)
      }
    }
  }, [weekDates, lastAutoGen])

  // Build 3 weeks of dates
  const threeWeeks = useMemo(() => {
    const weeks = []
    for (let w = 0; w < 3; w++) {
      const weekStart = new Date(weekDates[0])
      weekStart.setDate(weekStart.getDate() + w * 7)
      const dates = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart)
        day.setDate(day.getDate() + d)
        dates.push(day)
      }
      weeks.push({ dates, isTentative: w > 0 })
    }
    return weeks
  }, [weekDates])

  // All jobs in 3-week window
  const windowJobs = useMemo(() => {
    const windowEnd = new Date(weekDates[0])
    windowEnd.setDate(windowEnd.getDate() + 21)
    const windowStart = new Date(weekDates[0])
    return jobs.filter(j => {
      if (!j.cr55d_installdate) return false
      const install = new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
      const strike = j.cr55d_strikedate ? new Date(j.cr55d_strikedate.split('T')[0] + 'T12:00:00') : install
      return install < windowEnd && strike >= windowStart
    }).sort((a, b) => (a.cr55d_installdate || '').localeCompare(b.cr55d_installdate || ''))
  }, [jobs, weekDates])

  // Group jobs by day for each week, then by leader
  function getJobsForDay(dateStr) {
    return windowJobs.filter(j => {
      const install = isoDate(j.cr55d_installdate)
      const strike = isoDate(j.cr55d_strikedate) || install
      return dateStr >= install && dateStr <= strike
    })
  }

  function getJobTypeForDay(j, dateStr) {
    const install = isoDate(j.cr55d_installdate)
    const strike = isoDate(j.cr55d_strikedate)
    if (dateStr === install) return 'Setup'
    if (dateStr === strike) return 'Takedown'
    return 'On-site'
  }

  return (
    <div>
      {/* Monday auto-generation prompt */}
      {autoGenPrompt && (
        <div className="callout callout-blue mb-12" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <span className="callout-icon">📋</span>
            <strong>Monday morning — time to generate this week's leader sheets?</strong>
            <div className="text-sm color-muted mt-2">Auto-generates a .docx with the 3-week lookahead for all crew leaders.</div>
          </div>
          <div className="flex gap-6">
            <button className="btn btn-primary btn-sm" onClick={async () => {
              try {
                await generateLeaderSheet(jobs, weekDates[0])
                const weekKey = toLocalISO(weekDates[0])
                localStorage.setItem('bpt_leader_sheet_last_gen', weekKey)
                setLastAutoGen(weekKey)
                setAutoGenPrompt(false)
              } catch(e) { console.error('[Leader Sheet Auto]', e) }
            }}>Generate Now</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAutoGenPrompt(false)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Header with generation buttons */}
      <div className="flex-between mb-12">
        <div>
          <span className="text-base color-muted">3-week lookahead — {windowJobs.length} jobs</span>
          <span className="text-md color-blue font-semibold ml-8">{leaders.length} crew leaders</span>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨️ Print</button>
          <button className="btn btn-primary btn-sm" onClick={async (ev) => {
            const btn = ev.currentTarget; btn.textContent = 'Generating...'; btn.disabled = true
            try {
              await generateLeaderSheet(jobs, weekDates[0])
              const weekKey = toLocalISO(weekDates[0])
              localStorage.setItem('bpt_leader_sheet_last_gen', weekKey)
              setLastAutoGen(weekKey)
              btn.textContent = '✓ Downloaded'
              setTimeout(() => { btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false }, 2000)
            } catch(e) { console.error('[Leader Sheet]', e); btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false }
          }}>📥 Leader Sheet .docx</button>
        </div>
      </div>

      {/* Crew leaders quick view */}
      {leaders.length > 0 && (
        <div className="card mb-12" style={{padding:'10px 14px'}}>
          <div className="text-sm font-bold color-muted text-upper mb-6">Crew Leaders</div>
          <div className="flex gap-6 flex-wrap">
            {LEADERS.map(l => {
              const color = LEADER_COLORS[l] || {}
              return <span key={l} className="badge" style={{fontSize:'11px',padding:'3px 10px',background:color.bg||'var(--bp-green-bg)',color:color.text||'var(--bp-green)'}}>{l}</span>
            })}
          </div>
        </div>
      )}

      {/* 3-week schedule preview */}
      {threeWeeks.map((week, wi) => (
        <div key={wi} className="card mb-12" style={{padding: 0, overflow: 'hidden'}}>
          {/* Week header */}
          <div style={{
            padding: '10px 16px',
            background: week.isTentative ? 'var(--bp-amber)' : 'var(--bp-navy)',
            color: week.isTentative ? '#92400e' : 'var(--bp-white)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{fontWeight: 700, fontSize: '14px'}}>
              Week of {formatDateShort(week.dates[0])} – {formatDateShort(week.dates[6])}, {week.dates[0].getFullYear()}
            </span>
            {week.isTentative && (
              <span style={{fontSize: '11px', fontWeight: 600}}>⚠ TENTATIVE — Subject to Change</span>
            )}
          </div>

          {/* Tentative disclaimer */}
          {week.isTentative && (
            <div style={{padding: '6px 16px', background: 'var(--bp-amber-bg)', fontSize: '11px', fontStyle: 'italic', color: '#92400e'}}>
              Schedule is tentative and subject to change. Confirm with your crew leader.
            </div>
          )}

          {/* Day-by-day breakdown */}
          <div style={{padding: '12px 16px'}}>
            {week.dates.map((date, di) => {
              const dateStr = toLocalISO(date)
              const dayJobs = getJobsForDay(dateStr)

              // Group by leader
              const byLeader = {}
              for (const j of dayJobs) {
                const leader = j.cr55d_pmassigned?.split(' ')[0] || j.cr55d_crewleader || 'Unassigned'
                if (!byLeader[leader]) byLeader[leader] = []
                byLeader[leader].push(j)
              }

              return (
                <div key={di} style={{marginBottom: di < 6 ? '12px' : 0}}>
                  <div style={{fontWeight: 700, fontSize: '13px', color: 'var(--bp-navy)', borderBottom: '2px solid var(--bp-blue)', paddingBottom: '3px', marginBottom: '6px'}}>
                    {formatFullDate(date)}
                  </div>
                  {dayJobs.length === 0 ? (
                    <div style={{fontStyle: 'italic', color: 'var(--bp-muted)', fontSize: '12px', paddingLeft: '16px'}}>No jobs scheduled</div>
                  ) : (
                    Object.entries(byLeader).map(([leader, leaderJobs]) => {
                      const color = LEADER_COLORS[leader] || {}
                      // Find delivery row for start time and crew size
                      const deliveryRow = deliveryRows.find(r => r.dayDate === dateStr && r.crewLeader === leader && !r._placeholder)
                      const startTime = deliveryRow?.startTime || ''
                      const crewSize = deliveryRow?.crewSize || leaderJobs[0]?.cr55d_crewcount || ''

                      return (
                        <div key={leader} style={{paddingLeft: '16px', marginBottom: '6px'}}>
                          <div style={{fontWeight: 700, fontSize: '12px', color: color.text || 'var(--bp-navy)'}}>
                            • Crew – {leader}
                            {startTime && <span style={{fontWeight: 400, color: 'var(--bp-muted)'}}> ({startTime})</span>}
                            {crewSize && <span style={{fontWeight: 400, color: 'var(--bp-muted)'}}>, {crewSize} crew</span>}
                          </div>
                          {leaderJobs.map(j => {
                            const jobType = getJobTypeForDay(j, dateStr)
                            const typeLabel = jobType === 'Setup' ? 'Up' : jobType === 'Takedown' ? 'Down' : 'On-site'
                            const acctMgr = getAcctMgrName(j.cr55d_salesrep)
                            return (
                              <div key={j.cr55d_jobid} style={{paddingLeft: '20px', fontSize: '12px', color: 'var(--bp-muted)', cursor: 'pointer'}}
                                onClick={() => onSelectJob?.(j)}>
                                ◦ {typeLabel} – <strong style={{color: 'var(--bp-navy)'}}>{j.cr55d_clientname || j.cr55d_jobname}</strong>
                                {j.cr55d_venuename && <span> at {j.cr55d_venuename}</span>}
                                {acctMgr && <span> ({acctMgr})</span>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })}
          </div>

          {/* Notes section for current week */}
          {!week.isTentative && (
            <div style={{borderTop: '1px solid var(--bp-border-lt)', padding: '12px 16px', background: 'var(--bp-alt)'}}>
              <div style={{fontWeight: 700, fontSize: '12px', color: 'var(--bp-navy)', marginBottom: '4px'}}>Notes / Huddle Items</div>
              <div style={{minHeight: '40px', color: 'var(--bp-muted)', fontSize: '12px', fontStyle: 'italic'}}>
                Use this space during morning huddles to capture key points.
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
