import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError } from "@/lib/api";
import { clearLlmKey, loadLlmSettings, saveLlmSettings } from "@/lib/storage";
import type { AuthConfig, LlmSettings, Stats, UserOut } from "@/types";

interface AppContextValue {
  booting: boolean;
  user: UserOut | null;
  authConfig: AuthConfig | null;
  stats: Stats | null;
  statsLoading: boolean;
  llm: LlmSettings;
  setLlm: (next: LlmSettings) => void;
  clearKey: () => void;
  setUser: (user: UserOut | null) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  saveStartDate: (startDate: string) => Promise<UserOut>;
  refreshStats: () => Promise<void>;
  /** Call when any request 401s, to drop back to the signed-out shell. */
  onUnauthorized: () => void;
  /** Run a request, turning a 401 into a sign-out. Re-throws other errors. */
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserOut | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [llm, setLlmState] = useState<LlmSettings>(() => loadLlmSettings());

  const statsAbort = useRef<AbortController | null>(null);

  const onUnauthorized = useCallback(() => {
    setUser(null);
    setStats(null);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
        }
        throw err;
      }
    },
    [onUnauthorized],
  );

  const refreshStats = useCallback(async () => {
    statsAbort.current?.abort();
    const controller = new AbortController();
    statsAbort.current = controller;
    setStatsLoading(true);
    try {
      const next = await api.stats(controller.signal);
      setStats(next);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else throw err;
    } finally {
      if (statsAbort.current === controller) {
        statsAbort.current = null;
        setStatsLoading(false);
      }
    }
  }, [onUnauthorized]);

  // Bootstrap: auth config + current session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const configPromise = api.authConfig().catch(() => null);
      const mePromise = api.me().catch((err) => {
        // 401 = no session; 403 = session but unverified. Both mean "signed out".
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          return null;
        }
        throw err;
      });
      const [config, me] = await Promise.all([configPromise, mePromise]);
      if (cancelled) return;
      setAuthConfig(config);
      setUser(me);
      setBooting(false);
    })().catch(() => {
      if (!cancelled) setBooting(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load stats whenever we have a user.
  useEffect(() => {
    if (!user) return;
    void refreshStats();
  }, [user, refreshStats]);

  const setLlm = useCallback((next: LlmSettings) => {
    saveLlmSettings(next);
    setLlmState(next);
  }, []);

  const clearKey = useCallback(() => {
    clearLlmKey();
    setLlmState((prev) => ({ ...prev, key: "" }));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      onUnauthorized();
    }
  }, [onUnauthorized]);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    clearLlmKey();
    setLlmState((prev) => ({ ...prev, key: "" }));
    onUnauthorized();
  }, [onUnauthorized]);

  const saveStartDate = useCallback(
    async (startDate: string) => {
      const next = await api.updateStartDate(startDate);
      setUser(next);
      await refreshStats();
      return next;
    },
    [refreshStats],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      booting,
      user,
      authConfig,
      stats,
      statsLoading,
      llm,
      setLlm,
      clearKey,
      setUser,
      signOut,
      deleteAccount,
      saveStartDate,
      refreshStats,
      onUnauthorized,
      run,
    }),
    [
      booting, user, authConfig, stats, statsLoading, llm, setLlm, clearKey,
      signOut, deleteAccount, saveStartDate, refreshStats, onUnauthorized, run,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
