/* ═══════════════════════════════════════════════════════════════════
   CREW & TRUCK CONSTANTS — Blue Peak Tents Operations
   Source of truth for employee rosters, CDL classes, truck types,
   leader colors, and validation rules.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Leaders (first names are the universal identifier everywhere) ── */
export const LEADERS = [
  'Silvano', 'Jeremy', 'Cristhian', 'Dev', 'Nate', 'Zach',
  'Jorge', 'Brendon', 'Carlos R', 'Tim L', 'Miguel', 'Noel'
]

/* ── Leader Colors (conditional formatting) ──────────────────────── */
export const LEADER_COLORS = {
  'Silvano':    { bg: 'rgba(29,58,107,.08)',  text: '#1D3A6B' },
  'Jeremy':     { bg: 'rgba(43,79,138,.08)',  text: '#2B4F8A' },
  'Cristhian':  { bg: 'rgba(121,150,170,.08)', text: '#5A7A90' },
  'Dev':        { bg: 'rgba(46,125,82,.08)',  text: '#2E7D52' },
  'Nate':       { bg: 'rgba(139,115,85,.08)', text: '#8B7355' },
  'Zach':       { bg: 'rgba(106,135,160,.08)', text: '#6A87A0' },
  'Jorge':      { bg: 'rgba(59,130,246,.08)', text: '#2563EB' },
  'Brendon':    { bg: 'rgba(124,58,237,.06)', text: '#6D28D9' },
  'Carlos R':   { bg: 'rgba(217,119,6,.06)',  text: '#B45309' },
  'Tim L':      { bg: 'rgba(16,185,129,.06)', text: '#059669' },
  'Miguel':     { bg: 'rgba(107,114,128,.08)', text: '#4B5563' },
  'Noel':       { bg: 'rgba(192,57,43,.06)',  text: '#991B1B' },
}

/* ── Day Colors (conditional formatting for col A) ───────────────── */
export const DAY_COLORS = {
  'Monday':    { bg: 'rgba(29,58,107,.06)',  text: '#1D3A6B' },
  'Tuesday':   { bg: 'rgba(43,79,138,.06)',  text: '#2B4F8A' },
  'Wednesday': { bg: 'rgba(121,150,170,.06)', text: '#5A7A90' },
  'Thursday':  { bg: 'rgba(46,125,82,.06)',  text: '#2E7D52' },
  'Friday':    { bg: 'rgba(139,115,85,.06)', text: '#8B7355' },
  'Saturday':  { bg: 'rgba(106,135,160,.06)', text: '#6A87A0' },
  'Sunday':    { bg: 'rgba(107,114,128,.06)', text: '#6B7280' },
}

/* ── Account Manager Colors ──────────────────────────────────────── */
export const ACCT_MGR_COLORS = {
  'Dave':     { bg: 'rgba(29,58,107,.08)',  text: '#1D3A6B' },
  'Kyle':     { bg: 'rgba(43,79,138,.08)',  text: '#2B4F8A' },
  'Desiree':  { bg: 'rgba(46,125,82,.08)',  text: '#2E7D52' },
  'Glen':     { bg: 'rgba(139,115,85,.08)', text: '#8B7355' },
  'Larrisa':  { bg: 'rgba(106,135,160,.08)', text: '#6A87A0' },
}

/* ── Account Manager Code Map ────────────────────────────────────── */
export const ACCT_CODES = { DC: 'Dave', GH: 'Glen', DP: 'Desiree', KT: 'Kyle', LB: 'Larrisa' }

/* ── Job Type Colors ─────────────────────────────────────────────── */
export const JOB_TYPE_COLORS = {
  'Setup':      { bg: 'rgba(46,125,82,.08)',  text: '#2E7D52' },
  'Takedown':   { bg: 'rgba(192,57,43,.06)',  text: '#991B1B' },
  'Event Tech': { bg: 'rgba(121,150,170,.08)', text: '#5A7A90' },
}

/* ── Delivery Status Colors ──────────────────────────────────────── */
export const STATUS_COLORS = {
  'Confirmed':          { bg: 'var(--bp-green-bg)', text: 'var(--bp-green)', badge: 'badge-green' },
  'Needs Confirmation': { bg: 'var(--bp-amber-bg)', text: '#92400e',         badge: 'badge-amber' },
  'Placeholder':        { bg: 'var(--bp-red-bg)',   text: 'var(--bp-red)',   badge: 'badge-red' },
}

