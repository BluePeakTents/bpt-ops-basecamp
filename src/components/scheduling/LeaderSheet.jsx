import { useMemo } from 'react'
import { generateLeaderSheet } from '../../utils/generateLeaderSheet'
import { generateDriverSheets, generateProductionSchedulePDF } from '../../utils/generateDriverSheet'
import { isoDate, shortDate } from '../../utils/dateUtils'

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

function getStaffDisplayName(name) {
  if (!name) return '\u2014'
  const parts = name.split(',').map(s => s.trim())
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`
  return name
}

/* ── Component ─────────────────────────────────────────────────── */
export default function LeaderSheet({ jobs, staff, weekDates, onSelectJob }) {
  const leaders = staff.filter(s => s.cr55d_department === 306280010)

  const upcomingJobs = useMemo(() => jobs.filter(j => {
    if (!j.cr55d_installdate) return false
    const install = new Date(j.cr55d_installdate.split('T')[0] + 'T12:00:00')
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    return install <= twoWeeks && install >= new Date(new Date().setHours(0,0,0,0))
  }).sort((a, b) => (a.cr55d_installdate || '').localeCompare(b.cr55d_installdate || '')), [jobs])


  return (
    <div>
      <div className="flex-between mb-12">
        <div>
          <span className="text-base color-muted">Next 2 weeks \u2014 {upcomingJobs.length} jobs</span>
          <span className="text-md color-blue font-semibold ml-8">{leaders.length} crew leaders available</span>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨️ Print</button>
          <button className="btn btn-primary btn-sm" onClick={async (ev) => { const btn = ev.currentTarget; btn.textContent = 'Generating...'; btn.disabled = true; try { await generateLeaderSheet(jobs, weekDates[0]); btn.textContent = '✓ Downloaded'; setTimeout(() => { btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false }, 2000) } catch(e) { console.error('[Leader Sheet]', e); btn.textContent = '📥 Leader Sheet .docx'; btn.disabled = false } }}>📥 Leader Sheet .docx</button>
          <button className="btn btn-outline btn-sm" onClick={(ev) => {
            const activeJobs = jobs.filter(j => {
              const install = j.cr55d_installdate?.split('T')[0]
              if (!install) return false
              const now = new Date()
              const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
              const strike = j.cr55d_strikedate?.split('T')[0] || install
              return todayStr >= install && todayStr <= strike
            })
            if (activeJobs.length === 0) { const btn = ev.currentTarget; btn.textContent = 'No active jobs today'; btn.disabled = true; setTimeout(() => { btn.textContent = '📄 Production PDFs'; btn.disabled = false }, 2000); return }
            activeJobs.forEach(j => { try { generateProductionSchedulePDF(j) } catch(e) { console.error(e) } })
          }}>📄 Production PDFs</button>
        </div>
      </div>

      {/* Crew leaders quick view */}
      {leaders.length > 0 && (
        <div className="card mb-12" style={{padding:'10px 14px'}}>
          <div className="text-sm font-bold color-muted text-upper mb-6">Crew Leaders</div>
          <div className="flex gap-6 flex-wrap">
            {leaders.map(l => (
              <span key={l.cr55d_stafflistid} className="badge badge-green" style={{fontSize:'11px',padding:'3px 10px'}}>
                {getStaffDisplayName(l.cr55d_name)}
              </span>
            ))}
          </div>
        </div>
      )}

      {upcomingJobs.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="empty-state-icon">&#128203;</div><div className="empty-state-title">No upcoming jobs</div><div className="empty-state-sub">Jobs installing in the next 2 weeks will appear here</div></div></div>
      ) : (
        upcomingJobs.map((j, i) => (
          <div key={j.cr55d_jobid} className="card mb-8 card-interactive" onClick={() => onSelectJob && onSelectJob(j)} style={{animation: `slideUp .3s ease ${i * 50}ms both`}}>
            <div className="flex-between mb-4">
              <div>
                <span className="text-xl font-bold color-navy">{j.cr55d_clientname || j.cr55d_jobname}</span>
                <span className={`badge ${j.cr55d_pmassigned ? 'badge-blue' : 'badge-amber'} ml-8`}>{j.cr55d_pmassigned || 'No PM'}</span>
              </div>
              <span className="text-base font-mono font-bold color-navy">
                {shortDate(isoDate(j.cr55d_installdate))}
                {j.cr55d_strikedate && <span className="color-muted" style={{fontWeight:400}}> \u2192 {shortDate(isoDate(j.cr55d_strikedate))}</span>}
              </span>
            </div>
            <div className="grid-3 text-md color-muted">
              <div><strong>Venue:</strong> {j.cr55d_venuename || '\u2014'}</div>
              <div><strong>Crew:</strong> {j.cr55d_crewcount || '\u2014'}</div>
              <div><strong>Trucks:</strong> {j.cr55d_trucksneeded || '\u2014'}</div>
            </div>
            {j.cr55d_venueaddress && (
              <div className="text-sm color-light mt-4">{j.cr55d_venueaddress}</div>
            )}
            <div style={{display:'flex',gap:'6px',marginTop:'6px'}}>
              <span className="badge badge-amber" style={{fontSize:'10.5px'}}>Production: Not created</span>
              <span className="badge badge-amber" style={{fontSize:'10.5px'}}>Load List: Not created</span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
