import { useState, useEffect } from 'react'
import { dvFetch } from '../hooks/useDataverse'

/* ── Constants ─────────────────────────────────────────────────── */
const REPORTS = [
  { id: 'restrooms', label: 'Restrooms', icon: '🚿', color: '#3B82F6' },
  { id: 'hardwood', label: 'Hardwood Flooring', icon: '🪵', color: '#92400E' },
  { id: 'tables', label: 'Tables', icon: '🪑', color: '#7C3AED' },
  { id: 'chairs', label: 'Chairs', icon: '💺', color: '#059669' },
  { id: 'dancefloors', label: 'Dance Floors', icon: '💃', color: '#EC4899' },
]

// Real restroom trailer fleet from Fleet Master spreadsheet
const RESTROOM_UNITS = [
  { unit: 'G51', size: '5-Stall', type: 'Guest', make: 'COH', year: 2016, vin: '4C9TN1411GM081701', plate: '308789 TC', status: 'available' },
  { unit: 'G81', size: '8-Stall', type: 'Guest', make: 'COH', year: 2016, vin: '4C9TW2020GM081702', plate: '308790 TC', status: 'available' },
  { unit: 'W41', size: '4-Stall', type: 'Worker', make: 'Rich Restroom', year: 2018, vin: '1K9BU1810J1236537', plate: '352676 TC', status: 'available' },
  { unit: 'W42', size: '4-Stall', type: 'Worker', make: 'JAG', year: 2023, vin: '1J9HTDL12PH358951', plate: '414882 TC', status: 'available' },
  { unit: 'W51', size: '5-Stall', type: 'Worker', make: 'Rich Restroom', year: 2017, vin: '1K9BC2121H1236131', plate: '', status: 'available' },
  { unit: 'W52', size: '5-Stall', type: 'Worker', make: 'Rich Restroom', year: 2018, vin: '1K9BU2529J1236474', plate: '102073 TE', status: 'available' },
  { unit: 'W81', size: '8-Stall', type: 'Worker', make: 'Rich Restroom', year: 2017, vin: '1K9BU2520H1236132', plate: '', status: 'available' },
  { unit: 'W82', size: '8-Stall', type: 'Worker', make: 'Black Tie', year: 2021, vin: '4B9BE2822ME011088', plate: '118673 TE', status: 'available' },
  { unit: 'W91', size: '9-Stall', type: 'Worker', make: 'Black Tie', year: 2023, vin: '4B9BE342PE011139', plate: '140576 TE', status: 'available' },
  { unit: 'W101', size: '10-Stall', type: 'Worker', make: 'Rich Restroom', year: 2020, vin: '1K98U292XL1236058', plate: '380762 TC', status: 'available' },
  { unit: 'W102', size: '10-Stall', type: 'Worker', make: '', year: 0, vin: '', plate: '', status: 'on order', note: 'Ordered — pending delivery' },
]

