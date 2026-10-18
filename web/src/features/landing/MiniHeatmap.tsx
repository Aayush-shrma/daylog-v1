import { useMemo } from "react";

import { addDaysISO, todayISO } from "@/lib/date";
import { buildHeatmapColumns } from "@/lib/heatmap";
import { cn } from "@/lib/utils";

/** Deterministic pseudo-random level so the sample preview is stable across renders. */
function sampleLevel(iso: string): number {
  let hash = 2166136261;
  for (let i = 0; i < iso.length; i++) {
    hash ^= iso.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bite = Math.abs(hash) % 100;
  if (bite < 42) return 0;
  if (bite < 62) return 1;
  if (bite < 78) return 2;
  if (bite < 92) return 3;
  return 4;
}

const LEVEL_CLASS = ["bg-hm-0", "bg-hm-1", "bg-hm-2", "bg-hm-3", "bg-hm-4"] as const;

export function MiniHeatmap({ days = 182, cell = 8 }: { days?: number; cell?: number }) {
  const grid = useMemo(() => {
    const today = todayISO();
    const list = Array.from({ length: days }, (_, i) => {
      const date = addDaysISO(today, i - (days - 1));
      const level = sampleLevel(date);
      return { date, count: level, level };
    });
    return buildHeatmapColumns(list);
  }, [days]);

  return (
    <div
      className="overflow-hidden"
      aria-hidden="true"
      style={{ ["--hm-cell" as string]: `${cell}px` } as React.CSSProperties}
    >
      <div
        className="flex w-max"
        style={{ gap: "3px" }}
      >
        {grid.columns.map((column, ci) =>
          column.type === "spacer" ? (
            <span key={`sp-${ci}`} style={{ width: "var(--hm-cell)" }} />
          ) : (
            <div key={`wk-${ci}`} className="flex flex-col" style={{ gap: "3px" }}>
              {column.days.map((day, r) =>
                day ? (
                  <span
                    key={day.date}
                    className={cn("rounded-[2px]", LEVEL_CLASS[Math.max(0, Math.min(4, day.level))])}
                    style={{ width: "var(--hm-cell)", height: "var(--hm-cell)" }}
                  />
                ) : (
                  <span
                    key={`pad-${r}`}
                    className="rounded-[2px] bg-transparent"
                    style={{ width: "var(--hm-cell)", height: "var(--hm-cell)" }}
                  />
                ),
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
