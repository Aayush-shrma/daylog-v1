import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";

import { GoogleIcon } from "@/components/GoogleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

import { PasswordField } from "./PasswordField";
import {
  PASSWORD_MIN,
  validateConfirmPassword,
  validateEmail,
  validateFirstName,
  validatePassword,
} from "./validation";
import type { PendingInfo } from "./VerificationPending";

interface SignUpFormProps {
  googleEnabled: boolean;
  onCreated: (info: PendingInfo) => void;
  onSignIn: () => void;
}

interface Errors {
  firstName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  form?: string;
}

export function SignUpForm({ googleEnabled, onCreated, onSignIn }: SignUpFormProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const validate = (): Errors => {
    const found: Errors = {};
    const firstNameError = validateFirstName(firstName);
    if (firstNameError) found.firstName = firstNameError;
    const emailError = validateEmail(email);
    if (emailError) found.email = emailError;
    const passwordError = validatePassword(password);
    if (passwordError) found.password = passwordError;
    const confirmError = validateConfirmPassword(password, confirmPassword);
    if (confirmError) found.confirmPassword = confirmError;
    return found;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const result = await api.signup({
        first_name: firstName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
      });
      onCreated({
        email: result.user.email,
        sent: result.verification_email_sent,
        message: result.message,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({
          email: "An account with this email already exists. Try signing in instead.",
        });
      } else {
        setErrors({
          form: err instanceof ApiError ? err.message : "Something went wrong. Try again.",
        });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-1)]">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-fg">Create your account</h2>
        <p className="text-[13px] text-fg-muted">
          Start logging your #100DaysOfCode today.
        </p>
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
          <Label htmlFor="signup-first-name">First name</Label>
          <Input
            id="signup-first-name"
            name="given-name"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            aria-invalid={Boolean(errors.firstName)}
            aria-describedby={errors.firstName ? "signup-first-name-error" : undefined}
            onChange={(event) => setFirstName(event.target.value)}
          />
          {errors.firstName ? (
            <p id="signup-first-name-error" className="text-[12px] text-danger" role="alert">
              {errors.firstName}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "signup-email-error" : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errors.email ? (
            <p id="signup-email-error" className="text-[12px] text-danger" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="signup-password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters.`}
        />

        <PasswordField
          id="signup-confirm-password"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          error={errors.confirmPassword}
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
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-[13px] text-fg-muted">
        Already have an account?{" "}
        <button
          type="button"
          className="font-medium text-accent transition-colors hover:text-accent-strong"
          onClick={onSignIn}
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
