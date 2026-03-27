/**
 * Dataverse field constants for Ops Base Camp
 * Ensures all components query the same fields for the same entities.
 */

// Standard job fields — use for all job queries unless you need a minimal set
export const JOB_FIELDS = [
  'cr55d_jobid', 'cr55d_jobname', 'cr55d_clientname',
  'cr55d_installdate', 'cr55d_strikedate', 'cr55d_eventdate',
  'cr55d_eventtype', 'cr55d_jobstatus', 'cr55d_quotedamount',
  'cr55d_salesrep', 'cr55d_venuename', 'cr55d_venueaddress',
  'cr55d_pmassigned', 'cr55d_juliestatus', 'cr55d_permitstatus',
  'cr55d_crewcount', 'cr55d_trucksneeded',
].join(',')

// Minimal job fields for lightweight queries (notifications, inventory)
export const JOB_FIELDS_LIGHT = [
  'cr55d_jobid', 'cr55d_jobname', 'cr55d_clientname',
  'cr55d_installdate', 'cr55d_strikedate', 'cr55d_eventdate',
  'cr55d_jobstatus', 'cr55d_venuename', 'cr55d_pmassigned',
  'cr55d_salesrep', 'cr55d_juliestatus',
].join(',')

// Active jobs filter (invoiced + in-progress)
export const ACTIVE_JOBS_FILTER = 'cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002'

// All ops jobs filter (invoiced + in-progress + complete)
export const ALL_OPS_FILTER = 'cr55d_jobstatus eq 408420001 or cr55d_jobstatus eq 408420002 or cr55d_jobstatus eq 408420003'

// Option set value maps — Dataverse returns these as integers or strings
export const JOB_STATUS_MAP = {
  408420001: 'invoiced', 408420002: 'inprogress', 408420003: 'complete',
  408420004: 'cancelled', 408420005: 'sent', 306280001: 'softhold',
}

export const STATUS_LABELS = {
  408420001: 'Scheduled', 408420002: 'In Progress', 408420003: 'Complete',
  408420000: 'Quoted', 408420004: 'Cancelled', 408420005: 'Sent', 306280001: 'Soft Hold',
}

export const STATUS_BADGE = {
  408420001: 'badge-blue', 408420002: 'badge-amber', 408420003: 'badge-green',
  408420000: 'badge-navy', 408420004: 'badge-red', 408420005: 'badge-sand', 306280001: 'badge-purple',
}

export const EVENT_TYPES = {
  987650000: 'Wedding', 987650001: 'Corporate', 987650002: 'Social',
  987650003: 'Festival', 987650004: 'Fundraiser',
  306280000: 'Wedding', 306280001: 'Corporate', 306280002: 'Social',
  306280003: 'Festival', 306280004: 'Fundraiser', 306280005: 'Construction',
}

/** Normalize Dataverse option set value to integer for map lookups */
export function optionSet(val) {
  return val != null ? Number(val) : null
}
