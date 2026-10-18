import { useCallback, useState } from "react";
import { Flame } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/features/composer/Composer";
import { Heatmap } from "@/features/heatmap/Heatmap";
import { ResultCard } from "@/features/result/ResultCard";
import { StatsBar } from "@/features/stats/StatsBar";
import { api, ApiError } from "@/lib/api";
import { dayNumberFor } from "@/lib/date";
import { tweetAuthor } from "@/lib/user";
import { useApp } from "@/store/app";
import type { LogOut, LogResult } from "@/types";

export interface EditorState {
  log: LogOut;
  used: string | null;
  notice: string | null;
}

export function TodayView() {
  const { user, stats, statsLoading, refreshStats, run } = useApp();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const openDate = useCallback(
    async (date: string) => {
      if (!user) return;
      const dayNumber = dayNumberFor(date, user.start_date);
      try {
        const log = await run(() => api.getByDay(dayNumber));
        setEditor({ log, used: null, notice: null });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not open that day");
      }
    },
    [run, user],
  );

  if (!user) return null;

  return (
    <div className="space-y-4">
      <Composer
        onCreated={(result: LogResult) => setEditor({ log: result.log, used: result.used, notice: result.notice })}
        onOpen={(log) => setEditor({ log, used: null, notice: null })}
      />

      {editor ? (
        <ResultCard
          log={editor.log}
          used={editor.used}
          notice={editor.notice}
          author={tweetAuthor(user)}
          onSaved={(log) => {
            setEditor((prev) => (prev ? { ...prev, log } : prev));
            void refreshStats();
          }}
          onRegenerated={(result) => {
            setEditor({ log: result.log, used: result.used, notice: result.notice });
          }}
          onClose={() => setEditor(null)}
        />
      ) : null}

      {stats ? (
        <>
          <StatsBar stats={stats} />
          <Heatmap stats={stats} onSelectDate={(date) => void openDate(date)} />
        </>
      ) : statsLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[86px] rounded-[var(--radius-card)]" />
            ))}
          </div>
          <Skeleton className="h-[220px] rounded-[var(--radius-card)]" />
        </div>
      ) : (
        <EmptyState
          icon={<Flame className="size-5" />}
          title="No streak yet"
          hint="Log your first day above and your streak, totals and heatmap will appear here."
        />
      )}
    </div>
  );
}