const HARDWOOD_TYPES = [
  { name: 'Habanero', panels: 480, available: 380, booked: 100, condition: 'good' },
  { name: 'Pickled Cedar New/Dark', panels: 320, available: 280, booked: 40, condition: 'good', tag: 'NEW' },
  { name: 'Pickled Cedar Old/Light', panels: 240, available: 200, booked: 40, condition: 'fair', tag: 'OLD' },
  { name: 'Birch', panels: 200, available: 160, booked: 40, condition: 'good' },
  { name: 'Maple', panels: 160, available: 120, booked: 40, condition: 'good' },
  { name: 'Barnwood', panels: 120, available: 100, booked: 20, condition: 'good' },
]

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDateShort(d) {
  if (!d) return ''
  const dt = new Date(d + 'T12:00:00')
  return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}`
}

function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

/* ── Main Component ────────────────────────────────────────────── */
export default function Inventory() {
  const [activeReport, setActiveReport] = useState('restrooms')
  const [dateRange, setDateRange] = useState({ start: toLocalISO(new Date()), end: '' })
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadJobs()
  }, [])

  async function loadJobs() {
    setLoading(true)
    try {
      const data = await dvFetch(`cr55d_jobs?$select=cr55d_jobid,cr55d_jobname,cr55d_clientname,cr55d_installdate,cr55d_strikedate,cr55d_eventdate,cr55d_jobstatus&$filter=cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002&$orderby=cr55d_installdate asc&$top=100`)
      setJobs(data || [])
    } catch (e) { console.error('[Inventory] Load:', e) }
    finally { setLoading(false) }
  }

  // Filter jobs by date range when set
  const filteredJobs = jobs.filter(j => {
    if (!dateRange.start && !dateRange.end) return true
    const install = j.cr55d_installdate?.split('T')[0]
    const strike = j.cr55d_strikedate?.split('T')[0] || install
    if (!install) return false
    if (dateRange.start && strike < dateRange.start) return false
    if (dateRange.end && install > dateRange.end) return false
    return true
  })

  return (
    <div>
      <div className="page-head flex-between">
        <div><h1>Inventory</h1><div className="sub">Product availability reporting</div></div>
        <div className="flex gap-8">
          <div className="flex gap-4">
            <label className="form-label" style={{marginBottom:0,lineHeight:'28px'}}>Date Range</label>
            <input type="date" className="form-input" style={{width:'140px',padding:'4px 8px',fontSize:'11px'}} value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} />
            <span style={{color:'var(--bp-muted)'}}>→</span>
            <input type="date" className="form-input" style={{width:'140px',padding:'4px 8px',fontSize:'11px'}} value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} />
          </div>
        </div>
      </div>

      {/* Report Toggles */}
      <div className="flex gap-6 mb-16">
        {REPORTS.map(r => (
          <button key={r.id} className={`pill${activeReport === r.id ? ' active' : ''}`}
            style={{borderColor: activeReport === r.id ? r.color : undefined, background: activeReport === r.id ? r.color : undefined}}
            onClick={() => setActiveReport(r.id)}>
            <span style={{fontSize:'13px'}}>{r.icon}</span> {r.label}
          </button>
        ))}
      </div>

      {/* Report Content */}
      {activeReport === 'restrooms' && <RestroomReport jobs={filteredJobs} loading={loading} />}
      {activeReport === 'hardwood' && <HardwoodReport jobs={filteredJobs} loading={loading} />}
      {activeReport === 'tables' && <GenericReport title="Tables" icon="🪑" loading={loading} />}
      {activeReport === 'chairs' && <GenericReport title="Chairs" icon="💺" desc="Chair inventory by type (gray Fulton chairs, etc.), availability by date range." loading={loading} />}
      {activeReport === 'dancefloors' && <GenericReport title="Dance Floors" icon="💃" loading={loading} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   RESTROOM REPORT
   ═══════════════════════════════════════════════════════════════════ */
function RestroomReport({ jobs, loading }) {
  const available = RESTROOM_UNITS.filter(u => u.status === 'available').length
  const booked = RESTROOM_UNITS.filter(u => u.status === 'booked').length
  const maintenance = RESTROOM_UNITS.filter(u => u.status === 'maintenance').length

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi"><div className="kpi-label">Total Units</div><div className="kpi-val">{RESTROOM_UNITS.length}</div><div className="kpi-sub">restroom trailers</div></div>
        <div className="kpi"><div className="kpi-label">Available Now</div><div className="kpi-val" style={{color:'var(--bp-green)'}}>{available}</div><div className="kpi-sub">ready to book</div></div>
        <div className="kpi"><div className="kpi-label">Currently Booked</div><div className="kpi-val" style={{color:'var(--bp-amber)'}}>{booked}</div><div className="kpi-sub">on jobs</div></div>
        <div className="kpi"><div className="kpi-label">In Maintenance</div><div className="kpi-val" style={{color:'var(--bp-red)'}}>{maintenance}</div><div className="kpi-sub">out of service</div></div>
      </div>

      {/* Unit Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Unit #</th>
              <th>Size</th>
              <th>Type</th>
              <th>Status</th>
              <th>Current Job</th>
              <th>Next Available</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {RESTROOM_UNITS.map((u, i) => (
              <tr key={i}>
                <td style={{fontWeight:700,color:'var(--bp-navy)'}}>{u.unit}</td>
                <td>{u.size}</td>
                <td><span className={`badge ${u.type === 'Guest' ? 'badge-blue' : 'badge-navy'}`}>{u.type}</span></td>
                <td>
                  <span className={`badge ${u.status === 'available' ? 'badge-green' : u.status === 'booked' ? 'badge-amber' : u.status === 'maintenance' ? 'badge-red' : 'badge-gray'}`}>
                    {u.status}
                  </span>
                </td>
                <td style={{fontSize:'11px',color:'var(--bp-muted)'}}>{u.status === 'booked' ? '(assigned to upcoming job)' : '—'}</td>
                <td className="mono" style={{fontSize:'11px'}}>{u.status === 'available' ? 'Now' : '—'}</td>
                <td style={{fontSize:'11px',color:'var(--bp-light)'}}>{u.note || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>When sales quotes a restroom size (e.g., 8-stall), ops assigns a specific unit (e.g., W81) here. Unit-level calendar bookings show exactly which trailer goes where.</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   HARDWOOD FLOORING REPORT
   ═══════════════════════════════════════════════════════════════════ */
function HardwoodReport({ jobs, loading }) {
  return (
    <div>
      {/* Never-mix warning */}
      <div className="callout callout-red mb-12">
        <span className="callout-icon">⚠️</span>
        <div>
          <strong>Never-Mix Rule:</strong> Pickled Cedar New/Dark and Pickled Cedar Old/Light must NEVER be combined on the same job. The system will flag and block this.
        </div>
      </div>

      {/* Inventory table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Wood Type</th>
              <th className="r">Total Panels</th>
              <th className="r">Available</th>
              <th className="r">Booked</th>
              <th>Utilization</th>
              <th>Condition</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {HARDWOOD_TYPES.map((h, i) => {
              const pct = Math.round((h.booked / h.panels) * 100)
              return (
                <tr key={i}>
                  <td>
                    <span style={{fontWeight:600,color:'var(--bp-navy)'}}>{h.name}</span>
                    {h.tag && <span className={`badge ${h.tag === 'NEW' ? 'badge-green' : 'badge-amber'}`} style={{marginLeft:'8px',fontSize:'8px'}}>{h.tag}</span>}
                  </td>
                  <td className="r mono">{h.panels}</td>
                  <td className="r mono" style={{fontWeight:700,color:'var(--bp-green)'}}>{h.available}</td>
                  <td className="r mono">{h.booked}</td>
                  <td>
                    <div className="flex gap-8">
                      <div className="progress-bar" style={{flex:1,height:'6px'}}>
                        <div className={`progress-fill ${pct > 75 ? 'red' : pct > 50 ? 'amber' : 'green'}`} style={{width:`${pct}%`}}></div>
                      </div>
                      <span style={{fontSize:'10px',fontFamily:'var(--bp-mono)',color:'var(--bp-muted)',minWidth:'30px'}}>{pct}%</span>
                    </div>
                  </td>
                  <td><span className={`badge ${h.condition === 'good' ? 'badge-green' : 'badge-amber'}`}>{h.condition}</span></td>
                  <td><span className={`badge ${h.available > 100 ? 'badge-green' : h.available > 50 ? 'badge-amber' : 'badge-red'}`}>{h.available > 100 ? 'In Stock' : h.available > 50 ? 'Low' : 'Critical'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>Panel inventory by type, size, and condition. Damage reporting with photo upload coming in field app (Outpost). Par level alerts fire when available inventory drops below threshold for upcoming jobs.</div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   GENERIC REPORT (Tables, Chairs, Dance Floors)
   ═══════════════════════════════════════════════════════════════════ */
function GenericReport({ title, icon, desc, loading }) {
  return (
    <div>
      <div className="kpi-row" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="kpi"><div className="kpi-label">Total Inventory</div><div className="kpi-val">—</div><div className="kpi-sub">items in catalog</div></div>
        <div className="kpi"><div className="kpi-label">Available Now</div><div className="kpi-val">—</div><div className="kpi-sub">ready to book</div></div>
        <div className="kpi"><div className="kpi-label">Committed</div><div className="kpi-val">—</div><div className="kpi-sub">allocated to jobs</div></div>
      </div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">{icon}</div>
          <div className="empty-state-title">{title} Inventory</div>
          <div className="empty-state-sub">
            {desc || `${title} inventory data will populate from Dataverse. Use the date range picker to check availability for specific windows.`}
          </div>
        </div>
      </div>
      <div className="callout callout-blue mt-12">
        <span className="callout-icon">💡</span>
        <div>For ad-hoc queries, use Ask Ops: "Do we have enough gray Fulton chairs for a 250-person wedding this Saturday?"</div>
      </div>
    </div>
  )
}
