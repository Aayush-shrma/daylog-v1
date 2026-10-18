import { useState } from "react";

import { useApp } from "@/store/app";

import { SignInForm } from "./SignInForm";
import { SignUpForm } from "./SignUpForm";
import { VerificationPending, type PendingInfo } from "./VerificationPending";

type Mode = "signin" | "signup";

/** The auth card on the landing page: sign in, create an account, or the
 *  "verify your email" pending state. */
export function AuthPanel() {
  const { authConfig, setUser } = useApp();
  const [mode, setMode] = useState<Mode>("signin");
  const [pending, setPending] = useState<PendingInfo | null>(null);

  const googleEnabled = authConfig?.google_enabled ?? false;
  const emailEnabled = authConfig?.email_enabled ?? false;

  if (pending) {
    return (
      <VerificationPending
        info={pending}
        emailEnabled={emailEnabled}
        onBack={() => {
          setPending(null);
          setMode("signin");
        }}
      />
    );
  }

  if (mode === "signup") {
    return (
      <SignUpForm
        googleEnabled={googleEnabled}
        onCreated={setPending}
        onSignIn={() => setMode("signin")}
      />
    );
  }

  return (
    <SignInForm
      googleEnabled={googleEnabled}
      onSignedIn={setUser}
      onCreateAccount={() => setMode("signup")}
      onUnverified={(email) => setPending({ email, sent: true, message: null })}
    />
  );
}
