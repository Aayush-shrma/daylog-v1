import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  name,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  name: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        "relative inline-flex rounded-xl border border-border bg-surface-2/60 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 inline-flex h-8 flex-1 items-center justify-center rounded-lg px-3 text-[13px] font-medium",
              "transition-colors duration-200 ease-smooth",
              active ? "text-accent-ink" : "text-fg-muted hover:text-fg",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`segmented-${name}`}
                className="absolute inset-0 -z-10 rounded-lg bg-accent shadow-[0_6px_18px_-10px_var(--ring)]"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
