/**
 * Arithmetic on calendar dates ("2026-10-25"): plain dates with no time or
 * time zone, like Temporal.PlainDate. The math runs in UTC only because UTC
 * has no daylight-saving shifts; the result is always a date string again.
 */

const DAY_MS = 86_400_000;

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** The first day of the week containing `date`. `weekStartsOn`: 0 = Sunday … 6 = Saturday. */
export function startOfWeek(date: string, weekStartsOn: number): string {
  return addDays(date, -((dayOfWeek(date) - weekStartsOn + 7) % 7));
}

/** The 7 dates of the week starting at `weekStart`. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
