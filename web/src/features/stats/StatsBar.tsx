import { CalendarCheck, Flame, ListChecks, Trophy, type LucideIcon } from "lucide-react";

import { useCountUp } from "@/hooks/useCountUp";
import { cn } from "@/lib/utils";
import type { Stats } from "@/types";

export function StatCard({
  label,
  value,
  icon: Icon,
  animate = true,
  pulse = false,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  animate?: boolean;
  pulse?: boolean;
}) {
  const shown = useCountUp(value, { enabled: animate });
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-fg-subtle">
        <Icon className={cn("size-3.5", pulse && "motion-safe:animate-pulse text-accent")} aria-hidden="true" />
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-[-0.02em] text-fg">
        {shown}
      </p>
    </div>
  );
}

export function StatsBar({ stats, animate = true }: { stats: Stats; animate?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Current streak"
        value={stats.current_streak}
        icon={Flame}
        animate={animate}
        pulse={stats.current_streak > 0}
      />
      <StatCard label="Longest streak" value={stats.longest_streak} icon={Trophy} animate={animate} />
      <StatCard label="Active days" value={stats.total_days} icon={CalendarCheck} animate={animate} />
      <StatCard label="Items logged" value={stats.total_items} icon={ListChecks} animate={animate} />
    </div>
  );
}
