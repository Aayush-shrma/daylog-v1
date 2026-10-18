/** Timezone-safe date helpers.
 *
 * Rule: never `new Date("YYYY-MM-DD")`. Parsing an ISO date string that way is
 * treated as UTC midnight and can shift the day for anyone west of Greenwich.
 * Everything here works on plain integers instead, except `todayISO`, which
 * reads the local wall clock through the date *components* (never a parse).
 */

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface DateParts {
  y: number;
  m: number;
  d: number;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const { y, m, d } = parseISO(value);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Parse "YYYY-MM-DD" by hand so the browser timezone can never shift a day. */
export function parseISO(iso: string): DateParts {
  return {
    y: Number(iso.slice(0, 4)),
    m: Number(iso.slice(5, 7)),
    d: Number(iso.slice(8, 10)),
  };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Sakamoto's algorithm: 0 = Sunday … 6 = Saturday. Integer maths only. */
export function weekdayISO(iso: string): number {
  const { y, m, d } = parseISO(iso);
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  const sum =
    yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) +
    t[m - 1] + d;
  return ((sum % 7) + 7) % 7;
}

export function monthKeyISO(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabelISO(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}

/** Days since 1970-01-01 (Howard Hinnant's `days_from_civil`). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of `daysFromCivil`. */
export function civilFromDays(z: number): DateParts {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: m <= 2 ? y + 1 : y, m, d };
}

export function addDaysISO(iso: string, delta: number): string {
  const { y, m, d } = parseISO(iso);
  const p = civilFromDays(daysFromCivil(y, m, d) + delta);
  return isoFromParts(p.y, p.m, p.d);
}

export function diffDays(laterISO: string, earlierISO: string): number {
  const a = parseISO(laterISO);
  const b = parseISO(earlierISO);
  return daysFromCivil(a.y, a.m, a.d) - daysFromCivil(b.y, b.m, b.d);
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today in the *browser's* local timezone, as "YYYY-MM-DD". */
export function todayISO(): string {
  const now = new Date();
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "17 Oct 2026" */
export function formatDate(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "17 October 2026" */
export function formatDateLong(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Sat, 17 Oct 2026" */
export function formatDateWithWeekday(iso: string): string {
  return `${WEEKDAYS[weekdayISO(iso)]}, ${formatDate(iso)}`;
}

/** 1-based "Day N" label for a date, given the user's start date. */
export function dayNumberFor(iso: string, startISO: string): number {
  return diffDays(iso, startISO) + 1;
}
