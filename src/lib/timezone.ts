import { fromZonedTime, toZonedTime, format } from 'date-fns-tz'
import { startOfDay } from 'date-fns'

/**
 * Convert an ISO-format local datetime string (no timezone offset) to a UTC
 * Date by treating it as wall-clock time in the given IANA timezone.
 *
 * @example
 * localToUTC("2024-04-05T18:00:00", "America/New_York")
 * // → Date for 2024-04-05T22:00:00.000Z
 */
export function localToUTC(
  localDateTimeString: string,
  locationTimezone: string,
): Date {
  return fromZonedTime(localDateTimeString, locationTimezone)
}

/**
 * Format a UTC Date as a human-readable shift time in the given IANA timezone.
 *
 * @example
 * displayShiftTime(utcDate, "America/New_York")
 * // → "Fri Apr 5, 6:00 PM EDT"
 */
export function displayShiftTime(
  utcDate: Date,
  locationTimezone: string,
): string {
  const zonedDate = toZonedTime(utcDate, locationTimezone)
  return format(zonedDate, 'EEE MMM d, h:mm a zzz', {
    timeZone: locationTimezone,
  })
}

/**
 * Returns true if the shift spans midnight in the given timezone —
 * i.e. the start and end fall on different local calendar dates.
 */
export function isOvernightShift(
  utcStart: Date,
  utcEnd: Date,
  locationTimezone: string,
): boolean {
  const localStart = toZonedTime(utcStart, locationTimezone)
  const localEnd = toZonedTime(utcEnd, locationTimezone)

  // Compare by truncating to the start of each local day.
  const dayStart = startOfDay(localStart).getTime()
  const dayEnd = startOfDay(localEnd).getTime()

  return dayStart !== dayEnd
}

/**
 * Return the day of the week (0 = Sunday … 6 = Saturday) for a UTC Date
 * evaluated in the given IANA timezone.
 */
export function getDayOfWeekInTz(utcDate: Date, timezone: string): number {
  return toZonedTime(utcDate, timezone).getDay()
}

/**
 * Return the Monday 00:00:00.000 UTC weekStart and Sunday 23:59:59.999 UTC
 * weekEnd of the ISO week that contains the given UTC date.
 *
 * All arithmetic is done in UTC — this function is timezone-agnostic.
 */
export function getWeekBoundsUTC(utcDate: Date): {
  weekStart: Date
  weekEnd: Date
} {
  const d = new Date(utcDate)
  d.setUTCHours(0, 0, 0, 0)

  // getUTCDay(): 0=Sun, 1=Mon … 6=Sat
  const dayOfWeek = d.getUTCDay()
  // Distance back to Monday: Sunday → 6, Mon → 0, Tue → 1, …
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const weekStart = new Date(d)
  weekStart.setUTCDate(d.getUTCDate() - daysFromMonday)

  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6)
  weekEnd.setUTCHours(23, 59, 59, 999)

  return { weekStart, weekEnd }
}
