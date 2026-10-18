import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg-subtle">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {hint ? <p className="mx-auto max-w-sm text-[13px] text-fg-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}
