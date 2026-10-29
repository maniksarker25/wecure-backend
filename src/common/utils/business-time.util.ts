import { DateTime } from 'luxon';

/**
 * The default business timezone fallback.
 */
export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Lagos';

/**
 * Combines a date-only value (UTC midnight anchor) with an "HH:mm" wall-clock time
 * in the specified timezone into the correct absolute UTC Date instant.
 */
export function combineDateAndTime(
  date: Date | string,
  time: string,
  timezone: string = DEFAULT_BUSINESS_TIMEZONE,
): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date(date);
  
  // Extract the intended calendar day in UTC midnight format
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // Luxon months are 1-indexed
  const day = d.getUTCDate();

  const dt = DateTime.fromObject(
    {
      year,
      month,
      day,
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
    },
    { zone: timezone },
  );

  return dt.toJSDate();
}

/**
 * appointmentDate is always stored as a UTC-midnight instant representing a
 * calendar day, so its UTC day-of-week *is* the intended business calendar day.
 */
export function getBusinessDayOfWeek(date: Date | string): number {
  return new Date(date).getUTCDay();
}

export function getUtcDayBounds(date: Date | string): {
  start: Date;
  end: Date;
} {
  const d = new Date(date);
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function formatUtcDate(date: Date | string): string {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isSameUtcDate(a: Date | string, b: Date | string): boolean {
  return formatUtcDate(a) === formatUtcDate(b);
}

/**
 * Current wall-clock Y-M-D and minutes-since-midnight in the target timezone,
 * correctly handling DST.
 */
export function getBusinessNow(
  timezone: string = DEFAULT_BUSINESS_TIMEZONE,
  now: Date = new Date(),
): {
  dateOnly: Date;
  minutesSinceMidnight: number;
} {
  const dt = DateTime.fromJSDate(now, { zone: timezone });
  
  return {
    dateOnly: new Date(
      Date.UTC(
        dt.year,
        dt.month - 1, // UTC month is 0-indexed
        dt.day,
      ),
    ),
    minutesSinceMidnight: dt.hour * 60 + dt.minute,
  };
}
