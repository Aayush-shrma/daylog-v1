import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid size-7 place-items-center rounded-lg bg-accent-soft">
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="4" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <path d="M3 9h18" stroke="var(--accent)" strokeWidth="2" />
          <path
            d="M8.5 14.5l2.5 2.5 4.5-5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
        Day<span className="text-accent">Log</span>
      </span>
    </span>
  );
}
