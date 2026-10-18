import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl",
    "font-medium tracking-[-0.01em] transition-[transform,box-shadow,background-color,color,border-color,opacity]",
    "duration-150 ease-smooth active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "[&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "shine bg-accent text-accent-ink shadow-[0_6px_20px_-10px_var(--ring)] hover:-translate-y-px hover:bg-accent-strong hover:shadow-[0_12px_30px_-10px_var(--ring)]",
        secondary:
          "border border-border bg-surface-2 text-fg hover:-translate-y-px hover:border-border-strong",
        outline:
          "border border-border-strong bg-transparent text-fg hover:bg-surface-2",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        destructive: "bg-danger text-white hover:opacity-90",
        google:
          "border border-black/10 bg-white text-[#1f1f1f] hover:-translate-y-px hover:bg-white/95 hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.6)]",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && !asChild ? (
        <>
          <Spinner />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}

export { buttonVariants };
