import { LIMITS } from './config';

/** Logical month/year. There is intentionally no day field, and no Date objects are used for logic. */
export type MonthYear = { month: number; year: number };

/** Months since year 0; lets us compare and subtract logical dates without time zones. */
export function monthIndex(v: MonthYear): number {
  return v.year * 12 + (v.month - 1);
}

export function monthDiff(a: MonthYear, b: MonthYear): number {
  return Math.abs(monthIndex(a) - monthIndex(b));
}

/** Current month/year in the viewer's local calendar. */
export function currentMonthYear(now: Date = new Date()): MonthYear {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Latest month/year the server accepts. UTC+14 is the furthest-ahead time zone, so a client
 * whose local "current month" has already rolled over is never wrongly rejected.
 */
export function maxAllowedMonthYear(nowMs: number = Date.now()): MonthYear {
  const d = new Date(nowMs + 14 * 3600 * 1000);
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

export function isValidMonthYear(v: MonthYear, max: MonthYear = maxAllowedMonthYear()): boolean {
  return (
    Number.isInteger(v.month) &&
    Number.isInteger(v.year) &&
    v.month >= 1 &&
    v.month <= 12 &&
    v.year >= LIMITS.minYear &&
    monthIndex(v) <= monthIndex(max)
  );
}

/** Clamp a selection so it is never in the future (only affects the current year). */
export function clampMonthYear(v: MonthYear, max: MonthYear): MonthYear {
  if (monthIndex(v) > monthIndex(max)) return { ...max };
  return { month: v.month, year: Math.max(v.year, LIMITS.minYear) };
}

export function yearRange(max: MonthYear): number[] {
  const out: number[] = [];
  for (let y = LIMITS.minYear; y <= max.year; y++) out.push(y);
  return out;
}

/** Localized month names. A fixed mid-month day in a fixed year is used purely to obtain the name. */
export function monthNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2000, i, 15))));
}

export function formatMonthYear(v: MonthYear, locale: string): string {
  return `${monthNames(locale)[v.month - 1]} ${v.year}`;
}