/* ── 9 Truck Types with CDL Requirements ─────────────────────────── */
export const TRUCK_TYPES = [
  { key: 'semi',    label: 'Semi',     abbrev: 'Semi',      cdl: 'A', col: 'O' },
  { key: 'tandem',  label: 'Tandem',   abbrev: 'Tandem',    cdl: 'B', col: 'P' },
  { key: '750',     label: '750',      abbrev: '750',       cdl: 'B', col: 'Q' },
  { key: 'cstake',  label: 'C-Stake',  abbrev: 'C-Stake',   cdl: 'C', col: 'R' },
  { key: 'bigbox',  label: 'Big Box',  abbrev: 'Big Box',   cdl: 'C', col: 'S' },
  { key: 'smbox',   label: 'Sm Box',   abbrev: 'Sm Box',    cdl: 'D', col: 'T' },
  { key: '250',     label: '250',      abbrev: '250',       cdl: 'D', col: 'U' },
  { key: 'ox',      label: 'Ox/Giant', abbrev: 'Ox/Giant',  cdl: 'C', col: 'V' },  // C+ to tow
  { key: 'crew',    label: 'Crew Size',abbrev: 'Crew',      cdl: null, col: 'W' },
]

/* ── CDL Cascade Logic ───────────────────────────────────────────── */
// A can drive anything. B can drive B/C/D. C can drive C/D. D can drive D only.
const CDL_HIERARCHY = { A: 4, B: 3, C: 2, D: 1 }
const CDL_REQUIRED = { A: 4, B: 3, C: 2, D: 1 }

export function canDrive(driverCDL, requiredCDL) {
  if (!driverCDL || !requiredCDL) return false
  return (CDL_HIERARCHY[driverCDL] || 0) >= (CDL_REQUIRED[requiredCDL] || 0)
}

export function getDriverCapabilities(cdlClass) {
  if (!cdlClass) return []
  return TRUCK_TYPES.filter(t => t.cdl && canDrive(cdlClass, t.cdl)).map(t => t.key)
}

/* ── Employee Roster — 58 employees across 6 categories ──────────── */
export const EMPLOYEE_CATEGORIES = [
  { id: 'leaders', name: 'Leaders / CDL', color: '#1D3A6B' },
  { id: 'field', name: 'Field Workers', color: '#2B4F8A' },
  { id: 'warehouse', name: 'Daytime Warehouse', color: '#7996AA' },
  { id: 'loaders', name: 'Loaders', color: '#8B7355' },
  { id: 'vinyl', name: 'Vinyl Team', color: '#2E7D52' },
  { id: 'sub', name: 'Sub-Contract', color: '#6A87A0' },
]

