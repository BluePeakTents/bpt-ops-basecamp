import { useState, useEffect, useMemo, useRef } from 'react'
import { toLocalISO } from '../../utils/dateUtils'
import { LEADERS, LEADER_COLORS, TRUCK_TYPES, EMPLOYEES, EMPLOYEE_CATEGORIES } from '../../data/crewConstants'

/* ── Constants ─────────────────────────────────────────────────── */
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAYS_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const TRUCK_COLS = TRUCK_TYPES.filter(t => t.key !== 'crew')

// Valid assignment values: leader first name, or status code
const STATUS_CODES = ['off', 'WH', 'OPT', 'on-call', 'tech', 'o/n']
const STATUS_COLORS_MAP = {
  off:      { bg: '#f3f4f6', text: '#6B7280' },
  WH:       { bg: 'rgba(139,115,85,.08)', text: '#8B7355' },
  OPT:      { bg: 'rgba(46,125,82,.08)', text: '#2E7D52' },
  'on-call': { bg: 'rgba(217,119,6,.08)', text: '#D97706' },
  tech:     { bg: 'rgba(121,150,170,.08)', text: '#5A7A90' },
  'o/n':    { bg: 'rgba(124,58,237,.06)', text: '#6D28D9' },
}

// All valid cell values
const VALID_VALUES = [...LEADERS, ...STATUS_CODES]

function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/* ═══════════════════════════════════════════════════════════════════
   CREW SCHEDULE — Employee assignment grid
   Section A: Truck requirements summary per leader per day
   Section B: Employee roster with leader-name cell assignments
   ═══════════════════════════════════════════════════════════════════ */
