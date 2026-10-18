import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { dayNumberFor, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app";
import type { LogOut, LogResult } from "@/types";

const PLACEHOLDER =
  "woke up late, fixed the auth bug finally, read about postgres indexes, wrote 3 tests, skipped the gym";

export function Composer({
  onCreated,
  onOpen,
}: {
  onCreated: (result: LogResult) => void;
  onOpen: (log: LogOut) => void;
}) {
  const { llm, refreshStats, run, user } = useApp();
  const [raw, setRaw] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictDay, setConflictDay] = useState<number | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 320)}px`;
  }, [raw]);

  const generate = async () => {
    const text = raw.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    setConflictDay(null);
    try {
      const result = await run(() => api.createLog({ raw_text: text }, llm));
      onCreated(result);
      setRaw("");
      await refreshStats();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("You already logged this day.");
        if (user) setConflictDay(dayNumberFor(todayISO(), user.start_date));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(false);
    }
  };

  const openConflict = async () => {
    if (conflictDay === null) return;
    try {
      const log = await run(() => api.getByDay(conflictDay));
      onOpen(log);
      setError(null);
      setConflictDay(null);
    } catch {
      setError("Could not open today's log.");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void generate();
    }
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">Today's log</h2>
          <p className="text-[13px] text-fg-muted">Dump your day, messily. We'll tidy it up.</p>
        </div>
        <span className="hidden items-center gap-1.5 text-[11px] text-fg-subtle sm:flex">
          <CornerDownLeft className="size-3.5" aria-hidden="true" />
          Ctrl/⌘ + Enter
        </span>
      </div>

      <Textarea
        ref={areaRef}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER}
        rows={4}
        maxLength={20000}
        aria-label="Raw log for today"
        className="min-h-[7rem] font-mono text-[13px]"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-fg-subtle">
          {raw.trim().length > 0 ? `${raw.trim().length} characters` : "Nothing cached, nothing logged."}
        </p>
        <Button
          variant="primary"
          onClick={() => void generate()}
          loading={pending}
          disabled={!raw.trim()}
          className={cn(pending && "shimmer")}
        >
          {pending ? "Generating" : "Generate"}
          {!pending ? <Sparkles className="size-4" aria-hidden="true" /> : null}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger"
        >
          <span>{error}</span>
          {conflictDay !== null ? (
            <Button variant="outline" size="sm" onClick={() => void openConflict()}>
              <Wand2 className="size-3.5" aria-hidden="true" />
              Open today's log
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
