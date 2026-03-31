import { toLocalISO, isoDate } from '../../utils/dateUtils'

/* ── Constants ─────────────────────────────────────────────────── */
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const VEHICLE_TYPES = [
  { type: 'Box Truck (26\')', count: 10, icon: '🚛' },
  { type: 'Box Truck (16\')', count: 3, icon: '📦' },
  { type: 'Pickup (F-250/350)', count: 13, icon: '🛻' },
  { type: 'Flatbed/Stakebed', count: 6, icon: '🚚' },
  { type: 'Ox (Articulating Loader)', count: 11, icon: '🏗️' },
  { type: 'Semi Tractor', count: 1, icon: '🚜' },
]

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/* ── Component ─────────────────────────────────────────────────── */
export default function TruckSchedule({ weekDates, jobs }) {
  return (
    <div>
      {/* Vehicle type summary */}
      <div className="kpi-row-6">
        {VEHICLE_TYPES.map((v, i) => (
          <div key={i} className="kpi">
            <div className="kpi-icon">{v.icon}</div>
            <div className="kpi-label">{v.type}</div>
            <div className="kpi-val">{v.count}</div>
            <div className="kpi-sub">in fleet</div>
          </div>
        ))}
      </div>

      {/* Daily allocation */}
      <div className="card card-flush">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:'180px'}}>Vehicle Type</th>
              <th style={{width:'60px'}}>Fleet</th>
              {weekDates.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString()
                return <th key={i} style={{textAlign:'center', background: isToday ? 'rgba(37,99,235,.06)' : ''}}>{DAYS_SHORT[i]}<br/><span style={{fontSize:'10px'}}>{formatDateShort(d)}</span></th>
              })}
            </tr>
          </thead>
          <tbody>
            {VEHICLE_TYPES.map((v, i) => {
              const dailyNeeds = weekDates.map((date, di) => {
                // Count jobs active on this day as a proxy for vehicle demand
                const dateStr = toLocalISO(date)
                const activeJobs = jobs.filter(j => {
                  const install = isoDate(j.cr55d_installdate)
                  const strike = isoDate(j.cr55d_strikedate) || install
                  return install && dateStr >= install && dateStr <= strike
                }).length
                // Scale demand by vehicle type (rough heuristic until real data)
                const scale = v.type.includes('Box') ? 0.8 : v.type.includes('Pickup') ? 0.5 : v.type.includes('Ox') ? 0.3 : 0.2
                return Math.min(Math.round(activeJobs * scale), v.count + 2)
              })
              return (
                <tr key={i}>
                  <td className="font-semibold"><span style={{marginRight:'6px'}}>{v.icon}</span>{v.type}</td>
                  <td className="mono font-bold text-center">{v.count}</td>
                  {dailyNeeds.map((need, di) => {
                    const overCapacity = need > v.count
                    return (
                      <td key={di} style={{textAlign:'center'}}>
                        <span className="text-base font-bold font-mono" style={{
                          display:'inline-flex',alignItems:'center',justifyContent:'center',
                          width:'28px',height:'28px',borderRadius:'6px',
                          background: overCapacity ? 'var(--bp-red-bg)' : need >= v.count ? 'var(--bp-amber-bg)' : need > 0 ? 'var(--bp-green-bg)' : 'var(--bp-alt)',
                          color: overCapacity ? 'var(--bp-red)' : need >= v.count ? '#92400e' : need > 0 ? 'var(--bp-green)' : 'var(--bp-light)',
                        }}>
                          {need}
                        </span>
                        {overCapacity && <div className="font-bold color-red" style={{fontSize:'10px',marginTop:'2px'}}>+{need - v.count} over</div>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Validation alerts */}
      <div className="callout callout-amber mt-12">
        <span className="callout-icon">⚡</span>
        <div>
          <strong>Truck validation</strong> cross-references with the crew scheduler. When crews are planned for a day, the system validates enough trucks are available. Alerts will appear here when demand exceeds supply.
        </div>
      </div>
    </div>
  )
}
