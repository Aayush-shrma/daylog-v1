import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

const COOLDOWN_SECONDS = 60;

export type ResendTone = "success" | "error" | null;

export interface ResendController {
  email: string;
  setEmail: (value: string) => void;
  pending: boolean;
  message: string | null;
  tone: ResendTone;
  cooldown: number;
  /** Send (or resend) a verification email. Resolves to true on success. */
  send: (target?: string) => Promise<boolean>;
}

/**
 * Shared resend-verification behaviour with a client-side cooldown so the
 * button cannot be spammed (the server enforces its own limit as well).
 */
export function useResendVerification(initialEmail = ""): ResendController {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<ResendTone>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const send = useCallback(
    async (target?: string): Promise<boolean> => {
      const address = (target ?? email).trim();
      if (!address || pending || cooldown > 0) return false;
      setPending(true);
      setMessage(null);
      setTone(null);
      try {
        const result = await api.resendVerification(address);
        setMessage(result.message);
        setTone("success");
        setCooldown(COOLDOWN_SECONDS);
        return true;
      } catch (err) {
        setTone("error");
        setMessage(
          err instanceof ApiError
            ? err.message
            : "Could not request a new link. Please try again.",
        );
        if (err instanceof ApiError && err.status === 429) {
          setCooldown(COOLDOWN_SECONDS);
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [email, pending, cooldown],
  );

  return { email, setEmail, pending, message, tone, cooldown, send };
}
