/** Heatmap grid builder — PORTED verbatim from static/js/heatmap.js.
 *
 * Pure logic: no DOM, no network, no `new Date("YYYY-MM-DD")`. It turns the
 * rolling list of days from /stats (ascending, consecutive, ending today) into
 * week columns (Sunday on top) with one empty spacer column at each month
 * boundary, LeetCode-style. Behaviour is unchanged; only the types are new.
 */

import { MONTHS, monthKeyISO, monthLabelISO, weekdayISO } from "@/lib/date";
import type { HeatmapDay } from "@/types";

export interface HeatmapCell {
  date: string;
  count: number;
  level: number;
}

export interface HeatmapWeekColumn {
  type: "week";
  days: (HeatmapCell | null)[];
  monthKey: string;
}

export interface HeatmapSpacerColumn {
  type: "spacer";
}

export type HeatmapColumn = HeatmapWeekColumn | HeatmapSpacerColumn;

export interface HeatmapMonthBlock {
  key: string;
  label: string;
  startCol: number;
  span: number;
}

export interface HeatmapGrid {
  columns: HeatmapColumn[];
  months: HeatmapMonthBlock[];
  weekCount: number;
  totalColumns: number;
}

export interface HeatmapDayInput {
  date: string;
  count?: number;
  level?: number;
}

export function isWeekColumn(col: HeatmapColumn | undefined): col is HeatmapWeekColumn {
  return col?.type === "week";
}

/**
 * days: [{ date: "YYYY-MM-DD", count: number, level: number }, …] ascending.
 *
 * A week column belongs to the month of its earliest day; the spacer is
 * inserted between the last column of a month and the first of the next.
 */
export function buildHeatmapColumns(days: HeatmapDayInput[]): HeatmapGrid {
  const weeks: (HeatmapCell | null)[][] = [];
  let col: (HeatmapCell | null)[] | null = null;

  for (const day of days) {
    const row = weekdayISO(day.date);
    if (col === null || row === 0) {
      if (col !== null) weeks.push(col);
      col = new Array<HeatmapCell | null>(7).fill(null);
    }
    col[row] = {
      date: day.date,
      count: day.count || 0,
      level: day.level || 0,
    };
  }
  if (col !== null) weeks.push(col);

  const columns: HeatmapColumn[] = [];
  const months: HeatmapMonthBlock[] = [];
  let prevMonth: string | null = null;
  let block: HeatmapMonthBlock | null = null;

  for (let c = 0; c < weeks.length; c++) {
    const week = weeks[c];
    let first: HeatmapCell | null = null;
    for (let r = 0; r < 7; r++) {
      if (week[r]) {
        first = week[r];
        break;
      }
    }
    if (!first) continue; // defensive: an all-empty week has no month
    const mKey = monthKeyISO(first.date);
    const changed = prevMonth !== null && mKey !== prevMonth;

    if (changed) columns.push({ type: "spacer" });

    const index = columns.length;
    columns.push({ type: "week", days: week, monthKey: mKey });

    if (prevMonth === null || changed || block === null) {
      block = {
        key: mKey,
        label: monthLabelISO(first.date),
        startCol: index,
        span: 1,
      };
      months.push(block);
    } else {
      block.span += 1;
    }
    prevMonth = mKey;
  }

  return {
    columns,
    months,
    weekCount: weeks.length,
    totalColumns: columns.length,
  };
}

/** Convenience for the UI: the count total shown above the grid. */
export function sumCounts(days: HeatmapDay[]): number {
  return days.reduce((total, day) => total + (day.count || 0), 0);
}

export { MONTHS };
