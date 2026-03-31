import { useState, useMemo } from 'react'
import { toLocalISO } from '../../utils/dateUtils'
import { LEADERS, LEADER_COLORS, TRUCK_TYPES, EMPLOYEES, canDrive } from '../../data/crewConstants'

/* ── Constants ─────────────────────────────────────────────────── */
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const TRUCK_COLS = TRUCK_TYPES.filter(t => t.key !== 'crew' && t.cdl)
const CDL_CLASSES = ['A','B','C','D']

function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/* ═══════════════════════════════════════════════════════════════════
   VALIDATION — Green/red check matrix
   Per leader x day: crew needed vs assigned, CDL coverage, auto notes.
   ═══════════════════════════════════════════════════════════════════ */
export default function ValidationGrid({ weekDates, jobs, staff, deliveryRows = [] }) {
  const [dismissed, setDismissed] = useState(new Set())
  const [showDetails, setShowDetails] = useState(null)

  const todayIndex = useMemo(() => {
    const today = new Date()
    return weekDates.findIndex(d => d.toDateString() === today.toDateString())
  }, [weekDates])

  // Build crew assignments from localStorage (matching CrewSchedule)
  const crewAssignments = useMemo(() => {
    try {
      const saved = localStorage.getItem('bpt_crew_schedule')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  }, [])

  // Employee roster with CDL
  const employees = useMemo(() => {
    if (staff.length > 0) {
      return staff.filter(s => s.cr55d_status === 306280000).map(s => ({
        id: s.cr55d_stafflistid,
        shortName: (s.cr55d_name?.split(',')[1] || s.cr55d_name || '').trim().split(' ')[0],
        cdl: s.cr55d_licensetype || '',
      }))
    }
    return EMPLOYEES.map(e => ({ id: e.fullName, shortName: e.name, cdl: e.cdl || '' }))
  }, [staff])

  // Per leader x day validation
  const matrix = useMemo(() => {
    const result = {}
    for (const leader of LEADERS) {
      result[leader] = {}
      for (let di = 0; di < 7; di++) {
        const dateStr = toLocalISO(weekDates[di])
        const dayRows = deliveryRows.filter(r => r.dayDate === dateStr && r.crewLeader === leader && !r._placeholder)
        const crewNeeded = dayRows.reduce((s, r) => s + (r.crewSize || 0), 0)

        // Truck demand by CDL class
        const truckDemand = { A: 0, B: 0, C: 0, D: 0 }
        for (const row of dayRows) {
          for (const t of TRUCK_COLS) { if (row[t.key] > 0 && t.cdl) truckDemand[t.cdl] += row[t.key] }
        }

        // Assigned employees
        const assigned = []
        for (const emp of employees) {
          const val = (crewAssignments[emp.id] || [])[di]
          if (val === leader) assigned.push(emp)
        }

        // CDL have (with cascade)
        const cdlHave = { A: 0, B: 0, C: 0, D: 0 }
        for (const emp of assigned) {
          if (emp.cdl) { for (const cls of CDL_CLASSES) { if (canDrive(emp.cdl, cls)) cdlHave[cls]++ } }
        }

        // Warnings
        const cdlWarnings = []
        for (const cls of CDL_CLASSES) {
          if (truckDemand[cls] > cdlHave[cls]) cdlWarnings.push(`Need ${truckDemand[cls] - cdlHave[cls]} ${cls}-class`)
        }

        let status = '—', statusColor = 'var(--bp-light)'
        const notes = []
        if (crewNeeded === 0 && dayRows.length === 0) { /* no jobs */ }
        else if (assigned.length >= crewNeeded && cdlWarnings.length === 0) {
          status = 'Full'; statusColor = 'var(--bp-green)'; notes.push('All good')
        } else {
          if (assigned.length < crewNeeded) {
            status = `SHORT ${crewNeeded - assigned.length}`; statusColor = 'var(--bp-red)'
            notes.push(`Short ${crewNeeded - assigned.length} crew`)
          } else { status = 'CDL Gap'; statusColor = 'var(--bp-amber)' }
          notes.push(...cdlWarnings)
        }

        result[leader][di] = { crewNeeded, crewAssigned: assigned.length, status, statusColor, truckDemand, cdlHave, cdlWarnings, notes, assigned }
      }
    }
    return result
  }, [deliveryRows, employees, crewAssignments, weekDates])

  // Stats
  const totalIssues = LEADERS.reduce((s, l) => s + weekDates.filter((_, di) => { const c = matrix[l]?.[di]; return c && c.crewNeeded > 0 && c.status !== 'Full' && c.status !== '—' }).length, 0)
  const totalFull = LEADERS.reduce((s, l) => s + weekDates.filter((_, di) => matrix[l]?.[di]?.status === 'Full').length, 0)

  return (
    <div>
      <div className="kpi-row-3 mb-12">
        <div className="kpi"><div className="kpi-label">Issues</div><div className="kpi-val" style={{color: totalIssues > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{totalIssues}</div><div className="kpi-sub">{totalIssues === 0 ? 'all clear' : 'need attention'}</div></div>
        <div className="kpi"><div className="kpi-label">Fully Staffed</div><div className="kpi-val color-green">{totalFull}</div><div className="kpi-sub">leader-days</div></div>
        <div className="kpi"><div className="kpi-label">Dismissed</div><div className="kpi-val">{dismissed.size}</div><div className="kpi-sub">manually cleared</div></div>
      </div>

      <div className="card card-flush" style={{overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table className="tbl tbl-fixed" style={{fontSize:'11px',minWidth:'900px'}}>
            <thead>
              <tr>
                <th style={{width:'100px',position:'sticky',left:0,zIndex:2,background:'var(--bp-white)'}}>Leader</th>
                {weekDates.map((d,di) => (
                  <th key={di} style={{textAlign:'center',minWidth:'110px',background:di===todayIndex?'rgba(37,99,235,.06)':''}}>
                    {DAYS_SHORT[di]}<br/><span style={{fontSize:'9px',opacity:.7}}>{formatDateShort(d)}</span>
                  </th>
                ))}
                <th style={{width:'180px'}}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {LEADERS.map(leader => {
                const color = LEADER_COLORS[leader] || {}
                const hasJobs = weekDates.some((_, di) => matrix[leader]?.[di]?.crewNeeded > 0)
                if (!hasJobs) return null
                return (
                  <tr key={leader}>
                    <td style={{fontWeight:700,color:color.text||'var(--bp-navy)',background:color.bg||'transparent',position:'sticky',left:0,zIndex:1}}>{leader}</td>
                    {weekDates.map((_, di) => {
                      const cell = matrix[leader]?.[di]
                      if (!cell || cell.crewNeeded === 0) return <td key={di} style={{textAlign:'center',color:'var(--bp-light)'}}>—</td>
                      const key = `${leader}-${di}`
                      const isDismissed = dismissed.has(key)
                      const isOk = cell.status === 'Full'
                      const isBad = cell.status.startsWith('SHORT') || cell.status === 'CDL Gap'
                      return (
                        <td key={di} style={{textAlign:'center',padding:'6px 4px',position:'relative',
                          background: isDismissed ? 'var(--bp-alt)' : isOk ? 'var(--bp-green-bg)' : isBad ? 'var(--bp-red-bg)' : 'transparent',
                        }}>
                          <div style={{fontWeight:700,fontSize:'12px',color:isDismissed?'var(--bp-green)':cell.statusColor}}>
                            {isDismissed ? '✓ OK' : cell.status}
                          </div>
                          <div style={{fontSize:'9px',color:'var(--bp-muted)',marginTop:'2px'}}>
                            {cell.crewAssigned}/{cell.crewNeeded} crew
                          </div>
                          {isBad && !isDismissed && (
                            <button className="btn btn-ghost" style={{fontSize:'9px',padding:'1px 4px',marginTop:'2px',color:'var(--bp-muted)'}}
                              onClick={() => setDismissed(prev => new Set([...prev, key]))}>dismiss</button>
                          )}
                        </td>
                      )
                    })}
                    <td style={{fontSize:'10px',lineHeight:1.4}}>
                      {weekDates.map((_,di) => {
                        const cell = matrix[leader]?.[di]
                        if (!cell || cell.crewNeeded === 0 || dismissed.has(`${leader}-${di}`)) return null
                        return cell.notes.filter(n => n !== 'All good').map((n,ni) => (
                          <div key={`${di}-${ni}`} style={{color:cell.statusColor,marginBottom:'2px'}}>
                            <span style={{fontWeight:600}}>{DAYS_SHORT[di]}:</span> {n}
                          </div>
                        ))
                      })}
                      {weekDates.every((_,di) => {
                        const c = matrix[leader]?.[di]
                        return !c || c.crewNeeded === 0 || c.status === 'Full' || c.status === '—' || dismissed.has(`${leader}-${di}`)
                      }) && <span style={{color:'var(--bp-green)',fontWeight:600}}>✓ All good</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
