const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Weeks of ISO dates for a month (month is 1-based), Sunday first. Cells
 * outside the month are null. UTC-only math, so the local zone can't shift days.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The local ISO date (YYYY-MM-DD) in an IANA time zone at a moment. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone);
  } catch {
    parts = fmt('UTC'); // an invalid zone falls back to UTC
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * An ISO date for people: 'Sun, Oct 18' (short), 'Sunday, October 18' (long)
 * or 'Oct 18' (date). UTC math, so the local zone can't shift the day.
 */
export function formatDay(iso: string, style: 'short' | 'long' | 'date' = 'short'): string {
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    ...(style === 'date' ? {} : { weekday: style }),
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
  });
}
