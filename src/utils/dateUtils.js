/**
 * Date utilities for Ops Base Camp
 * Centralizes all date formatting to prevent duplication and timezone bugs.
 * Dataverse returns dates as ISO strings (e.g., "2026-04-18T00:00:00Z").
 * All functions handle both raw ISO strings and pre-split date strings.
 */

/** Extract YYYY-MM-DD from a Dataverse date string, safely handling null/undefined */
export function isoDate(d) {
  if (!d) return ''
  return String(d).split('T')[0]
}

/** Local ISO string from a Date object (avoids UTC shift from .toISOString()) */
export function toLocalISO(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

/** Format as "Apr 18" or "Apr 18 '25" if not current year */
export function shortDate(d) {
  if (!d) return ''
  const dateStr = isoDate(d)
  if (!dateStr) return ''
  const dt = new Date(dateStr + 'T12:00:00')
  if (isNaN(dt.getTime())) return ''
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const yr = dt.getFullYear()
  const suffix = yr !== new Date().getFullYear() ? ` '${String(yr).slice(-2)}` : ''
  return `${m[dt.getMonth()]} ${dt.getDate()}${suffix}`
}

/** Format as "Apr 18, 2026" */
export function formatDate(d) {
  if (!d) return '—'
  const dateStr = isoDate(d)
  if (!dateStr) return '—'
  const dt = new Date(dateStr + 'T12:00:00')
  if (isNaN(dt.getTime())) return '—'
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

/** Format as "MM/DD/YYYY" */
export function formatDateSlash(d) {
  if (!d) return ''
  const dateStr = isoDate(d)
  if (!dateStr) return ''
  const dt = new Date(dateStr + 'T12:00:00')
  if (isNaN(dt.getTime())) return ''
  return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0') + '/' + dt.getFullYear()
}

/** Days from today to a date string. Returns null if no date. */
export function daysUntil(d) {
  if (!d) return null
  const dateStr = isoDate(d)
  if (!dateStr) return null
  const target = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  return Math.ceil((target - now) / 86400000)
}

/** Days between two date strings */
export function daysBetween(d1, d2) {
  if (!d1 || !d2) return 0
  const a = new Date(isoDate(d1) + 'T12:00:00')
  const b = new Date(isoDate(d2) + 'T12:00:00')
  return Math.max(1, Math.ceil((b - a) / 86400000))
}

/** Get Monday-Sunday dates for the week containing baseDate */
export function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return dt
  })
}

/** Format a Date object as "Apr 18" (for calendar headers) */
export function formatDateShort(d) {
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${m[d.getMonth()]} ${d.getDate()}`
}

/** Format week range: "Mar 30 – Apr 5, 2026" */
export function formatWeekRange(dates) {
  if (!dates || dates.length < 7) return ''
  return `${formatDateShort(dates[0])} – ${formatDateShort(dates[6])}, ${dates[0].getFullYear()}`
}
