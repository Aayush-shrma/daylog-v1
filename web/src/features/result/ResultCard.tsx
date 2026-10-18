import { useEffect, useState } from "react";
import { Check, Copy, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { formatDateWithWeekday } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app";
import type { LogOut, LogResult } from "@/types";

const TWEET_MAX = 280;
const EASE = [0.22, 1, 0.36, 1] as const;

export interface TweetAuthor {
  name: string;
  handle: string;
  initials: string;
}

function usedLabel(used: string | null): string {
  if (used === "user") return "Using your key";
  if (used === "server") return "Shared key";
  if (used === "fallback") return "Basic mode";
  return "Saved log";
}

function RingCounter({ length }: { length: number }) {
  const ratio = Math.min(length, TWEET_MAX) / TWEET_MAX;
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const over = length > TWEET_MAX;
  const near = !over && ratio > 0.86;
  const color = over ? "var(--danger)" : near ? "#f59e0b" : "var(--accent)";
  return (
    <div className="flex items-center gap-2" title={`${length} / ${TWEET_MAX} characters`}>
      <svg viewBox="0 0 36 36" className="size-8 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset,stroke] duration-300 ease-smooth"
        />
      </svg>
      <span
        className={cn(
          "text-[12px] font-medium tabular-nums",
          over ? "text-danger" : near ? "text-[#f59e0b]" : "text-fg-subtle",
        )}
      >
        {TWEET_MAX - length}
      </span>
    </div>
  );
}

export function ResultCard({
  log,
  used,
  notice,
  author,
  onSaved,
  onRegenerated,
  onClose,
}: {
  log: LogOut;
  used: string | null;
  notice: string | null;
  author: TweetAuthor;
  onSaved: (log: LogOut) => void;
  onRegenerated: (result: LogResult) => void;
  onClose: () => void;
}) {
  const { llm, refreshStats, run } = useApp();
  const [tweet, setTweet] = useState(log.tweet_text);
  const [bullets, setBullets] = useState<string[]>(log.bullets);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumped on every regenerate so the bullet list re-runs its stagger.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    setTweet(log.tweet_text);
    setBullets(log.bullets);
  }, [log.id, log.tweet_text, log.bullets]);

  const dirty =
    tweet !== log.tweet_text ||
    bullets.length !== log.bullets.length ||
    bullets.some((b, i) => b !== log.bullets[i]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tweet);
    } catch {
      const area = document.createElement("textarea");
      area.value = tweet;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    toast.success("Copied to clipboard");
    window.setTimeout(() => setCopied(false), 1600);
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await run(() =>
        api.updateLog(log.id, {
          bullets: bullets.map((b) => b.trim()).filter(Boolean),
          tweet_text: tweet,
        }),
      );
      onSaved(next);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const result = await run(() => api.regenerate(log.id, llm));
      onRegenerated(result);
      setGeneration((n) => n + 1);
      await refreshStats();
      toast.success("Regenerated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not regenerate");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <article className="space-y-4" aria-label={`Day ${log.day_number} log`}>
      {notice ? (
        <p className="rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2.5 text-[13px] text-[#f59e0b]">
          {notice}
        </p>
      ) : null}

      {/* Tweet preview */}
      <div className="shine relative rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            <AvatarFallback>{author.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
              <span className="font-semibold text-fg">{author.name}</span>
              <span className="text-fg-subtle">{author.handle}</span>
              <span className="text-fg-subtle">·</span>
              <span className="text-fg-subtle">{formatDateWithWeekday(log.date)}</span>
            </div>
            <textarea
              value={tweet}
              onChange={(e) => setTweet(e.target.value)}
              rows={4}
              aria-label="Tweet text"
              className="mt-1 w-full resize-none bg-transparent font-mono text-[15px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <RingCounter length={tweet.length} />
              <div className="flex items-center gap-2">
                <Badge variant={used === "user" ? "accent" : "outline"}>{usedLabel(used)}</Badge>
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close result">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bullets */}
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">
            Day {log.day_number} · what you did
          </h3>
          <span className="text-[12px] text-fg-subtle">
            {bullets.filter((b) => b.trim()).length} items
          </span>
        </div>
        <motion.ul key={generation} className="space-y-2">
          {bullets.map((bullet, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: EASE, delay: Math.min(index * 0.045, 0.4) }}
              className="flex items-center gap-2"
            >
              <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <Input
                value={bullet}
                aria-label={`Bullet ${index + 1}`}
                onChange={(e) => {
                  const next = [...bullets];
                  next[index] = e.target.value;
                  setBullets(next);
                }}
                className="h-10 border-transparent bg-surface-2/40 focus-visible:bg-surface-2/70"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove bullet ${index + 1}`}
                onClick={() => setBullets(bullets.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </motion.li>
          ))}
        </motion.ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setBullets([...bullets, ""])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add item
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>
          <Save className="size-4" aria-hidden="true" />
          {dirty ? "Save changes" : "Saved"}
        </Button>
        <Button variant="secondary" onClick={() => void copy()}>
          <span key={copied ? "check" : "copy"} className="pop-in grid place-items-center">
            {copied ? (
              <Check className="size-4 text-accent" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
          </span>
          {copied ? "Copied" : "Copy tweet"}
        </Button>
        <Button variant="ghost" onClick={() => void regenerate()} disabled={regenerating}>
          {regenerating ? <Spinner /> : <RefreshCw className="size-4" aria-hidden="true" />}
          Regenerate
        </Button>
      </div>
    </article>
  );
}