// Employees loaded from Dataverse cr55d_stafflists. This is the fallback/seed roster.
export const EMPLOYEES = [
  // Leaders / CDL (21)
  { name: 'Silvano', fullName: 'Silvano Eugenio', category: 'leaders', cdl: 'A', isLead: true, daysOff: ['Sun'] },
  { name: 'Jeremy', fullName: 'Jeremy Pask', category: 'leaders', cdl: 'A', isLead: true },
  { name: 'Cristhian', fullName: 'Christhian Benitez', category: 'leaders', cdl: 'A', isLead: true },
  { name: 'Dev', fullName: 'Anthony Devereux', category: 'leaders', cdl: 'A', isLead: true },
  { name: 'Nate', fullName: 'Nate Gorski', category: 'leaders', cdl: 'B', isLead: true },
  { name: 'Zach', fullName: 'Zach Schmitt', category: 'leaders', cdl: 'B', isLead: true },
  { name: 'Jorge', fullName: 'Jorge Hernandez', category: 'leaders', cdl: 'B', isLead: true, daysOff: ['Sat','Sun'] },
  { name: 'Brendon', fullName: 'Brendon French', category: 'leaders', cdl: 'B', isLead: true },
  { name: 'Carlos R', fullName: 'Carlos Rosales', category: 'leaders', cdl: 'C', isLead: true },
  { name: 'Tim L', fullName: 'Tim Lasfalk', category: 'leaders', cdl: 'C', isLead: true },
  { name: 'Miguel', fullName: 'Miguel Torres', category: 'leaders', cdl: 'C', isLead: true },
  { name: 'Noel', fullName: 'Noel Reyes', category: 'leaders', cdl: 'C', isLead: true },
  { name: 'Jaime', fullName: 'Jaime Rodriguez', category: 'leaders', cdl: 'B', isLead: false, daysOff: ['Sat','Sun'] },
  { name: 'Angel', fullName: 'Angel Martinez', category: 'leaders', cdl: 'B', isLead: false },
  { name: 'Pedro', fullName: 'Pedro Sanchez', category: 'leaders', cdl: 'C', isLead: false },
  { name: 'Luis', fullName: 'Luis Morales', category: 'leaders', cdl: 'C', isLead: false },
  { name: 'Adrian', fullName: 'Adrian Flores', category: 'leaders', cdl: 'C', isLead: false },
  { name: 'Marcos', fullName: 'Marcos Gutierrez', category: 'leaders', cdl: 'D', isLead: false },
  { name: 'Diego', fullName: 'Diego Ramirez', category: 'leaders', cdl: 'D', isLead: false },
  { name: 'Ernesto', fullName: 'Ernesto Vega', category: 'leaders', cdl: 'D', isLead: false },
  { name: 'Roberto', fullName: 'Roberto Mendez', category: 'leaders', cdl: 'D', isLead: false },
  // Field Workers (13)
  { name: 'Andre', fullName: 'Andre Williams', category: 'field' },
  { name: 'David C', fullName: 'David Chen', category: 'field' },
  { name: 'Marcus', fullName: 'Marcus Johnson', category: 'field' },
  { name: 'Ryan', fullName: 'Ryan Mitchell', category: 'field' },
  { name: 'Tyler', fullName: 'Tyler Brooks', category: 'field' },
  { name: 'Juan', fullName: 'Juan Garcia', category: 'field' },
  { name: 'Sam', fullName: 'Sam Rivera', category: 'field' },
  { name: 'Alex', fullName: 'Alex Coleman', category: 'field' },
  { name: 'Brandon', fullName: 'Brandon Hayes', category: 'field' },
  { name: 'Jake W', fullName: 'Jake Wilson', category: 'field' },
  { name: 'Chris A', fullName: 'Chris Anderson', category: 'field' },
  { name: 'Daniel', fullName: 'Daniel Lee', category: 'field' },
  { name: 'Kevin', fullName: 'Kevin Thompson', category: 'field' },
  // Daytime Warehouse (8)
  { name: 'Ricardo', fullName: 'Ricardo Flores', category: 'warehouse' },
  { name: 'James', fullName: 'James Martin', category: 'warehouse' },
  { name: 'Derek', fullName: 'Derek Cooper', category: 'warehouse' },
  { name: 'Sean', fullName: 'Sean Murphy', category: 'warehouse' },
  { name: 'Omar', fullName: 'Omar Castillo', category: 'warehouse' },
  { name: 'Tony', fullName: 'Tony Sullivan', category: 'warehouse' },
  { name: 'Greg', fullName: 'Greg Patterson', category: 'warehouse' },
  { name: 'Mike R', fullName: 'Mike Rivera', category: 'warehouse' },
  // Loaders (5)
  { name: 'Carlos M', fullName: 'Carlos Moreno', category: 'loaders' },
  { name: 'Hector', fullName: 'Hector Gonzalez', category: 'loaders' },
  { name: 'Frank', fullName: 'Frank Torres', category: 'loaders' },
  { name: 'Jose', fullName: 'Jose Reyes', category: 'loaders' },
  { name: 'Manuel', fullName: 'Manuel Diaz', category: 'loaders' },
  // Vinyl Team (4)
  { name: 'Victor', fullName: 'Victor Ramirez', category: 'vinyl' },
  { name: 'Pancho', fullName: 'Francisco Ruiz', category: 'vinyl' },
  { name: 'Rafa', fullName: 'Rafael Ortiz', category: 'vinyl' },
  { name: 'Arturo', fullName: 'Arturo Lopez', category: 'vinyl' },
  // Sub-Contract (7) — display as "Meet at Site"
  { name: 'Sub-1', fullName: 'Sub-Contractor 1', category: 'sub', meetAtSite: true },
  { name: 'Sub-2', fullName: 'Sub-Contractor 2', category: 'sub', meetAtSite: true },
  { name: 'Sub-3', fullName: 'Sub-Contractor 3', category: 'sub', meetAtSite: true },
  { name: 'Sub-4', fullName: 'Sub-Contractor 4', category: 'sub', meetAtSite: true },
  { name: 'Sub-5', fullName: 'Sub-Contractor 5', category: 'sub', meetAtSite: true },
  { name: 'Sub-6', fullName: 'Sub-Contractor 6', category: 'sub', meetAtSite: true },
  { name: 'Sub-7', fullName: 'Sub-Contractor 7', category: 'sub', meetAtSite: true },
]

