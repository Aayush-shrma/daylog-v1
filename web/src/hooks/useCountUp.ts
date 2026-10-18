import { useEffect, useRef, useState } from "react";

/** Count from 0 up to `target`. Honours prefers-reduced-motion and can be disabled. */
export function useCountUp(target: number, options: { enabled?: boolean; durationMs?: number } = {}) {
  const { enabled = true, durationMs = 700 } = options;
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!enabled || reduce || durationMs <= 0) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const from = 0;
    const delta = target - from;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + delta * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, enabled, durationMs]);

  return value;
}
