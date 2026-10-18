import { motion } from "motion/react";

import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AuthPanel } from "@/features/auth/AuthPanel";
import { MiniHeatmap } from "@/features/landing/MiniHeatmap";
import { useTheme } from "@/theme";
import { Moon, Sun } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Landing() {
  const { theme, toggle } = useTheme();

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 h-[38rem] opacity-70"
        style={{ background: "var(--glow)" }}
        aria-hidden="true"
      />
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="bg-noise pointer-events-none absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Logo />
        <button
          type="button"
          onClick={toggle}
          className="grid size-10 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-8 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
        <div className="space-y-8">
          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0} className="space-y-5">
            <Badge variant="accent">#100DaysOfCode, tidied</Badge>
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-fg sm:text-5xl lg:text-6xl">
              Turn a messy log into a{" "}
              <span className="text-accent">clean one</span>.
            </h1>
            <p className="max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
              Write your day however you like. DayLog turns it into tidy bullets and a
              tweet-ready draft — and keeps a streak and heatmap so you can see the run building.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.08}>
            <div className="shine relative max-w-lg rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-2)]">
              <Badge variant="outline" className="absolute -top-2.5 left-5 bg-surface">
                Sample
              </Badge>
              <div className="flex items-start gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>AY</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <span className="font-semibold text-fg">Aayush</span>
                    <span className="text-fg-subtle">@aayush · 2h</span>
                  </div>
                  <p className="mt-1 font-mono text-[14px] leading-relaxed text-fg">
                    Day 42 of #100DaysOfCode: fixed the auth bug, read about postgres indexes,
                    wrote 3 tests. Shipped the login flow 🚀
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.16}>
            <div className="max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <p className="mb-3 text-[12px] font-medium uppercase tracking-wider text-fg-subtle">
                Your year, at a glance
              </p>
              <MiniHeatmap />
            </div>
          </motion.div>
        </div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.24}>
          <AuthPanel />
        </motion.div>
      </main>
    </div>
  );
}
