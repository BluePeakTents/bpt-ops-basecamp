import { useMemo } from 'react'
import { toLocalISO } from '../../utils/dateUtils'
import { TRUCK_TYPES } from '../../data/crewConstants'

/* ── Constants ─────────────────────────────────────────────────── */
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const TRUCK_COLS = TRUCK_TYPES.filter(t => t.key !== 'crew' && t.fleetCount != null)

function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/* ═══════════════════════════════════════════════════════════════════
   TRUCK SCHEDULE — Output/Validation tab
   Reads truck data from Delivery Schedule and validates against fleet.
   ═══════════════════════════════════════════════════════════════════ */
export default function TruckSchedule({ weekDates, jobs, deliveryRows = [] }) {
  // Sum truck demand per day from delivery rows
  const dailyDemand = useMemo(() => {
    const demand = {}
    for (const d of weekDates) {
      const dateStr = toLocalISO(d)
      demand[dateStr] = {}
      for (const t of TRUCK_COLS) demand[dateStr][t.key] = 0
      demand[dateStr].crewSize = 0
    }
    for (const row of deliveryRows) {
      if (row._placeholder || !row.dayDate) continue
      if (!demand[row.dayDate]) continue
      for (const t of TRUCK_COLS) demand[row.dayDate][t.key] += (row[t.key] || 0)
      demand[row.dayDate].crewSize += (row.crewSize || 0)
    }
    return demand
  }, [deliveryRows, weekDates])

  // Check if we have delivery data
  const hasDeliveryData = deliveryRows.some(r => !r._placeholder && TRUCK_COLS.some(t => r[t.key] > 0))

  // Compute weekly totals and flags
  const weeklyFlags = useMemo(() => {
    const flags = []
    for (const t of TRUCK_COLS) {
      let maxDemand = 0
      let overDays = 0
      for (const d of weekDates) {
        const dateStr = toLocalISO(d)
        const need = dailyDemand[dateStr]?.[t.key] || 0
        if (need > maxDemand) maxDemand = need
        if (need > t.fleetCount) overDays++
      }
      if (overDays > 0) flags.push({ truck: t.label, maxDemand, fleet: t.fleetCount, overDays })
    }
    return flags
  }, [dailyDemand, weekDates])

  return (
    <div>
      {/* Fleet capacity KPIs */}
      <div className="kpi-row" style={{display:'grid',gridTemplateColumns:`repeat(${TRUCK_COLS.length},1fr)`,gap:'8px',marginBottom:'12px'}}>
        {TRUCK_COLS.map(t => {
          const maxDay = Math.max(...weekDates.map(d => dailyDemand[toLocalISO(d)]?.[t.key] || 0))
          const over = maxDay > t.fleetCount
          const atCap = maxDay === t.fleetCount
          return (
            <div key={t.key} className="kpi" style={{padding:'10px 8px'}}>
              <div className="kpi-label" style={{fontSize:'10px'}}>{t.label}</div>
              <div className="kpi-val" style={{fontSize:'20px',color: over ? 'var(--bp-red)' : atCap ? 'var(--bp-amber)' : 'var(--bp-green)'}}>
                {maxDay}<span style={{fontSize:'12px',color:'var(--bp-muted)',fontWeight:400}}>/{t.fleetCount}</span>
              </div>
              <div className="kpi-sub" style={{fontSize:'9px'}}>{t.cdl}-class CDL · peak day</div>
            </div>
          )
        })}
      </div>

      {/* Over-capacity alerts */}
      {weeklyFlags.length > 0 && (
        <div className="callout callout-red mb-12">
          <span className="callout-icon">🚨</span>
          <div>
            <strong>Fleet capacity exceeded:</strong>
            <ul style={{margin:'4px 0 0',paddingLeft:'16px',fontSize:'12px'}}>
              {weeklyFlags.map((f, i) => (
                <li key={i}><strong>{f.truck}</strong>: need {f.maxDemand} but fleet has {f.fleet} ({f.overDays} day{f.overDays > 1 ? 's' : ''} over)</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!hasDeliveryData && (
        <div className="callout callout-amber mb-12">
          <span className="callout-icon">💡</span>
          <div>
            <strong>No truck assignments yet.</strong> Go to <strong>Delivery Schedule</strong> and assign trucks per crew-stop. Truck totals will auto-populate here.
          </div>
        </div>
      )}

      {/* Daily demand vs fleet grid */}
      <div className="card card-flush">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'120px'}}>Truck Type</th>
              <th style={{width:'50px',textAlign:'center'}}>Fleet</th>
              <th style={{width:'50px',textAlign:'center'}}>CDL</th>
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString()
                return (
                  <th key={i} style={{textAlign:'center', background: isToday ? 'rgba(37,99,235,.06)' : ''}}>
                    {DAYS_SHORT[i]}<br/><span style={{fontSize:'10px',opacity:.7}}>{formatDateShort(d)}</span>
                  </th>
                )
              })}
              <th style={{width:'60px',textAlign:'center'}}>Max</th>
            </tr>
          </thead>
          <tbody>
            {TRUCK_COLS.map(t => {
              const dailyValues = weekDates.map(d => dailyDemand[toLocalISO(d)]?.[t.key] || 0)
              const maxVal = Math.max(...dailyValues)
              return (
                <tr key={t.key}>
                  <td className="font-semibold">{t.label}</td>
                  <td style={{textAlign:'center',fontFamily:'var(--bp-mono)',fontWeight:700}}>{t.fleetCount}</td>
                  <td style={{textAlign:'center',fontSize:'11px',color:'var(--bp-muted)'}}>{t.cdl}-class</td>
                  {dailyValues.map((need, di) => {
                    const surplus = t.fleetCount - need
                    const over = need > t.fleetCount
                    const atCap = need === t.fleetCount
                    return (
                      <td key={di} style={{textAlign:'center',padding:'6px 4px'}}>
                        <div style={{
                          display:'inline-flex',flexDirection:'column',alignItems:'center',gap:'2px',
                          padding:'4px 8px',borderRadius:'6px',minWidth:'36px',
                          background: over ? 'var(--bp-red-bg)' : atCap ? 'var(--bp-amber-bg)' : need > 0 ? 'var(--bp-green-bg)' : 'var(--bp-alt)',
                        }}>
                          <span style={{
                            fontFamily:'var(--bp-mono)',fontWeight:700,fontSize:'14px',
                            color: over ? 'var(--bp-red)' : atCap ? '#92400e' : need > 0 ? 'var(--bp-green)' : 'var(--bp-light)',
                          }}>{need}</span>
                          {need > 0 && (
                            <span style={{fontSize:'9px',fontWeight:600,color: over ? 'var(--bp-red)' : 'var(--bp-muted)'}}>
                              {over ? `+${Math.abs(surplus)} over` : `${surplus} left`}
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{textAlign:'center'}}>
                    <span style={{
                      fontFamily:'var(--bp-mono)',fontWeight:700,fontSize:'13px',
                      color: maxVal > t.fleetCount ? 'var(--bp-red)' : maxVal === t.fleetCount ? 'var(--bp-amber)' : 'var(--bp-green)',
                    }}>{maxVal}</span>
                  </td>
                </tr>
              )
            })}
            {/* Crew size totals row */}
            <tr style={{borderTop:'2px solid var(--bp-border)',fontWeight:700}}>
              <td>Total Crew</td>
              <td style={{textAlign:'center'}}>—</td>
              <td style={{textAlign:'center'}}>—</td>
              {weekDates.map((d, di) => (
                <td key={di} style={{textAlign:'center',fontFamily:'var(--bp-mono)',fontSize:'14px',color:'var(--bp-navy)'}}>
                  {dailyDemand[toLocalISO(d)]?.crewSize || 0}
                </td>
              ))}
              <td style={{textAlign:'center',fontFamily:'var(--bp-mono)',color:'var(--bp-navy)'}}>
                {Math.max(...weekDates.map(d => dailyDemand[toLocalISO(d)]?.crewSize || 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* CDL driver requirements summary */}
      <div className="card mt-12" style={{padding:'16px'}}>
        <div className="text-md font-bold color-navy mb-8">CDL Driver Requirements (Peak Day)</div>
        <div className="flex gap-12">
          {['A','B','C','D'].map(cdl => {
            const needed = TRUCK_COLS.filter(t => t.cdl === cdl).reduce((sum, t) => {
              const maxDay = Math.max(...weekDates.map(d => dailyDemand[toLocalISO(d)]?.[t.key] || 0))
              return sum + maxDay
            }, 0)
            return (
              <div key={cdl} style={{textAlign:'center'}}>
                <div style={{fontSize:'10px',fontWeight:600,color:'var(--bp-muted)',textTransform:'uppercase',letterSpacing:'.04em'}}>{cdl}-Class</div>
                <div style={{fontSize:'22px',fontWeight:700,color: needed > 0 ? 'var(--bp-navy)' : 'var(--bp-light)',fontFamily:'var(--bp-mono)'}}>{needed}</div>
                <div style={{fontSize:'10px',color:'var(--bp-muted)'}}>drivers needed</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
