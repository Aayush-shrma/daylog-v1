import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultCard } from "@/features/result/ResultCard";
import { api, ApiError } from "@/lib/api";
import { dayNumberFor, todayISO } from "@/lib/date";
import { tweetAuthor } from "@/lib/user";
import { useApp } from "@/store/app";
import type { LogOut } from "@/types";

export function DayLookup({
  jumpToDay = null,
  onJumpConsumed,
}: {
  jumpToDay?: number | null;
  onJumpConsumed?: () => void;
}) {
  const { user, refreshStats, run } = useApp();
  const [value, setValue] = useState("");
  const [log, setLog] = useState<LogOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (day: number) => {
      setLoading(true);
      setError(null);
      setLog(null);
      try {
        const found = await run(() => api.getByDay(day));
        setLog(found);
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 404
            ? `No log for day ${day}.`
            : "Could not load that day.",
        );
      } finally {
        setLoading(false);
      }
    },
    [run],
  );

  useEffect(() => {
    if (jumpToDay === null) return;
    setValue(String(jumpToDay));
    void load(jumpToDay);
    onJumpConsumed?.();
  }, [jumpToDay, load, onJumpConsumed]);

  if (!user) return null;
  const currentDay = dayNumberFor(todayISO(), user.start_date);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1) {
      setError("Enter a day number of 1 or more.");
      return;
    }
    void load(day);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">Day lookup</h2>
        <p className="mb-4 text-[13px] text-fg-muted">
          Jump straight to a day. You're currently on day{" "}
          <span className="font-medium text-fg">{currentDay}</span>.
        </p>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[8rem] flex-1 space-y-1.5">
            <Label htmlFor="day-number">Day number</Label>
            <Input
              id="day-number"
              type="number"
              min={1}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={String(currentDay)}
            />
          </div>
          <Button type="submit" variant="primary" loading={loading}>
            <Search className="size-4" aria-hidden="true" />
            Find day
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </section>

      {log ? (
        <ResultCard
          log={log}
          used={null}
          notice={null}
          author={tweetAuthor(user)}
          onSaved={(next) => {
            setLog(next);
            void refreshStats();
          }}
          onRegenerated={(result) => setLog(result.log)}
          onClose={() => setLog(null)}
        />
      ) : null}
    </div>
  );
}
