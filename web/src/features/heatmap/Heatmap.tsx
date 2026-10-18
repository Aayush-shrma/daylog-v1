import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatDateLong, todayISO, weekdayISO } from "@/lib/date";
import { buildHeatmapColumns, type HeatmapCell } from "@/lib/heatmap";
import { cn } from "@/lib/utils";
import type { Stats } from "@/types";

const GAP = 3;
const MIN_CELL = 7;
const MAX_CELL = 13;
const LEVEL_CLASS = [
  "bg-hm-0",
  "bg-hm-1",
  "bg-hm-2",
  "bg-hm-3",
  "bg-hm-4",
] as const;

function tooltipText(day: HeatmapCell): string {
  const date = formatDateLong(day.date);
  if (day.count > 0) {
    return `${day.count} ${day.count === 1 ? "item" : "items"} on ${date}`;
  }
  return `No log on ${date}`;
}

interface HeatmapProps {
  stats: Stats;
  onSelectDate: (date: string) => void;
}

export function Heatmap({ stats, onSelectDate }: HeatmapProps) {
  const grid = useMemo(() => buildHeatmapColumns(stats.heatmap), [stats.heatmap]);
  const cols = grid.columns.length;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(MAX_CELL);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  const today = todayISO();

  const sizeHeatmap = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const available = wrap.clientWidth;
    if (!available || cols === 0) return;
    const fit = Math.floor((available - (cols - 1) * GAP) / cols);
    setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, fit)));
  }, [cols]);

  useLayoutEffect(() => {
    sizeHeatmap();
  }, [sizeHeatmap]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", sizeHeatmap);
      return () => window.removeEventListener("resize", sizeHeatmap);
    }
    const observer = new ResizeObserver(sizeHeatmap);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [sizeHeatmap]);

  // Keep today visible on narrow screens.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.scrollLeft = wrap.scrollWidth;
  }, [cell, cols]);

  const showTip = (target: HTMLElement, day: HeatmapCell) => {
    const rect = target.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top, text: tooltipText(day) });
  };

  const hideTip = () => setTip(null);

  const styleVars = { "--hm-cell": `${cell}px` } as React.CSSProperties;
  const cellStyle: React.CSSProperties = {
    width: "var(--hm-cell)",
    height: "var(--hm-cell)",
  };

  // Diagonal wave: cells nearer the top-left arrive first. Capped so the last
  // column still lands quickly on a 53-column grid.
  const dayStyle = (ci: number, r: number) =>
    ({
      ...cellStyle,
      "--hm-delay": `${Math.min(520, (ci + r) * 9)}ms`,
    }) as React.CSSProperties;

  return (
    <section
      className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
      aria-label="Activity heatmap"
    >
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-[13px] text-fg-muted">
          <span className="font-semibold text-fg">{stats.total_items}</span>{" "}
          {stats.total_items === 1 ? "item" : "items"} in the past year
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-muted">
          <span>
            Total active days: <span className="font-semibold text-fg">{stats.total_days}</span>
          </span>
          <span>
            Max streak: <span className="font-semibold text-fg">{stats.longest_streak}</span>
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="text-[11px]">Less</span>
            {LEVEL_CLASS.map((cls) => (
              <span
                key={cls}
                className={cn("size-[10px] rounded-[3px]", cls)}
                aria-hidden="true"
              />
            ))}
            <span className="text-[11px]">More</span>
          </span>
        </div>
      </header>

      <div className="flex gap-2" style={styleVars}>
        <div
          className="hidden shrink-0 grid-cols-1 sm:grid"
          style={{ gridTemplateRows: `repeat(7, var(--hm-cell))`, gap: `${GAP}px` }}
          aria-hidden="true"
        >
          {Array.from({ length: 7 }, (_, r) => (
            <span
              key={r}
              className="flex items-center justify-end text-[10px] leading-none text-fg-subtle"
              style={{ width: "1.5rem" }}
            >
              {r === 1 ? "Mon" : r === 3 ? "Wed" : r === 5 ? "Fri" : ""}
            </span>
          ))}
        </div>

        <div ref={wrapRef} className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className="w-max">
            <div
              className="grid"
              style={{
                gridAutoFlow: "column",
                gridTemplateRows: `repeat(7, var(--hm-cell))`,
                gap: `${GAP}px`,
              }}
            >
              {grid.columns.map((column, ci) => {
                if (column.type === "spacer") {
                  return Array.from({ length: 7 }, (_, r) => (
                    <span
                      key={`spacer-${ci}-${r}`}
                      className={cn("rounded-[3px] bg-transparent", LEVEL_CLASS[0], "opacity-0")}
                      style={cellStyle}
                      aria-hidden="true"
                    />
                  ));
                }
                return column.days.map((day, r) => {
                  if (!day) {
                    return (
                      <span
                        key={`pad-${ci}-${r}`}
                        className="rounded-[3px] bg-transparent"
                        style={cellStyle}
                        aria-hidden="true"
                      />
                    );
                  }
                  const isToday = day.date === today;
                  const label = tooltipText(day);
                  const level = Math.max(0, Math.min(4, day.level));
                  const shared = cn(
                    "hm-in rounded-[3px] transition-transform duration-150 ease-smooth",
                    LEVEL_CLASS[level],
                    isToday && "ring-1 ring-accent ring-offset-1 ring-offset-[var(--surface)]",
                    day.count > 0 && "hover:scale-125 focus-visible:scale-125",
                  );
                  if (day.count > 0) {
                    return (
                      <button
                        key={day.date}
                        type="button"
                        tabIndex={0}
                        className={cn(shared, "cursor-pointer")}
                        style={dayStyle(ci, r)}
                        aria-label={label}
                        onMouseEnter={(e) => showTip(e.currentTarget, day)}
                        onMouseLeave={hideTip}
                        onFocus={(e) => showTip(e.currentTarget, day)}
                        onBlur={hideTip}
                        onClick={() => onSelectDate(day.date)}
                      />
                    );
                  }
                  return (
                    <span
                      key={day.date}
                      role="img"
                      aria-disabled="true"
                      aria-label={label}
                      className={cn(shared, "cursor-default")}
                      style={dayStyle(ci, r)}
                      onMouseEnter={(e) => showTip(e.currentTarget, day)}
                      onMouseLeave={hideTip}
                    />
                  );
                });
              })}
            </div>

            <div
              className="mt-2 grid"
              style={{
                gridAutoFlow: "column",
                gridAutoColumns: "var(--hm-cell)",
                gap: `${GAP}px`,
              }}
              aria-hidden="true"
            >
              {grid.columns.map((column, ci) => {
                if (column.type === "spacer") {
                  return <span key={`mlabel-${ci}`} />;
                }
                const month = grid.months.find((m) => m.startCol === ci && m.span >= 2);
                return (
                  <span
                    key={`mlabel-${ci}`}
                    className="whitespace-nowrap text-[10px] leading-none text-fg-subtle"
                  >
                    {month ? month.label : ""}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {tip
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-border-strong bg-elevated px-2.5 py-1.5 text-[12px] text-fg shadow-[var(--shadow-2)]"
              style={{ left: tip.x, top: tip.y - 8 }}
            >
              {tip.text}
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

export function weekdayRowForToday(): number {
  return weekdayISO(todayISO());
}
