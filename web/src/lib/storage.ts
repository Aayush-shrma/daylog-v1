/** Browser storage that never throws (private mode, disabled storage, quota). */

import type { LlmSettings, Provider } from "@/types";

const STORE_KEYS = {
  provider: "daylog_llm_provider",
  model: "daylog_llm_model",
  key: "daylog_llm_key",
  remember: "daylog_llm_remember",
} as const;

const THEME_KEY = "daylog_theme";

export function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

export function safeSet(store: Storage | undefined, key: string, value: string | null): void {
  try {
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function local(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function session(): Storage | undefined {
  return typeof window === "undefined" ? undefined : window.sessionStorage;
}

function getSetting(name: keyof typeof STORE_KEYS): string | null {
  const inLocal = safeGet(local(), STORE_KEYS[name]);
  return inLocal !== null ? inLocal : safeGet(session(), STORE_KEYS[name]);
}

function setSetting(name: keyof typeof STORE_KEYS, value: string | null, remember: boolean): void {
  const [primary, secondary] = remember
    ? [local(), session()]
    : [session(), local()];
  safeSet(primary, STORE_KEYS[name], value);
  safeSet(secondary, STORE_KEYS[name], null);
}

export function loadLlmSettings(): LlmSettings {
  const providerRaw = getSetting("provider");
  const provider: Provider = providerRaw === "groq" ? "groq" : "gemini";
  return {
    provider,
    model: getSetting("model") ?? "",
    key: getSetting("key") ?? "",
    remember: getSetting("remember") === "1",
  };
}

export function saveLlmSettings(settings: LlmSettings): void {
  setSetting("provider", settings.provider, settings.remember);
  setSetting("model", settings.model || null, settings.remember);
  setSetting("key", settings.key || null, settings.remember);
  setSetting("remember", settings.remember ? "1" : null, settings.remember);
}

export function clearLlmKey(): void {
  setSetting("key", null, true);
  setSetting("key", null, false);
}

/** Last 4 characters of a key — the only part we are ever allowed to show. */
export function maskKey(key: string): string {
  if (!key) return "";
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

export function loadTheme(): "dark" | "light" | null {
  const value = safeGet(local(), THEME_KEY);
  return value === "dark" || value === "light" ? value : null;
}

export function saveTheme(theme: "dark" | "light"): void {
  safeSet(local(), THEME_KEY, theme);
}

export function preferredTheme(): "dark" | "light" {
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}
