import type * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface-2/60 px-3.5 text-sm text-fg",
        "placeholder:text-fg-subtle transition-shadow duration-200 ease-smooth",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/25",
        className,
      )}
      {...props}
    />
  );
}