/* ── PM Roster ───────────────────────────────────────────────────── */
export const PMS = [
  'Christhian Benitez', 'Anthony Devereux', 'Jeremy Pask', 'Jorge Hernandez',
  'Nate Gorski', 'Carlos Rosales', 'Silvano Eugenio', 'Brendon French',
  'Tim Lasfalk', 'Zach Schmitt'
]

/* ── Sales Reps / Account Managers ───────────────────────────────── */
export const ACCOUNT_MANAGERS = ['Dave', 'Kyle', 'Desiree', 'Glen', 'Larrisa']

/* ── Job Types ───────────────────────────────────────────────────── */
export const JOB_TYPES = ['Setup', 'Takedown', 'Event Tech']

/* ── Delivery Statuses ───────────────────────────────────────────── */
export const DELIVERY_STATUSES = ['Confirmed', 'Needs Confirmation', 'Placeholder']

/* ── Days of Week ────────────────────────────────────────────────── */
export const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* ── Weekly Jobs Column Layout (parser indices) ──────────────────── */
export const WEEKLY_COLS = [
  { key: 'day',      label: 'Day / Date',          width: '110px', idx: 0 },
  { key: 'leader',   label: 'Crew Leader',         width: '90px',  idx: 1 },
  { key: 'start',    label: 'Start',               width: '55px',  idx: 2 },
  { key: 'arrival',  label: 'Arrival Window',       width: '90px',  idx: 3 },
  { key: 'jobtype',  label: 'Job Type',            width: '75px',  idx: 4 },
  { key: 'status',   label: 'Status',              width: '100px', idx: 5 },
  { key: 'acctmgr',  label: 'Acct Mgr',            width: '65px',  idx: 6 },
  { key: 'jobname',  label: 'Job Name',            width: '160px', idx: 7 },
  { key: 'address',  label: 'Full Address',         width: '200px', idx: 8 },
  { key: 'tent',     label: 'Tent / Structure',     width: '90px',  idx: 9 },
  { key: 'details',  label: 'Additional Details',   width: '140px', idx: 10 },
  { key: 'drive',    label: 'Est. Drive',           width: '55px',  idx: 11 },
  { key: 'notes',    label: 'Crew Notes',           width: '150px', idx: 12 },
]

/* ── Validation helpers ──────────────────────────────────────────── */
export function validateCrewCDL(assignedEmployees, truckNeeds) {
  const warnings = []
  const cdlCounts = { A: 0, B: 0, C: 0, D: 0 }

  for (const emp of assignedEmployees) {
    const cdl = emp.cdl || null
    if (cdl && CDL_HIERARCHY[cdl]) {
      // CDL cascade: A counts toward all lower classes too
      for (const [cls, level] of Object.entries(CDL_HIERARCHY)) {
        if (CDL_HIERARCHY[cdl] >= level) cdlCounts[cls]++
      }
    }
  }

  for (const truck of TRUCK_TYPES) {
    if (!truck.cdl || !truckNeeds[truck.key]) continue
    const needed = truckNeeds[truck.key]
    const have = cdlCounts[truck.cdl] || 0
    if (needed > have) {
      warnings.push(`Need ${needed - have} more ${truck.cdl}-class driver${needed - have > 1 ? 's' : ''} for ${truck.label}`)
    }
  }

  return warnings
}
