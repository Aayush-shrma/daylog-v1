import {
  CalendarDays,
  Command as CommandIcon,
  Flame,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";

import { AccountMenu } from "@/features/account/AccountMenu";
import { Logo } from "@/components/Logo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApp } from "@/store/app";
import { useTheme } from "@/theme";

export type TabKey = "today" | "day" | "search" | "settings";

export interface TabDef {
  value: TabKey;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const TABS: TabDef[] = [
  { value: "today", label: "Today", short: "Today", icon: Sparkles },
  { value: "day", label: "Day lookup", short: "Days", icon: CalendarDays },
  { value: "search", label: "Search", short: "Search", icon: Search },
  { value: "settings", label: "Settings", short: "Settings", icon: SettingsIcon },
];

export function TopBar({
  tab,
  onTabChange,
  onOpenPalette,
}: {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onOpenPalette: () => void;
}) {
  const { stats } = useApp();
  const { theme, toggle } = useTheme();
  const streak = stats?.current_streak ?? 0;

  return (
    <header className="glass sticky top-0 z-40 border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <a href="/" className="mr-1 shrink-0" aria-label="DayLog home">
          <Logo />
        </a>

        <Tabs value={tab} onValueChange={(value) => onTabChange(value as TabKey)} className="hidden md:block">
          <TabsList aria-label="Sections">
            {TABS.map((item) => {
              const active = item.value === tab;
              return (
                <TabsTrigger key={item.value} value={item.value}>
                  <item.icon aria-hidden="true" />
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="lg:hidden">{item.short}</span>
                  {active ? (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                      transition={{ type: "spring", stiffness: 520, damping: 40 }}
                    />
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[12px] text-fg-muted sm:inline-flex">
            <Flame className="size-3.5 text-accent motion-safe:animate-pulse" aria-hidden="true" />
            <span className="font-medium text-fg">{streak}</span>
            <span>day streak</span>
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenPalette}
                className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-[12px] text-fg-subtle transition-colors hover:text-fg md:inline-flex"
                aria-label="Open command palette"
              >
                <CommandIcon className="size-3.5" aria-hidden="true" />
                <span>K</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Command palette</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggle}
                className="grid size-10 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? "Light theme" : "Dark theme"}</TooltipContent>
          </Tooltip>

          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar({
  tab,
  onTabChange,
}: {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Sections"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-around px-2">
        {TABS.map((item) => {
          const active = item.value === tab;
          return (
            <li key={item.value} className="flex-1">
              <button
                type="button"
                onClick={() => onTabChange(item.value)}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2 text-[11px] transition-colors " +
                  (active ? "text-accent" : "text-fg-subtle hover:text-fg")
                }
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.short}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
