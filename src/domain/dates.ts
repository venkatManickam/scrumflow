import { addDays, differenceInCalendarDays, eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'

export const DAY_MS = 86_400_000

/** Local calendar day as yyyy-MM-dd. */
export function dayKey(d: Date | string = new Date()): string {
  return format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd')
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function shiftDays(from: Date | string, days: number): Date {
  return addDays(typeof from === 'string' ? parseISO(from) : from, days)
}

/** All calendar days of a sprint, inclusive. */
export function sprintDays(startDate: string, endDate: string): string[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  if (end < start) return [startDate]
  return eachDayOfInterval({ start, end }).map((d) => dayKey(d))
}

export function workingDays(startDate: string, endDate: string): string[] {
  return sprintDays(startDate, endDate).filter((k) => !isWeekend(parseISO(k)))
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a))
}

export function niceDate(d?: string): string {
  if (!d) return '—'
  try {
    return format(parseISO(d), 'dd MMM yyyy')
  } catch {
    return d
  }
}

export function shortDate(d?: string): string {
  if (!d) return '—'
  try {
    return format(parseISO(d), 'dd MMM')
  } catch {
    return d
  }
}

/** Call-friendly absolute date: "Today", "Yesterday", else "17 Sep 2026". Never "24 days ago". */
export function friendlyDate(iso?: string, today = dayKey()): string {
  if (!iso) return '—'
  const key = dayKey(iso)
  if (key === today) return 'Today'
  if (key === dayKey(shiftDays(today, -1))) return 'Yesterday'
  return niceDate(iso)
}

/** Tracker-style date "18-09-2026" (DD-MM-YYYY), for pasting back into the Excel update column. */
export function dmyDate(iso?: string): string {
  if (!iso) return ''
  try {
    return format(parseISO(iso), 'dd-MM-yyyy')
  } catch {
    return iso
  }
}

export function relativeDays(target: string, today = dayKey()): string {
  const n = daysBetween(today, target)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n < 0) return `${-n} days ago`
  return `in ${n} days`
}
