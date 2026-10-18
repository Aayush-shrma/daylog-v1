import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { motion } from "motion/react";
import { Toaster } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VerifyEmailPage } from "@/features/auth/VerifyEmailPage";
import { DayLookup } from "@/features/day/DayLookup";
import { Landing } from "@/features/landing/Landing";
import { SearchPanel } from "@/features/search/SearchPanel";
import { SettingsPanel } from "@/features/settings/SettingsPanel";
import { MobileTabBar, TopBar, type TabKey } from "@/features/shell/TopBar";
import { TodayView } from "@/features/today/TodayView";
import { AppProvider, useApp } from "@/store/app";
import { ThemeProvider, useTheme } from "@/theme";

const EASE = [0.22, 1, 0.36, 1] as const;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => {
    ready?: Promise<void>;
    finished?: Promise<void>;
  };
};

function supportsViewTransitions(): boolean {
  if (typeof document === "undefined") return false;
  const reduced =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  return !reduced && typeof (document as ViewTransitionDocument).startViewTransition === "function";
}

// cmdk is only needed once the palette opens, so keep it out of the first load.
const CommandPalette = lazy(() =>
  import("@/components/CommandPalette").then((mod) => ({ default: mod.CommandPalette })),
);

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="bottom-right" theme={theme} richColors closeButton />;
}

function BootScreen() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
      <Skeleton className="h-11 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-[220px] w-full rounded-[var(--radius-card)]" />
    </div>
  );
}

function Shell() {
  const { booting, user } = useApp();
  const [tab, setTab] = useState<TabKey>("today");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [jumpToDay, setJumpToDay] = useState<number | null>(null);
  const [viewTransitions] = useState(supportsViewTransitions);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Switch tabs through the View Transitions API when the browser has it, so
  // the outgoing and incoming views cross-fade. The plain state update is the
  // fallback (and a safety net in case a transition never starts).
  const changeTab = useCallback(
    (next: TabKey) => {
      if (!viewTransitions) {
        setTab(next);
        return;
      }
      const doc = document as ViewTransitionDocument;
      let applied = false;
      const apply = () => {
        if (applied) return;
        applied = true;
        setTab(next);
      };
      try {
        const transition = doc.startViewTransition?.(() => {
          applied = true;
          flushSync(() => setTab(next));
        });
        // `ready` rejects when the browser skips the snapshot (hidden doc,
        // rapid switches); `finished` rejects when a transition is aborted.
        // Neither is actionable, and an unhandled rejection would surface in
        // the console, so swallow both.
        transition?.ready?.catch(() => undefined);
        transition?.finished?.catch(() => undefined);
      } catch {
        apply();
        return;
      }
      window.setTimeout(apply, 200);
    },
    [viewTransitions],
  );

  const handleJumpToDay = useCallback(
    (day: number) => {
      setJumpToDay(day);
      changeTab("day");
    },
    [changeTab],
  );

  const consumeJump = useCallback(() => setJumpToDay(null), []);

  if (booting) return <BootScreen />;
  if (!user) return <Landing />;

  const view = (
    <>
      {tab === "today" ? <TodayView /> : null}
      {tab === "day" ? <DayLookup jumpToDay={jumpToDay} onJumpConsumed={consumeJump} /> : null}
      {tab === "search" ? <SearchPanel /> : null}
      {tab === "settings" ? <SettingsPanel /> : null}
    </>
  );

  return (
    <>
      <TopBar tab={tab} onTabChange={changeTab} onOpenPalette={() => setPaletteOpen(true)} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 md:pb-12">
        {viewTransitions ? (
          // Keyed on the tab: the browser cross-fades the old and new views.
          <div key={tab} className="view-anim">
            {view}
          </div>
        ) : (
          // Same cross-fade, done by Motion, when View Transitions are absent
          // or the user asked for reduced motion.
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {view}
          </motion.div>
        )}
      </main>
      <MobileTabBar tab={tab} onTabChange={changeTab} />
      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onNavigate={changeTab}
          onJumpToDay={handleJumpToDay}
        />
      </Suspense>
    </>
  );
}

function isVerifyRoute(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/+$/, "") === "/verify";
}

export default function App() {
  const [verifyRoute] = useState(isVerifyRoute);
  return (
    <ThemeProvider>
      {verifyRoute ? (
        <VerifyEmailPage />
      ) : (
        <AppProvider>
          <TooltipProvider>
            <Shell />
          </TooltipProvider>
        </AppProvider>
      )}
      <ThemedToaster />
    </ThemeProvider>
  );
}
