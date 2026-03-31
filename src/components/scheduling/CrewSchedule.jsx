import { useState, useEffect, useMemo } from 'react'
import { toLocalISO } from '../../utils/dateUtils'

/* ── Constants ─────────────────────────────────────────────────── */
const DEPT_LABELS = { 306280000: 'Executive', 306280001: 'Ops Mgmt', 306280002: 'Sales', 306280003: 'Vinyl', 306280004: 'Loading', 306280005: 'Crew Member', 306280006: 'Warehouse', 306280007: 'Admin', 306280008: 'Marketing', 306280009: 'Finance', 306280010: 'Crew Leader' }
const OPS_DEPTS = new Set([306280001, 306280003, 306280004, 306280005, 306280006, 306280010])
const DEPT_COLORS = { 306280001: '#1D3A6B', 306280003: '#8B5CF6', 306280004: '#D97706', 306280005: '#2B4F8A', 306280006: '#6B7280', 306280010: '#2E7D52' }
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function getStaffInitials(name) {
  if (!name) return '?'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return (parts[1][0] || '') + (parts[0][0] || '')
  return name.split(' ').map(n => n[0]).join('').substring(0, 2)
}

function getStaffDisplayName(name) {
  if (!name) return '\u2014'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

/* ── Component ─────────────────────────────────────────────────── */
export default function CrewSchedule({ weekDates, staff, departments, onRefreshStaff }) {
  const deptList = useMemo(() => {
    const deptSet = new Set(staff.map(s => s.cr55d_department).filter(Boolean))
    return Array.from(deptSet).filter(d => OPS_DEPTS.has(d)).sort((a, b) => (DEPT_LABELS[a] || '').localeCompare(DEPT_LABELS[b] || ''))
  }, [staff])

  const [activeDepts, setActiveDepts] = useState([])
  const [schedules, setSchedules] = useState(() => {
    try {
      const saved = localStorage.getItem('bpt_schedule_draft')
      if (saved) { const parsed = JSON.parse(saved); if (parsed.schedules) return parsed.schedules }
    } catch {}
    return {}
  })
  const [toast, setToast] = useState(null)
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => {
    if (deptList.length > 0 && activeDepts.length === 0) setActiveDepts(deptList)
  }, [deptList])

  // Local schedule state keyed by stafflistid
  function getSchedule(id) { return schedules[id] || Array(7).fill(false) }
  function toggleDay(id, di) {
    setSchedules(prev => {
      const cur = prev[id] || Array(7).fill(false)
      return { ...prev, [id]: cur.map((v, i) => i === di ? !v : v) }
    })
  }

  const todayIndex = useMemo(() => {
    const today = new Date()
    return weekDates.findIndex(d => d.toDateString() === today.toDateString())
  }, [weekDates])

  const activeStaff = useMemo(() => staff.filter(s => activeDepts.includes(s.cr55d_department)), [staff, activeDepts])

  const stats = useMemo(() => {
    const scheduledToday = todayIndex >= 0 ? activeStaff.filter(s => getSchedule(s.cr55d_stafflistid)[todayIndex]).length : 0
    const totalDays = activeStaff.reduce((s, e) => s + getSchedule(e.cr55d_stafflistid).filter(Boolean).length, 0)
    const avgDays = activeStaff.length ? (totalDays / activeStaff.length).toFixed(1) : 0
    const overloaded = activeStaff.filter(e => getSchedule(e.cr55d_stafflistid).filter(Boolean).length >= 6).length
    return { total: activeStaff.length, scheduledToday, avgDays, overloaded }
  }, [activeStaff, schedules, todayIndex])

  function toggleDept(code) {
    setActiveDepts(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const GRID_COLS = '240px 50px 44px repeat(7,1fr)'

  if (staff.length === 0) {
    return <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Loading crew roster...</div></div>
  }

  return (
    <div>
      {/* Department toggles */}
      <div className="card mb-12" style={{padding:'12px 16px'}}>
        <div className="flex-between mb-8">
          <span className="text-md font-bold color-muted text-upper">Departments ({activeStaff.length} crew)</span>
          <div className="flex gap-4">
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts(deptList)}>All</button>
            <button className="btn btn-ghost btn-xs" onClick={() => setActiveDepts([])}>None</button>
          </div>
        </div>
        <div className="flex gap-6 flex-wrap">
          {deptList.map(deptVal => {
            const count = staff.filter(s => s.cr55d_department === deptVal).length
            const color = DEPT_COLORS[deptVal] || '#6B7280'
            const isActive = activeDepts.includes(deptVal)
            return (
              <button key={deptVal} className={`pill${isActive ? ' active' : ''}`}
                style={{padding:'5px 14px',borderColor: isActive ? color : undefined, background: isActive ? color : undefined}}
                onClick={() => toggleDept(deptVal)}>
                <span className="dept-pill-dot" style={{background: isActive ? '#fff' : color}}></span>
                {DEPT_LABELS[deptVal] || 'Unknown'} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Headcount</div><div className="kpi-val">{stats.total}</div><div className="kpi-sub">in {activeDepts.length} depts</div></div>
        <div className="kpi"><div className="kpi-label">Scheduled Today</div><div className="kpi-val color-green">{stats.scheduledToday}</div><div className="kpi-sub">of {stats.total} active</div></div>
        <div className="kpi"><div className="kpi-label">Avg Days / Person</div><div className="kpi-val">{stats.avgDays}</div><div className="kpi-sub">this week</div></div>
        <div className="kpi"><div className="kpi-label">Overloaded</div><div className="kpi-val" style={{color: stats.overloaded > 0 ? 'var(--bp-red)' : 'var(--bp-green)'}}>{stats.overloaded}</div><div className="kpi-sub">6+ days scheduled</div></div>
      </div>

      {/* Schedule grid */}
      <div className="card card-flush">
        <div className="crew-grid">
          <div className="crew-header-row" style={{gridTemplateColumns:GRID_COLS}}>
            <div className="crew-header-cell" style={{textAlign:'left'}}>Employee</div>
            <div className="crew-header-cell">License</div>
            <div className="crew-header-cell">Days</div>
            {weekDates.map((d, i) => (
              <div key={i} className={`crew-header-cell${i === todayIndex ? ' today' : ''}`}>
                {DAYS_SHORT[i]}<br/><span className="text-2xs" style={{opacity:.7}}>{formatDateShort(d)}</span>
              </div>
            ))}
          </div>

          {activeDepts.map(deptVal => {
            const deptStaff = staff.filter(s => s.cr55d_department === deptVal)
            const color = DEPT_COLORS[deptVal] || '#6B7280'
            const deptAvg = deptStaff.length ? (deptStaff.reduce((s, e) => s + getSchedule(e.cr55d_stafflistid).filter(Boolean).length, 0) / deptStaff.length).toFixed(1) : 0
            return (
              <div key={deptVal}>
                <div className="text-sm font-bold" style={{gridColumn:'1/-1',background:color,color:'var(--bp-white)',padding:'6px 14px',letterSpacing:'.04em',textTransform:'uppercase',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span>{DEPT_LABELS[deptVal] || 'Unknown'} ({deptStaff.length} crew)</span>
                  <span className="text-2xs font-medium" style={{opacity:.8,textTransform:'none'}}>avg {deptAvg} days</span>
                </div>
                {deptStaff.map(emp => {
                  const sched = getSchedule(emp.cr55d_stafflistid)
                  const dayCount = sched.filter(Boolean).length
                  const dayColor = dayCount >= 7 ? 'red' : dayCount >= 6 ? 'amber' : dayCount <= 2 ? 'light' : 'green'
                  return (
                    <div key={emp.cr55d_stafflistid} className="crew-row" style={{gridTemplateColumns:GRID_COLS}}>
                      <div className="crew-name-cell">
                        <span className="text-2xs font-bold color-navy" style={{width:'26px',height:'26px',borderRadius:'6px',background:'var(--bp-navy-bg)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {getStaffInitials(emp.cr55d_name)}
                        </span>
                        <div style={{minWidth:0}}>
                          <div className="text-base font-semibold" style={{display:'flex',alignItems:'center',gap:'5px'}}>
                            {getStaffDisplayName(emp.cr55d_name)}
                            {emp.cr55d_islead && <span className="font-bold" style={{fontSize:'10px',color:'var(--bp-white)',background:'var(--bp-green)',padding:'1px 4px',borderRadius:'3px',textTransform:'uppercase'}}>Lead</span>}
                          </div>
                          <div style={{display:'flex',gap:'4px',marginTop:'1px'}}>
                            {emp.cr55d_employeeid && <span className="color-muted font-mono" style={{fontSize:'10px'}}>#{emp.cr55d_employeeid}</span>}
                          </div>
                        </div>
                        {dayCount >= 6 && <span className="crew-warning ml-auto">&#9888; {dayCount}d</span>}
                      </div>
                      <div className="crew-day-cell">
                        <span className="crew-license">{emp.cr55d_licensetype || '\u2014'}</span>
                      </div>
                      <div className={`crew-days-cell ${dayColor}`}>
                        {dayCount}/7
                      </div>
                      {sched.map((assigned, di) => (
                        <div key={di} className={`crew-day-cell${di === todayIndex ? ' today' : ''}`}>
                          <div className={`crew-toggle${assigned ? ' active' : ''}`}
                            onClick={() => toggleDay(emp.cr55d_stafflistid, di)}>
                            {assigned && '\u2713'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-between mt-12">
        <div className="text-md color-muted">
          {activeStaff.length} employees across {activeDepts.length} departments
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" disabled={savingSchedule} onClick={() => {
            setSavingSchedule(true)
            const weekKey = toLocalISO(weekDates[0])
            localStorage.setItem('bpt_schedule_draft', JSON.stringify({ saved: new Date().toISOString(), weekKey, schedules }))
            setTimeout(() => setSavingSchedule(false), 2000)
          }}>{savingSchedule ? '✓ Saved' : 'Save Schedule'}</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            const rows = [['Employee','Department','License','Mon','Tue','Wed','Thu','Fri','Sat','Sun','Days']]
            activeStaff.forEach(emp => {
              const sched = getSchedule(emp.cr55d_stafflistid)
              const dayCount = sched.filter(Boolean).length
              const deptLabel = DEPT_LABELS[emp.cr55d_department] || ''
              rows.push([
                getStaffDisplayName(emp.cr55d_name), deptLabel, emp.cr55d_licensetype || '',
                ...sched.map(v => v ? 'Y' : ''), String(dayCount)
              ])
            })
            const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
            const link = document.createElement('a'); const blob = new Blob([csv], {type:'text/csv'})
            link.href = URL.createObjectURL(blob); link.download = `crew_schedule_${toLocalISO(weekDates[0])}.csv`; link.click(); URL.revokeObjectURL(link.href)
          }}>Export CSV</button>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="toast show success"><span>{toast}</span></div>}

    </div>
  )
}
