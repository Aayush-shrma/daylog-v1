import type * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-border bg-surface-2/60 px-3.5 py-3 text-sm leading-relaxed text-fg",
        "placeholder:text-fg-subtle transition-shadow duration-200 ease-smooth",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
