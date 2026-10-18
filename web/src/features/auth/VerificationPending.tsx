import { MailCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useResendVerification } from "./useResendVerification";

export interface PendingInfo {
  email: string;
  sent: boolean;
  message: string | null;
}

interface VerificationPendingProps {
  info: PendingInfo;
  emailEnabled: boolean;
  onBack: () => void;
}

/** Post-signup state: tell the user to open the emailed link. */
export function VerificationPending({
  info,
  emailEnabled,
  onBack,
}: VerificationPendingProps) {
  const resend = useResendVerification(info.email);

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-1)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <MailCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-fg">
            Check your inbox
          </h2>
          <p className="text-[13px] text-fg-muted">
            We sent a verification link to{" "}
            <span className="font-medium text-fg">{info.email}</span>. Open it to
            activate your account, then sign in.
          </p>
        </div>
      </div>

      {!info.sent ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{info.message ?? "We couldn't send the verification email."}</span>
        </div>
      ) : null}

      {!emailEnabled ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-[12px] text-fg-subtle">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Email delivery is not configured on this server yet, so verification
            links cannot be sent. A project administrator must set the email
            environment variables.
          </span>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={resend.email}
            onChange={(event) => resend.setEmail(event.target.value)}
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
          variant="secondary"
          size="lg"
          className="w-full"
          loading={resend.pending}
          disabled={resend.cooldown > 0}
          onClick={() => void resend.send()}
        >
          {resend.cooldown > 0
            ? `Resend available in ${resend.cooldown}s`
            : "Resend verification email"}
        </Button>
      </div>

      <p className="mt-4 text-center text-[13px] text-fg-muted">
        Already verified?{" "}
        <button
          type="button"
          className="font-medium text-accent transition-colors hover:text-accent-strong"
          onClick={onBack}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
