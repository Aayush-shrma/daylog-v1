import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Moon, Sun, XCircle } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/theme";

import { useResendVerification } from "./useResendVerification";

type Status = "verifying" | "success" | "expired" | "invalid" | "error";

function tokenFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const token = new URLSearchParams(raw).get("token");
  return token && token.trim() ? token : null;
}

function clearHash(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

/** Full-page screen reached from the emailed link: /verify#token=… */
export function VerifyEmailPage() {
  const { theme, toggle } = useTheme();
  const resend = useResendVerification();
  const [status, setStatus] = useState<Status>("verifying");
  const [detail, setDetail] = useState<string | null>(null);

  const token = useMemo(tokenFromHash, []);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      setDetail("This verification link is missing its token.");
      return;
    }
    let cancelled = false;
    clearHash();
    api
      .verifyEmail(token)
      .then(() => {
        if (!cancelled) setStatus("success");
      })
      .catch((err) => {
        if (cancelled) return;
        const code = err instanceof ApiError ? err.code : null;
        if (code === "expired") {
          setStatus("expired");
        } else if (code === "invalid" || code === "used") {
          setStatus("invalid");
        } else {
          setStatus("error");
        }
        if (err instanceof ApiError) setDetail(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const showResend = status === "expired" || status === "invalid" || status === "error";

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

      <main className="relative mx-auto flex w-full max-w-md px-5 pb-20 pt-8">
        <div className="w-full rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-1)]">
          {status === "verifying" ? (
            <div className="space-y-2 text-center">
              <h1 className="text-lg font-semibold tracking-[-0.02em] text-fg">
                Verifying your email…
              </h1>
              <p className="text-[13px] text-fg-muted">This only takes a moment.</p>
            </div>
          ) : null}

          {status === "success" ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold tracking-[-0.02em] text-fg">
                  Email verified
                </h1>
                <p className="text-[13px] text-fg-muted">
                  Your account is ready. Sign in to start logging.
                </p>
              </div>
              <Button asChild variant="primary" size="lg" className="w-full">
                <a href="/">Sign in</a>
              </Button>
            </div>
          ) : null}

          {showResend ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                  {status === "error" ? (
                    <AlertCircle className="size-4" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-4" aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold tracking-[-0.02em] text-fg">
                    {status === "expired"
                      ? "This link has expired"
                      : status === "error"
                        ? "We couldn't verify this link"
                        : "This link is no longer valid"}
                  </h1>
                  <p className="text-[13px] text-fg-muted">
                    {detail ??
                      "The link may have expired or already been used. Request a new one below."}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="verify-resend-email">Email</Label>
                <Input
                  id="verify-resend-email"
                  type="email"
                  autoComplete="email"
                  value={resend.email}
                  onChange={(event) => resend.setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              {resend.message ? (
                <p
                  role="status"
                  className={
                    resend.tone === "success"
                      ? "text-[12px] text-accent"
                      : "text-[12px] text-danger"
                  }
                >
                  {resend.message}
                </p>
              ) : null}

              <Button
                variant="primary"
                size="lg"
                className="w-full"
                loading={resend.pending}
                disabled={resend.cooldown > 0 || !resend.email.trim()}
                onClick={() => void resend.send()}
              >
                {resend.cooldown > 0
                  ? `Resend available in ${resend.cooldown}s`
                  : "Send a new link"}
              </Button>

              <p className="text-center text-[13px] text-fg-muted">
                <a
                  href="/"
                  className="font-medium text-accent transition-colors hover:text-accent-strong"
                >
                  Back to sign in
                </a>
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
