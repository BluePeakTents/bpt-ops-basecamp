import { useState, useEffect, useMemo } from 'react'
import { dvFetch, dvPost, dvPatch } from '../../hooks/useDataverse'
import { toLocalISO, isoDate } from '../../utils/dateUtils'
import { LEADERS, LEADER_COLORS, TRUCK_TYPES, ACCOUNT_MANAGERS, JOB_TYPES, DELIVERY_STATUSES, STATUS_COLORS, ACCT_MGR_COLORS, WEEKLY_COLS, DAYS_FULL, EMPLOYEES } from '../../data/crewConstants'
import { generateDriverSheets } from '../../utils/generateDriverSheet'

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function getDayLabel(d) {
  return DAYS_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1]
}

function formatFullDate(d) {
  return `${getDayLabel(d)}, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
}

/* ── Truck columns (from spec 3.3) ─────────────────────────────── */
const TRUCK_COLS = TRUCK_TYPES.filter(t => t.key !== 'crew')

/* ── Empty Row Template ────────────────────────────────────────── */
function emptyRow(dateStr, dayLabel) {
  const row = {
    _id: null,          // Dataverse ID (null = unsaved)
    _dirty: true,
    dayDate: dateStr,
    dayLabel,
    crewLeader: '',
    startTime: '',
    arrivalWindow: '',
    jobType: 'Setup',
    deliveryStatus: 'Needs Confirmation',
    accountManager: '',
    jobName: '',
    fullAddress: '',
    tentStructure: '',
    additionalDetails: '',
    estDriveTime: '',
    crewNotes: '',
    crewSize: 0,
  }
  // Truck columns default to 0
  for (const t of TRUCK_COLS) row[t.key] = 0
  return row
}

/* ═══════════════════════════════════════════════════════════════════
   DELIVERY SCHEDULE — Weekly logistics hub
   Defines what's happening per day: which crews, where, what trucks.
   ═══════════════════════════════════════════════════════════════════ */
export default function DeliverySchedule({ weekDates, jobs, staff, onSelectJob, onRowsChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [expandedDays, setExpandedDays] = useState(new Set(weekDates.map(d => toLocalISO(d))))

  const weekStart = toLocalISO(weekDates[0])
  const weekEnd = toLocalISO(weekDates[6])

  // Auto-populate rows from PM calendar jobs for this week
  useEffect(() => {
    generateRowsFromJobs()
  }, [jobs, weekDates])

  function generateRowsFromJobs() {
    setLoading(true)
    const generated = []

    for (const d of weekDates) {
      const dateStr = toLocalISO(d)
      const dayLabel = getDayLabel(d)
      const dayJobs = jobs.filter(j => {
        if (!j.cr55d_installdate) return false
        const install = isoDate(j.cr55d_installdate)
        const strike = isoDate(j.cr55d_strikedate) || install
        return dateStr >= install && dateStr <= strike
      })

      for (const j of dayJobs) {
        const isInstallDay = isoDate(j.cr55d_installdate) === dateStr
        const isStrikeDay = isoDate(j.cr55d_strikedate) === dateStr
        // Map sales rep code to account manager name
        const repCode = (j.cr55d_salesrep || '').split('-')[0]
        const ACCT_CODES = { DC: 'Dave', GH: 'Glen', DP: 'Desiree', KT: 'Kyle', LH: 'Larrisa' }
        const acctMgr = ACCT_CODES[repCode] || j.cr55d_salesrep || ''

        generated.push({
          ...emptyRow(dateStr, dayLabel),
          _dirty: false,
          _jobId: j.cr55d_jobid,
          crewLeader: j.cr55d_pmassigned?.split(' ')[0] || j.cr55d_crewleader || '',
          jobType: isStrikeDay && !isInstallDay ? 'Takedown' : 'Setup',
          deliveryStatus: 'Confirmed',
          accountManager: acctMgr,
          jobName: j.cr55d_clientname || j.cr55d_jobname || '',
          fullAddress: j.cr55d_venueaddress || '',
          tentStructure: '',
          crewSize: j.cr55d_crewcount || 0,
        })
      }

      // If no jobs for this day, still show an empty add-row
      if (dayJobs.length === 0) {
        generated.push({ ...emptyRow(dateStr, dayLabel), _placeholder: true })
      }
    }

    setRows(generated)
    if (onRowsChange) onRowsChange(generated)
    setLoading(false)
  }

  // Group rows by day
  const dayGroups = useMemo(() => {
    const groups = []
    let currentDate = null
    let currentGroup = null

    for (const row of rows) {
      if (row.dayDate !== currentDate) {
        currentDate = row.dayDate
        currentGroup = { dateStr: row.dayDate, dayLabel: row.dayLabel, rows: [] }
        groups.push(currentGroup)
      }
      currentGroup.rows.push(row)
    }
    return groups
  }, [rows])

  function updateRow(idx, field, value) {
    setRows(prev => {
      const next = prev.map((r, i) => i === idx ? { ...r, [field]: value, _dirty: true } : r)
      if (onRowsChange) onRowsChange(next)
      return next
    })
  }

  function addRow(dateStr, dayLabel) {
    const newRow = emptyRow(dateStr, dayLabel)
    setRows(prev => {
      // Insert after last row of this day
      const lastIdx = prev.reduce((acc, r, i) => r.dayDate === dateStr ? i : acc, -1)
      const next = [...prev]
      next.splice(lastIdx + 1, 0, newRow)
      return next
    })
  }

  function removeRow(idx) {
    setRows(prev => {
      const row = prev[idx]
      // Don't remove the last row for a day — convert to placeholder
      const dayRows = prev.filter(r => r.dayDate === row.dayDate)
      if (dayRows.length <= 1) {
        return prev.map((r, i) => i === idx ? { ...emptyRow(row.dayDate, row.dayLabel), _placeholder: true } : r)
      }
      return prev.filter((_, i) => i !== idx)
    })
  }

  function toggleDay(dateStr) {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  // Compute truck totals per day for Truck Schedule consumption
  const truckTotalsByDay = useMemo(() => {
    const totals = {}
    for (const row of rows) {
      if (row._placeholder) continue
      if (!totals[row.dayDate]) {
        totals[row.dayDate] = {}
        for (const t of TRUCK_COLS) totals[row.dayDate][t.key] = 0
        totals[row.dayDate].crewSize = 0
      }
      for (const t of TRUCK_COLS) totals[row.dayDate][t.key] += (row[t.key] || 0)
      totals[row.dayDate].crewSize += (row.crewSize || 0)
    }
    return totals
  }, [rows])

  // KPIs
  const realRows = rows.filter(r => !r._placeholder && r.jobName)
  const totalCrews = new Set(realRows.map(r => r.crewLeader)).size
  const totalStops = realRows.length
  const needsConfirmation = realRows.filter(r => r.deliveryStatus === 'Needs Confirmation').length

  if (loading) {
    return <div className="card"><div className="loading-state"><div className="loading-spinner mb-12"></div>Building delivery schedule...</div></div>
  }

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-row-4 mb-12">
        <div className="kpi"><div className="kpi-label">Crew Leaders</div><div className="kpi-val">{totalCrews}</div><div className="kpi-sub">active this week</div></div>
        <div className="kpi"><div className="kpi-label">Total Stops</div><div className="kpi-val">{totalStops}</div><div className="kpi-sub">across 7 days</div></div>
        <div className="kpi"><div className="kpi-label">Needs Confirmation</div><div className="kpi-val" style={{color: needsConfirmation > 0 ? 'var(--bp-amber)' : 'var(--bp-green)'}}>{needsConfirmation}</div><div className="kpi-sub">{needsConfirmation === 0 ? 'all confirmed' : 'pending'}</div></div>
        <div className="kpi"><div className="kpi-label">Trucks Assigned</div><div className="kpi-val">{Object.values(truckTotalsByDay).reduce((s, d) => s + Object.values(d).reduce((a, b) => a + b, 0), 0)}</div><div className="kpi-sub">total vehicle-days</div></div>
      </div>

      {/* Day Groups */}
      {dayGroups.map(group => {
        const isExpanded = expandedDays.has(group.dateStr)
        const dayDate = new Date(group.dateStr + 'T12:00:00')
        const dayTotals = truckTotalsByDay[group.dateStr] || {}
        const dayRealRows = group.rows.filter(r => !r._placeholder && r.jobName)

        return (
          <div key={group.dateStr} className="card mb-8" style={{padding: 0, overflow: 'hidden'}}>
            {/* Day Header */}
            <div
              className="flex-between"
              style={{padding: '10px 16px', background: 'var(--bp-navy)', color: 'var(--bp-white)', cursor: 'pointer'}}
              onClick={() => toggleDay(group.dateStr)}
            >
              <div className="flex gap-8" style={{alignItems: 'center'}}>
                <span style={{fontSize: '16px', fontWeight: 700}}>{formatFullDate(dayDate)}</span>
                <span className="badge badge-sand" style={{fontSize: '10px'}}>{dayRealRows.length} stop{dayRealRows.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex gap-12" style={{alignItems: 'center'}}>
                {dayRealRows.length > 0 && (
                  <span style={{fontSize: '11px', opacity: 0.8}}>
                    {dayTotals.crewSize || 0} crew
                    {TRUCK_COLS.map(t => dayTotals[t.key] ? ` · ${dayTotals[t.key]} ${t.abbrev}` : '').join('')}
                  </span>
                )}
                <span style={{fontSize: '18px', transition: 'transform .2s', transform: isExpanded ? 'rotate(0)' : 'rotate(-90deg)'}}>{isExpanded ? '▾' : '▸'}</span>
              </div>
            </div>

            {/* Rows */}
            {isExpanded && (
              <div style={{overflowX: 'auto'}}>
                <table className="tbl tbl-fixed" style={{minWidth: '1400px', fontSize: '12px'}}>
                  <thead>
                    <tr>
                      <th style={{width: '90px'}}>Crew Leader</th>
                      <th style={{width: '55px'}}>Start</th>
                      <th style={{width: '80px'}}>Arrival</th>
                      <th style={{width: '70px'}}>Type</th>
                      <th style={{width: '100px'}}>Status</th>
                      <th style={{width: '60px'}}>Acct Mgr</th>
                      <th style={{width: '140px'}}>Job Name</th>
                      <th style={{width: '160px'}}>Full Address</th>
                      <th style={{width: '100px'}}>Tent / Structure</th>
                      <th style={{width: '120px'}}>Details</th>
                      <th style={{width: '50px'}}>Drive</th>
                      <th style={{width: '50px'}}>Crew</th>
                      {TRUCK_COLS.map(t => <th key={t.key} style={{width: '40px', textAlign: 'center'}} title={t.label}>{t.abbrev}</th>)}
                      <th style={{width: '30px'}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row, ri) => {
                      const globalIdx = rows.indexOf(row)
                      const leaderColor = LEADER_COLORS[row.crewLeader] || {}
                      const statusColor = STATUS_COLORS[row.deliveryStatus] || {}
                      const acctColor = ACCT_MGR_COLORS[row.accountManager] || {}

                      if (row._placeholder) {
                        return (
                          <tr key={ri} style={{opacity: 0.5}}>
                            <td colSpan={13 + TRUCK_COLS.length + 1} style={{textAlign: 'center', padding: '8px', fontStyle: 'italic', color: 'var(--bp-muted)'}}>
                              No jobs scheduled
                              <button className="btn btn-ghost btn-xs ml-8" onClick={() => addRow(group.dateStr, group.dayLabel)}>+ Add</button>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={ri} className="clickable">
                          {/* Crew Leader */}
                          <td>
                            <select className="form-select" value={row.crewLeader} onChange={e => updateRow(globalIdx, 'crewLeader', e.target.value)}
                              style={{fontSize: '11px', padding: '3px 4px', background: leaderColor.bg || 'transparent', color: leaderColor.text || 'inherit', fontWeight: 600}}>
                              <option value="">—</option>
                              {LEADERS.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </td>
                          {/* Start Time */}
                          <td><input type="time" className="form-input" value={row.startTime} onChange={e => updateRow(globalIdx, 'startTime', e.target.value)} style={{fontSize: '11px', padding: '3px 4px'}} /></td>
                          {/* Arrival Window */}
                          <td><input className="form-input" value={row.arrivalWindow} onChange={e => updateRow(globalIdx, 'arrivalWindow', e.target.value)} placeholder="7:00-8:00a" style={{fontSize: '11px', padding: '3px 4px'}} /></td>
                          {/* Job Type */}
                          <td>
                            <select className="form-select" value={row.jobType} onChange={e => updateRow(globalIdx, 'jobType', e.target.value)} style={{fontSize: '11px', padding: '3px 4px'}}>
                              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          {/* Status */}
                          <td>
                            <select className="form-select" value={row.deliveryStatus} onChange={e => updateRow(globalIdx, 'deliveryStatus', e.target.value)}
                              style={{fontSize: '11px', padding: '3px 4px', background: statusColor.bg || 'transparent', color: statusColor.text || 'inherit', fontWeight: 600}}>
                              {DELIVERY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          {/* Account Manager */}
                          <td>
                            <select className="form-select" value={row.accountManager} onChange={e => updateRow(globalIdx, 'accountManager', e.target.value)}
                              style={{fontSize: '11px', padding: '3px 4px', background: acctColor.bg || 'transparent', color: acctColor.text || 'inherit'}}>
                              <option value="">—</option>
                              {ACCOUNT_MANAGERS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </td>
                          {/* Job Name */}
                          <td>
                            <input className="form-input" value={row.jobName} onChange={e => updateRow(globalIdx, 'jobName', e.target.value)}
                              style={{fontSize: '11px', padding: '3px 4px', fontWeight: 600}} />
                          </td>
                          {/* Full Address */}
                          <td><input className="form-input" value={row.fullAddress} onChange={e => updateRow(globalIdx, 'fullAddress', e.target.value)} placeholder="123 Main St, City, IL" style={{fontSize: '11px', padding: '3px 4px'}} /></td>
                          {/* Tent / Structure */}
                          <td><input className="form-input" value={row.tentStructure} onChange={e => updateRow(globalIdx, 'tentStructure', e.target.value)} style={{fontSize: '11px', padding: '3px 4px'}} /></td>
                          {/* Details */}
                          <td><input className="form-input" value={row.additionalDetails} onChange={e => updateRow(globalIdx, 'additionalDetails', e.target.value)} style={{fontSize: '11px', padding: '3px 4px'}} /></td>
                          {/* Est Drive */}
                          <td><input className="form-input" value={row.estDriveTime} onChange={e => updateRow(globalIdx, 'estDriveTime', e.target.value)} placeholder="hrs" style={{fontSize: '11px', padding: '3px 4px', width: '40px', textAlign: 'center'}} /></td>
                          {/* Crew Size */}
                          <td>
                            <input type="number" className="form-input" value={row.crewSize || ''} min="0"
                              onChange={e => updateRow(globalIdx, 'crewSize', parseInt(e.target.value) || 0)}
                              style={{fontSize: '11px', padding: '3px 4px', width: '40px', textAlign: 'center', fontFamily: 'var(--bp-mono)'}} />
                          </td>
                          {/* Truck columns */}
                          {TRUCK_COLS.map(t => (
                            <td key={t.key}>
                              <input type="number" className="form-input" value={row[t.key] || ''} min="0"
                                onChange={e => updateRow(globalIdx, t.key, parseInt(e.target.value) || 0)}
                                style={{fontSize: '11px', padding: '3px 4px', width: '36px', textAlign: 'center', fontFamily: 'var(--bp-mono)'}} />
                            </td>
                          ))}
                          {/* Actions */}
                          <td>
                            <button className="btn btn-ghost btn-xs" onClick={() => removeRow(globalIdx)} title="Remove row" style={{color: 'var(--bp-red)', fontSize: '14px'}}>×</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* Add row button */}
                <div style={{padding: '6px 16px', borderTop: '1px solid var(--bp-border-lt)'}}>
                  <button className="btn btn-ghost btn-xs" onClick={() => addRow(group.dateStr, group.dayLabel)} style={{color: 'var(--bp-blue)'}}>+ Add Stop</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Footer */}
      <div className="flex-between mt-12">
        <div className="text-md color-muted">{realRows.length} stops across {dayGroups.length} days</div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => {
            // Save to localStorage as draft (week-specific)
            const realOnly = rows.filter(r => !r._placeholder)
            localStorage.setItem('bpt_delivery_draft_' + weekStart, JSON.stringify({ rows: realOnly, saved: new Date().toISOString() }))
            // Also write a normalized day-keyed version for cross-component reads (Fleet Demand, Dashboard alerts)
            const byDay = {}
            for (const r of realOnly) {
              const dayName = (r.dayLabel || '').toLowerCase()
              if (!dayName) continue
              if (!byDay[dayName]) byDay[dayName] = []
              byDay[dayName].push(r)
            }
            localStorage.setItem('bpt_delivery_schedule', JSON.stringify(byDay))
            setToast('Schedule draft saved')
            setTimeout(() => setToast(null), 3000)
          }}>Save Draft</button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            // Build driver sheets from current delivery schedule data
            const real = rows.filter(r => !r._placeholder && r.crewLeader)
            if (real.length === 0) { setToast('No crew stops to generate sheets from'); setTimeout(() => setToast(null), 3000); return }
            // Group jobs by day, then by leader
            const byDay = {}
            for (const r of real) {
              if (!byDay[r.dayDate]) byDay[r.dayDate] = {}
              if (!byDay[r.dayDate][r.crewLeader]) byDay[r.dayDate][r.crewLeader] = []
              byDay[r.dayDate][r.crewLeader].push({
                cr55d_jobname: r.jobName, cr55d_clientname: r.jobName,
                cr55d_venuename: r.fullAddress || r.jobName,
                cr55d_venueaddress: r.fullAddress || '',
                _isInstallDay: r.jobType === 'Setup', _isStrikeDay: r.jobType === 'Takedown',
              })
            }
            // Read crew assignments from localStorage
            let crewData = {}
            try { crewData = JSON.parse(localStorage.getItem('bpt_crew_schedule') || '{}') } catch {}

            let generated = 0
            for (const [dateStr, leaderJobs] of Object.entries(byDay)) {
              const date = new Date(dateStr + 'T12:00:00')
              // Crew schedule stores assignments as arrays: index 0=Mon, 1=Tue, ..., 6=Sun
              const dow = date.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
              const crewDayIdx = dow === 0 ? 6 : dow - 1 // convert to 0=Mon, ..., 6=Sun
              // Build crew assignments per leader
              const crewAssignments = {}
              for (const leader of Object.keys(leaderJobs)) {
                crewAssignments[leader] = Object.entries(crewData)
                  .filter(([, emp]) => {
                    const val = Array.isArray(emp) ? (emp[crewDayIdx] || '') : ''
                    return val.toLowerCase() === leader.toLowerCase()
                  })
                  .map(([name]) => {
                    const empInfo = EMPLOYEES.find(e => e.name.toLowerCase() === name.toLowerCase())
                    return { name, cdl: empInfo?.cdl || '', isLead: empInfo?.category === 'leaders' }
                  })
              }
              const result = generateDriverSheets({ date, dayJobs: leaderJobs, crewAssignments })
              if (result) generated++
            }
            setToast(generated > 0 ? `Generated ${generated} driver sheet PDF${generated !== 1 ? 's' : ''}` : 'No CDL drivers found for sheets — assign crew in Crew Schedule first')
            setTimeout(() => setToast(null), 4000)
          }}>Generate Driver Sheets</button>
        </div>
      </div>

      {toast && <div className="toast show success"><span>{toast}</span></div>}
    </div>
  )
}
