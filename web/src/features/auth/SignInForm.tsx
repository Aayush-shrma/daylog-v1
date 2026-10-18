import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";

import { GoogleIcon } from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { UserOut } from "@/types";

import { PasswordField } from "./PasswordField";
import { validateEmail } from "./validation";

interface SignInFormProps {
  googleEnabled: boolean;
  onSignedIn: (user: UserOut) => void;
  onCreateAccount: () => void;
  onUnverified: (email: string) => void;
}

interface Errors {
  email?: string;
  password?: string;
  form?: string;
}

export function SignInForm({
  googleEnabled,
  onSignedIn,
  onCreateAccount,
  onUnverified,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const found: Errors = {};
    const emailError = validateEmail(email);
    if (emailError) found.email = emailError;
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const user = await api.login(email.trim(), password);
      onSignedIn(user);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_not_verified") {
        // The account exists but has not confirmed its email.
        onUnverified(email.trim());
        return;
      }
      setErrors({
        form: err instanceof ApiError ? err.message : "Something went wrong. Try again.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-1)]">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-fg">Sign in</h2>
        <p className="text-[13px] text-fg-muted">Pick up your streak where you left off.</p>
      </div>

      {googleEnabled ? (
        <>
          <Button asChild variant="google" size="lg" className="w-full">
            <a href="/auth/google/login">
              <GoogleIcon />
              Continue with Google
            </a>
          </Button>
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-fg-subtle">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="signin-email">Email</Label>
          <Input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "signin-email-error" : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errors.email ? (
            <p id="signin-email-error" className="text-[12px] text-danger" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="signin-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
        />

        {errors.form ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{errors.form}</span>
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-[13px] text-fg-muted">
        New here?{" "}
        <button
          type="button"
          className="font-medium text-accent transition-colors hover:text-accent-strong"
          onClick={onCreateAccount}
        >
          Create an account
        </button>
      </p>
    </div>
  );
}
