import { useEffect, useState } from "react";
import { FileSearch, Search } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultCard } from "@/features/result/ResultCard";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/date";
import { tweetAuthor } from "@/lib/user";
import { useApp } from "@/store/app";
import type { LogOut } from "@/types";

function snippet(log: LogOut): string {
  const text = log.tweet_text || log.raw_text || log.bullets.join(" · ");
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export function SearchPanel() {
  const { user, refreshStats, run } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LogOut[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<LogOut | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const found = await run(() => api.listLogs({ q: trimmed, limit: 20 }));
        if (!cancelled) setResults(found);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, run]);

  if (!user) return null;

  if (selected) {
    return (
      <ResultCard
        log={selected}
        used={null}
        notice={null}
        author={tweetAuthor(user)}
        onSaved={(next) => {
          setSelected(next);
          void refreshStats();
        }}
        onRegenerated={(result) => setSelected(result.log)}
        onClose={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">Search your logs</h2>
        <p className="mb-4 text-[13px] text-fg-muted">Find any word you've written — days, bugs, topics.</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="postgres, auth bug, tests…"
            aria-label="Search logs"
            className="pl-9"
            autoFocus
          />
        </div>
      </section>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : results === null ? null : results.length === 0 ? (
        <EmptyState
          icon={<FileSearch className="size-5" />}
          title="No matches"
          hint={`Nothing found for “${query.trim()}”. Try a different word.`}
        />
      ) : (
        <ul className="space-y-2">
          {results.map((log) => (
            <li key={log.id}>
              <button
                type="button"
                onClick={() => setSelected(log)}
                className="w-full rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left transition-colors duration-200 ease-smooth hover:border-border-strong hover:bg-surface-2/60"
              >
                <div className="mb-1 flex items-center gap-2 text-[12px] text-fg-subtle">
                  <span className="font-medium text-fg">Day {log.day_number}</span>
                  <span>·</span>
                  <span>{formatDate(log.date)}</span>
                  <span>·</span>
                  <span>
                    {log.item_count} {log.item_count === 1 ? "item" : "items"}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] text-fg-muted">{snippet(log)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