export default function CrewSchedule({ weekDates, staff, departments, deliveryRows = [], onRefreshStaff }) {
  // Assignments keyed by stafflistid → [7 values], loaded from localStorage
  const [assignments, setAssignments] = useState(() => {
    try {
      const saved = localStorage.getItem('bpt_crew_schedule')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {}
  })
  const [toast, setToast] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { empId, dayIdx }
  const [searchText, setSearchText] = useState('')
  const [collapsedDays, setCollapsedDays] = useState(new Set())
  const inputRef = useRef(null)

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('bpt_crew_schedule', JSON.stringify(assignments))
  }, [assignments])

  // Focus input when editing
  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus()
  }, [editingCell])

  // Employee roster — leaders first, then field workers
  const roster = useMemo(() => {
    // Prefer Dataverse staff if available, fall back to hardcoded
    const list = staff.length > 0
      ? staff.filter(s => s.cr55d_status === 306280000).map(s => ({
          id: s.cr55d_stafflistid,
          name: s.cr55d_name?.split(',').reverse().map(p => p.trim()).join(' ') || s.cr55d_name || '',
          shortName: (s.cr55d_name?.split(',')[1] || s.cr55d_name || '').trim().split(' ')[0],
          cdl: s.cr55d_licensetype || '',
          isLead: s.cr55d_islead,
          dept: s.cr55d_department,
        }))
      : EMPLOYEES.map(e => ({
          id: e.fullName,
          name: e.fullName,
          shortName: e.name,
          cdl: e.cdl || '',
          isLead: e.isLead,
          dept: e.category === 'leaders' ? 'leaders' : 'field',
        }))

    // Sort: leaders first, then by name
    return list.sort((a, b) => {
      if (a.isLead && !b.isLead) return -1
      if (!a.isLead && b.isLead) return 1
      return a.name.localeCompare(b.name)
    })
  }, [staff])

  const leaders = roster.filter(e => e.isLead)
  const fieldWorkers = roster.filter(e => !e.isLead)

  function getAssignment(empId, dayIdx) {
    return (assignments[empId] || [])[dayIdx] || ''
  }

  function setAssignment(empId, dayIdx, value) {
    setAssignments(prev => {
      const cur = prev[empId] || Array(7).fill('')
      const next = [...cur]
      next[dayIdx] = value
      return { ...prev, [empId]: next }
    })
  }

  // Autocomplete matches
  const autocompleteOptions = useMemo(() => {
    if (!searchText || searchText.length < 2) return []
    const q = searchText.toLowerCase()
    return VALID_VALUES.filter(v => v.toLowerCase().startsWith(q) || v.toLowerCase().includes(q))
  }, [searchText])

  function handleCellClick(empId, dayIdx) {
    setEditingCell({ empId, dayIdx })
    setSearchText(getAssignment(empId, dayIdx))
  }

  function handleCellKeyDown(e, empId, dayIdx) {
    if (e.key === 'Enter') {
      commitCell(empId, dayIdx, searchText)
    } else if (e.key === 'Escape') {
      setEditingCell(null)
      setSearchText('')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitCell(empId, dayIdx, searchText)
      // Move to next day
      const nextDay = (dayIdx + 1) % 7
      setEditingCell({ empId, dayIdx: nextDay })
      setSearchText(getAssignment(empId, nextDay))
    }
  }

  function commitCell(empId, dayIdx, value) {
    const trimmed = value.trim()
    // Validate: must be a valid leader name or status code, or empty
    if (trimmed && !VALID_VALUES.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      // Partial match? Use first match
      const match = VALID_VALUES.find(v => v.toLowerCase().startsWith(trimmed.toLowerCase()))
      setAssignment(empId, dayIdx, match || '')
    } else {
      // Exact match (case-insensitive normalize)
      const exact = VALID_VALUES.find(v => v.toLowerCase() === trimmed.toLowerCase())
      setAssignment(empId, dayIdx, exact || '')
    }
    setEditingCell(null)
    setSearchText('')
  }

  function selectOption(empId, dayIdx, option) {
    setAssignment(empId, dayIdx, option)
    setEditingCell(null)
    setSearchText('')
  }

  // Toggle day column visibility
  function toggleDay(di) {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(di)) next.delete(di)
      else next.add(di)
      return next
    })
  }

  // ── Section A: Truck requirements per leader per day (from delivery rows) ──
  const leaderTruckSummary = useMemo(() => {
    const summary = {}
    for (const leader of LEADERS) {
      summary[leader] = {}
      for (let di = 0; di < 7; di++) {
        const dateStr = toLocalISO(weekDates[di])
        const dayRows = deliveryRows.filter(r => r.dayDate === dateStr && r.crewLeader === leader && !r._placeholder)
        const trucks = {}
        for (const t of TRUCK_COLS) trucks[t.key] = dayRows.reduce((s, r) => s + (r[t.key] || 0), 0)
        trucks.crewSize = dayRows.reduce((s, r) => s + (r.crewSize || 0), 0)
        summary[leader][di] = trucks
      }
    }
    return summary
  }, [deliveryRows, weekDates])

  // ── Section B stats: counts per day ──
  const dailyStats = useMemo(() => {
    const stats = Array.from({ length: 7 }, () => ({
      byLeader: {},
      byStatus: { off: 0, WH: 0, OPT: 0, 'on-call': 0, tech: 0, 'o/n': 0 },
      totalAssigned: 0,
      totalFilled: 0,
    }))
    for (const emp of roster) {
      for (let di = 0; di < 7; di++) {
        const val = getAssignment(emp.id, di)
        if (!val) continue
        stats[di].totalFilled++
        if (val === 'off') {
          stats[di].byStatus.off++
        } else {
          stats[di].totalAssigned++
          if (STATUS_CODES.includes(val)) {
            stats[di].byStatus[val]++
          } else {
            // Leader name
            stats[di].byLeader[val] = (stats[di].byLeader[val] || 0) + 1
          }
        }
      }
    }
    return stats
  }, [roster, assignments])

  // Days worked per employee (exclude 'off', count OPT as working)
  function getDaysWorked(empId) {
    const vals = assignments[empId] || []
    return vals.filter(v => v && v !== 'off').length
  }

  const todayIndex = useMemo(() => {
    const today = new Date()
    return weekDates.findIndex(d => d.toDateString() === today.toDateString())
  }, [weekDates])

  // Visible days (non-collapsed)
  const visibleDays = Array.from({ length: 7 }, (_, i) => i).filter(i => !collapsedDays.has(i))

  return (
    <div>
      {/* Section A: Truck Requirements Summary per Leader per Day */}
      <div className="card mb-12" style={{padding: 0, overflow: 'hidden'}}>
        <div style={{padding: '10px 16px', background: 'var(--bp-navy)', color: 'var(--bp-white)', fontWeight: 700, fontSize: '13px', letterSpacing: '.04em'}}>
          TRUCK REQUIREMENTS BY LEADER
        </div>
        <div style={{overflowX: 'auto'}}>
          <table className="tbl tbl-fixed" style={{fontSize: '11px', minWidth: '900px'}}>
            <thead>
              <tr>
                <th style={{width: '100px'}}>Leader</th>
                {weekDates.map((d, di) => (
                  <th key={di} style={{textAlign: 'center', cursor: 'pointer', background: di === todayIndex ? 'rgba(37,99,235,.06)' : ''}} onClick={() => toggleDay(di)}>
                    {DAYS_SHORT[di]} <span style={{fontSize: '9px', opacity: .7}}>{formatDateShort(d)}</span>
                    {collapsedDays.has(di) && <span style={{marginLeft: '4px', fontSize: '10px'}}>+</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEADERS.map(leader => {
                const color = LEADER_COLORS[leader] || {}
                const hasAnyData = weekDates.some((_, di) => leaderTruckSummary[leader]?.[di]?.crewSize > 0)
                if (!hasAnyData) return null
                return (
                  <tr key={leader}>
                    <td style={{fontWeight: 600, color: color.text || 'var(--bp-navy)', background: color.bg || 'transparent'}}>{leader}</td>
                    {weekDates.map((_, di) => {
                      if (collapsedDays.has(di)) return <td key={di} style={{textAlign: 'center', color: 'var(--bp-light)'}}>—</td>
                      const data = leaderTruckSummary[leader]?.[di] || {}
                      if (!data.crewSize) return <td key={di} style={{textAlign: 'center', color: 'var(--bp-light)'}}>—</td>
                      const truckList = TRUCK_COLS.filter(t => data[t.key] > 0).map(t => `${data[t.key]}${t.abbrev}`).join(', ')
                      return (
                        <td key={di} style={{textAlign: 'center', fontSize: '10px'}}>
                          <span style={{fontWeight: 700, color: 'var(--bp-navy)'}}>{data.crewSize}</span>
                          {truckList && <span style={{color: 'var(--bp-muted)', marginLeft: '4px'}}>{truckList}</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section B: Employee Assignment Grid */}
      <div className="card card-flush" style={{overflow: 'hidden'}}>
        <div style={{padding: '10px 16px', background: 'var(--bp-navy)', color: 'var(--bp-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span style={{fontWeight: 700, fontSize: '13px', letterSpacing: '.04em'}}>EMPLOYEE ASSIGNMENTS</span>
          <span style={{fontSize: '11px', opacity: .8}}>{roster.length} employees · {leaders.length} leaders</span>
        </div>

        {/* Daily summary row */}
        <div style={{overflowX: 'auto'}}>
          <table className="tbl tbl-fixed" style={{fontSize: '11px', minWidth: '900px'}}>
            <thead>
              <tr>
                <th style={{width: '40px'}}>#</th>
                <th style={{width: '160px'}}>Employee</th>
                <th style={{width: '40px'}}>CDL</th>
                <th style={{width: '36px'}}>Days</th>
                {weekDates.map((d, di) => {
                  if (collapsedDays.has(di)) return <th key={di} style={{width: '30px', textAlign: 'center', cursor: 'pointer'}} onClick={() => toggleDay(di)}>+</th>
                  return (
                    <th key={di} style={{textAlign: 'center', cursor: 'pointer', background: di === todayIndex ? 'rgba(37,99,235,.06)' : '', minWidth: '80px'}} onClick={() => toggleDay(di)}>
                      {DAYS_SHORT[di]}<br/><span style={{fontSize: '9px', opacity: .7}}>{formatDateShort(d)}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {/* Leaders / CDL Drivers section */}
              <tr>
                <td colSpan={4 + visibleDays.length + collapsedDays.size} style={{background: 'var(--bp-green)', color: 'var(--bp-white)', fontWeight: 700, fontSize: '11px', letterSpacing: '.04em', padding: '6px 12px'}}>
                  LEADERS / CDL DRIVERS ({leaders.length})
                </td>
              </tr>
              {leaders.map((emp, idx) => (
                <EmployeeRow
                  key={emp.id} emp={emp} idx={idx + 1} weekDates={weekDates}
                  getAssignment={getAssignment} editingCell={editingCell}
                  searchText={searchText} autocompleteOptions={autocompleteOptions}
                  onCellClick={handleCellClick} onKeyDown={handleCellKeyDown}
                  onSearchChange={setSearchText} onSelectOption={selectOption}
                  inputRef={inputRef} getDaysWorked={getDaysWorked}
                  todayIndex={todayIndex} collapsedDays={collapsedDays}
                />
              ))}

              {/* Field Workers section */}
              <tr>
                <td colSpan={4 + visibleDays.length + collapsedDays.size} style={{background: 'var(--bp-blue)', color: 'var(--bp-white)', fontWeight: 700, fontSize: '11px', letterSpacing: '.04em', padding: '6px 12px'}}>
                  FIELD WORKERS ({fieldWorkers.length})
                </td>
              </tr>
              {fieldWorkers.map((emp, idx) => (
                <EmployeeRow
                  key={emp.id} emp={emp} idx={leaders.length + idx + 1} weekDates={weekDates}
                  getAssignment={getAssignment} editingCell={editingCell}
                  searchText={searchText} autocompleteOptions={autocompleteOptions}
                  onCellClick={handleCellClick} onKeyDown={handleCellKeyDown}
                  onSearchChange={setSearchText} onSelectOption={selectOption}
                  inputRef={inputRef} getDaysWorked={getDaysWorked}
                  todayIndex={todayIndex} collapsedDays={collapsedDays}
                />
              ))}

              {/* Daily totals row */}
              <tr style={{borderTop: '2px solid var(--bp-border)', fontWeight: 700, background: 'var(--bp-alt)'}}>
                <td colSpan={3} style={{fontWeight: 700}}>TOTALS</td>
                <td></td>
                {weekDates.map((_, di) => {
                  if (collapsedDays.has(di)) return <td key={di} style={{textAlign: 'center'}}>—</td>
                  const s = dailyStats[di]
                  return (
                    <td key={di} style={{textAlign: 'center', fontSize: '10px', lineHeight: 1.4}}>
                      <div style={{fontWeight: 700, color: 'var(--bp-navy)', fontSize: '13px'}}>{s.totalAssigned}</div>
                      <div style={{color: 'var(--bp-muted)'}}>
                        {s.byStatus.off > 0 && <span>{s.byStatus.off} off · </span>}
                        {s.byStatus.WH > 0 && <span>{s.byStatus.WH} WH · </span>}
                        {s.byStatus.OPT > 0 && <span>{s.byStatus.OPT} OPT · </span>}
                        {s.byStatus.tech > 0 && <span>{s.byStatus.tech} tech · </span>}
                        {s.totalFilled} filled
                      </div>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex-between mt-12">
        <div className="text-md color-muted">{roster.length} employees · {leaders.length} leaders · {fieldWorkers.length} field</div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => {
            setToast('Schedule saved')
            setTimeout(() => setToast(null), 3000)
          }}>Save Schedule</button>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const rows = [['#','Employee','CDL','Days',...DAYS_SHORT]]
            roster.forEach((emp, i) => {
              const days = getDaysWorked(emp.id)
              rows.push([i + 1, emp.name, emp.cdl, days, ...weekDates.map((_, di) => getAssignment(emp.id, di))])
            })
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
            const link = document.createElement('a'); const blob = new Blob([csv], {type: 'text/csv'})
            link.href = URL.createObjectURL(blob); link.download = `crew_schedule_${toLocalISO(weekDates[0])}.csv`; link.click(); URL.revokeObjectURL(link.href)
          }}>Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            // Paylocity-formatted export: Employee #, Full Name, Department, CDL, Week Start, daily hours/status
            const PAYLOCITY_DEPT_MAP = {
              leaders: '100 - Field Operations', field: '100 - Field Operations',
              warehouse: '200 - Warehouse', loaders: '200 - Warehouse',
              vinyl: '300 - Vinyl', sub: '400 - Sub-Contract',
            }
            const STATUS_TO_HOURS = { off: 0, wh: 8, opt: 8, 'on-call': 0, tech: 8, 'o/n': 12 }
            const weekStartISO = toLocalISO(weekDates[0])
            const header = ['Employee_Number','Full_Name','Department','CDL_Class','Week_Start',
              'Mon_Hours','Mon_Code','Tue_Hours','Tue_Code','Wed_Hours','Wed_Code',
              'Thu_Hours','Thu_Code','Fri_Hours','Fri_Code','Sat_Hours','Sat_Code','Sun_Hours','Sun_Code',
              'Total_Hours','Total_Days']
            const dataRows = roster.map((emp, i) => {
              const days = []
              let totalHours = 0, totalDays = 0
              for (let di = 0; di < 7; di++) {
                const val = getAssignment(emp.id, di).toLowerCase().trim()
                let hours = 0, code = val || ''
                if (!val || val === 'off') { hours = 0; code = 'OFF' }
                else if (STATUS_TO_HOURS[val] !== undefined) { hours = STATUS_TO_HOURS[val]; code = val.toUpperCase() }
                else { hours = 8; code = 'FIELD' } // assigned to a leader = 8 hrs field work
                days.push(hours, code)
                totalHours += hours
                if (hours > 0) totalDays++
              }
              const dept = PAYLOCITY_DEPT_MAP[emp.dept] || '100 - Field Operations'
              return [i + 1, emp.name, dept, emp.cdl || 'NL', weekStartISO, ...days, totalHours, totalDays]
            })
            const allRows = [header, ...dataRows]
            const csv = allRows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
            const link = document.createElement('a'); const blob = new Blob([csv], {type: 'text/csv'})
            link.href = URL.createObjectURL(blob); link.download = `paylocity_import_${weekStartISO}.csv`; link.click(); URL.revokeObjectURL(link.href)
            setToast('Paylocity export downloaded')
            setTimeout(() => setToast(null), 3000)
          }}>Export Paylocity</button>
        </div>
      </div>

      {toast && <div className="toast show success"><span>{toast}</span></div>}
    </div>
  )
}

/* ── Employee Row Sub-component ────────────────────────────────── */
function EmployeeRow({ emp, idx, weekDates, getAssignment, editingCell, searchText, autocompleteOptions, onCellClick, onKeyDown, onSearchChange, onSelectOption, inputRef, getDaysWorked, todayIndex, collapsedDays }) {
  const daysWorked = getDaysWorked(emp.id)
  const dayColor = daysWorked >= 7 ? 'var(--bp-red)' : daysWorked >= 6 ? 'var(--bp-amber)' : 'var(--bp-green)'

  return (
    <tr>
      <td style={{color: 'var(--bp-muted)', fontSize: '10px', textAlign: 'center'}}>{idx}</td>
      <td>
        <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
          <span style={{fontWeight: 600, fontSize: '12px'}}>{emp.shortName || emp.name}</span>
          {emp.isLead && <span style={{fontSize: '8px', fontWeight: 700, color: 'var(--bp-white)', background: 'var(--bp-green)', padding: '1px 4px', borderRadius: '3px'}}>LEAD</span>}
        </div>
      </td>
      <td style={{textAlign: 'center', fontSize: '10px', color: 'var(--bp-muted)', fontWeight: 600}}>{emp.cdl || '—'}</td>
      <td style={{textAlign: 'center', fontFamily: 'var(--bp-mono)', fontWeight: 700, fontSize: '12px', color: dayColor}}>{daysWorked}</td>
      {weekDates.map((_, di) => {
        if (collapsedDays.has(di)) return <td key={di} style={{textAlign: 'center', color: 'var(--bp-light)'}}>·</td>
        const val = getAssignment(emp.id, di)
        const isEditing = editingCell?.empId === emp.id && editingCell?.dayIdx === di
        const isLeaderAssignment = LEADERS.includes(val)
        const isStatus = STATUS_CODES.includes(val)
        const cellColor = isLeaderAssignment ? (LEADER_COLORS[val] || {}) : isStatus ? (STATUS_COLORS_MAP[val] || {}) : {}

        return (
          <td key={di}
            style={{
              textAlign: 'center', padding: '2px 4px', cursor: 'pointer', position: 'relative',
              background: di === todayIndex ? 'rgba(37,99,235,.04)' : (cellColor.bg || 'transparent'),
            }}
            onClick={() => !isEditing && onCellClick(emp.id, di)}
          >
            {isEditing ? (
              <div style={{position: 'relative'}}>
                <input
                  ref={inputRef}
                  className="form-input"
                  value={searchText}
                  onChange={e => onSearchChange(e.target.value)}
                  onKeyDown={e => onKeyDown(e, emp.id, di)}
                  onBlur={() => {
                    // Delay to allow option click
                    setTimeout(() => {
                      if (editingCell?.empId === emp.id && editingCell?.dayIdx === di) {
                        onSelectOption(emp.id, di, searchText.trim() ? (VALID_VALUES.find(v => v.toLowerCase().startsWith(searchText.toLowerCase())) || '') : '')
                      }
                    }, 200)
                  }}
                  style={{fontSize: '11px', padding: '2px 4px', width: '70px', textAlign: 'center'}}
                  placeholder="type..."
                />
                {autocompleteOptions.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bp-white)', border: '1px solid var(--bp-border)', borderRadius: '6px',
                    boxShadow: 'var(--bp-shadow-md)', zIndex: 50, maxHeight: '160px', overflowY: 'auto',
                    minWidth: '100px', fontSize: '11px',
                  }}>
                    {autocompleteOptions.slice(0, 10).map(opt => (
                      <div key={opt}
                        style={{
                          padding: '4px 10px', cursor: 'pointer',
                          background: LEADER_COLORS[opt]?.bg || STATUS_COLORS_MAP[opt]?.bg || 'transparent',
                          color: LEADER_COLORS[opt]?.text || STATUS_COLORS_MAP[opt]?.text || 'var(--bp-navy)',
                          fontWeight: 600,
                        }}
                        onMouseDown={e => { e.preventDefault(); onSelectOption(emp.id, di, opt) }}
                      >
                        {opt}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span style={{
                display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                minWidth: '40px', minHeight: '20px',
                background: cellColor.bg || 'transparent',
                color: cellColor.text || (val ? 'var(--bp-navy)' : 'var(--bp-light)'),
              }}>
                {val || '·'}
              </span>
            )}
          </td>
        )
      })}
    </tr>
  )
}
