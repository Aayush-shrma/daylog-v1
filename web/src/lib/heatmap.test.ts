/** Heatmap grid builder tests — the same seven checks as the old
 * scripts/heatmap_check.js, ported to Vitest. The logic under test is the pure
 * builder in @/lib/heatmap: no DOM, no network, no date parsing.
 */

import { describe, expect, it } from "vitest";

import { addDaysISO, MONTHS, monthKeyISO, weekdayISO } from "@/lib/date";
import {
  buildHeatmapColumns,
  type HeatmapColumn,
  type HeatmapDayInput,
  type HeatmapWeekColumn,
} from "@/lib/heatmap";

function rangeDays(
  startISO: string,
  n: number,
  counts: Record<string, number> = {},
): HeatmapDayInput[] {
  const days: HeatmapDayInput[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDaysISO(startISO, i);
    const count = counts[date] ?? 0;
    days.push({ date, count, level: count > 0 ? Math.min(count, 4) : 0 });
  }
  return days;
}

function isWeek(col: HeatmapColumn): col is HeatmapWeekColumn {
  return col.type === "week";
}

function weekColumns(columns: HeatmapColumn[]): HeatmapWeekColumn[] {
  return columns.filter(isWeek);
}

function spacerNeighbors(columns: HeatmapColumn[]) {
  const out: Array<{ before: HeatmapColumn; after: HeatmapColumn }> = [];
  for (let i = 0; i < columns.length; i++) {
    if (columns[i].type === "spacer") {
      out.push({ before: columns[i - 1], after: columns[i + 1] });
    }
  }
  return out;
}

describe("weekdayISO", () => {
  it("knows known dates and today (Sat 2026-10-17)", () => {
    expect(weekdayISO("2000-01-01")).toBe(6);
    expect(weekdayISO("2026-10-17")).toBe(6);
    expect(weekdayISO("2026-10-18")).toBe(0);
    for (let w = 0; w < 7; w++) {
      expect(weekdayISO(addDaysISO("2026-10-18", w))).toBe(w);
    }
  });
});

describe("buildHeatmapColumns", () => {
  it("pads a partial first column", () => {
    const start = "2025-12-01";
    const { columns } = buildHeatmapColumns(rangeDays(start, 365));
    expect(columns[0].type).toBe("week");
    const first = (columns[0] as HeatmapWeekColumn).days;
    const dow = weekdayISO(start);
    for (let r = 0; r < dow; r++) expect(first[r]).toBeNull();
    expect(first[dow]?.date).toBe(start);
    const nonNull = first.filter(Boolean).map((d) => d!.date);
    expect(nonNull.length).toBe(7 - dow);
    expect(nonNull[0]).toBe(start);
    expect(nonNull[nonNull.length - 1]).toBe(addDaysISO(start, 6 - dow));
  });

  it("puts the newest day at the right edge with no future cells", () => {
    const end = "2026-10-17";
    const start = addDaysISO(end, -364);
    const { columns } = buildHeatmapColumns(rangeDays(start, 365));
    const last = columns[columns.length - 1] as HeatmapWeekColumn;
    expect(last.type).toBe("week");
    const dow = weekdayISO(end);
    expect(last.days[dow]?.date).toBe(end);
    for (let r = dow + 1; r < 7; r++) expect(last.days[r]).toBeNull();

    const all = weekColumns(columns).flatMap((c) => c.days).filter(Boolean);
    expect(all.length).toBe(365);
    expect(all[all.length - 1]!.date).toBe(end);
    expect(all[0]!.date).toBe(start);
  });

  it("places today in its weekday row for every possible weekday", () => {
    for (let w = 0; w < 7; w++) {
      let end = "2026-01-01";
      while (weekdayISO(end) !== w) end = addDaysISO(end, 1);
      const { columns, months } = buildHeatmapColumns(rangeDays(addDaysISO(end, -364), 365));
      const last = columns[columns.length - 1] as HeatmapWeekColumn;
      expect(last.type).toBe("week");
      expect(weekdayISO(end)).toBe(w);
      expect(last.days[w]?.date).toBe(end);
      for (let r = w + 1; r < 7; r++) expect(last.days[r]).toBeNull();
      expect(months.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("inserts exactly one spacer between month blocks", () => {
    const { columns, months, weekCount, totalColumns } = buildHeatmapColumns(
      rangeDays("2025-12-01", 365),
    );

    expect(columns[0].type).toBe("week");
    expect(columns[columns.length - 1].type).not.toBe("spacer");

    for (const { before, after } of spacerNeighbors(columns)) {
      expect(before.type).toBe("week");
      expect(after.type).toBe("week");
      expect((before as HeatmapWeekColumn).monthKey).not.toBe(
        (after as HeatmapWeekColumn).monthKey,
      );
    }
    for (let i = 1; i < columns.length; i++) {
      const a = columns[i - 1];
      const b = columns[i];
      if (b.type === "spacer") continue;
      if (a.type === "week" && isWeek(b) && a.monthKey !== b.monthKey) {
        throw new Error(`missing spacer between ${a.monthKey} and ${b.monthKey}`);
      }
    }

    const spacers = columns.filter((c) => c.type === "spacer").length;
    expect(spacers).toBe(months.length - 1);
    expect(totalColumns).toBe(weekCount + spacers);

    for (const m of months) {
      for (let c = m.startCol; c < m.startCol + m.span; c++) {
        const col = columns[c];
        expect(col.type).toBe("week");
        expect((col as HeatmapWeekColumn).monthKey).toBe(m.key);
        expect(m.label).toBe(MONTHS[Number(m.key.slice(5, 7)) - 1]);
      }
      const after = columns[m.startCol + m.span];
      if (after) expect(after.type).toBe("spacer");
    }

    const spanSum = months.reduce((s, m) => s + m.span, 0);
    expect(spanSum).toBe(weekCount);
  });

  it("adds a spacer across a year boundary (Dec → Jan)", () => {
    const { columns, months } = buildHeatmapColumns(rangeDays("2025-12-01", 365));
    const keys = months.map((m) => m.key);
    expect(keys).toContain("2025-12");
    expect(keys).toContain("2026-01");
    const at = columns.findIndex(
      (c, i) =>
        c.type === "spacer" &&
        (columns[i - 1] as HeatmapWeekColumn).monthKey === "2025-12" &&
        (columns[i + 1] as HeatmapWeekColumn).monthKey === "2026-01",
    );
    expect(at).toBeGreaterThan(0);
  });

  it("gives a single-column first month when the window starts on the last day", () => {
    const { months, columns } = buildHeatmapColumns(rangeDays("2026-01-31", 365));
    expect(months[0].key).toBe("2026-01");
    expect(months[0].span).toBe(1);
    expect((columns[0] as HeatmapWeekColumn).days.filter(Boolean).length).toBe(1);
    expect(months[1].span).toBeGreaterThanOrEqual(2);
  });

  it("labels only months wide enough to hold a label", () => {
    const { months } = buildHeatmapColumns(rangeDays("2026-01-31", 365));
    const key = months[0].key;
    expect(monthKeyISO(`${key}-01`)).toBe(key);
    expect(months[0].label).toBe(MONTHS[Number(key.slice(5, 7)) - 1]);
  });
});
