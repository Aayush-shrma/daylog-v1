/** Typed API client.
 *
 * Same-origin cookies only (`credentials: "same-origin"`) — there are no tokens
 * in localStorage. Unsafe methods send no Origin override, so the browser's own
 * Origin header is checked by the FastAPI CSRF middleware as usual.
 */

import type {
  AuthConfig,
  Health,
  KeyCheck,
  LlmSettings,
  LogCreate,
  LogOut,
  LogResult,
  LogUpdate,
  SignupInput,
  SignupOut,
  Stats,
  UserOut,
  VerifyEmailResult,
} from "@/types";

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  /** The 409 "already logged this day" response carries the existing log id. */
  get conflictLogId(): number | null {
    const data = this.data as { log_id?: unknown } | null;
    return typeof data?.log_id === "number" ? data.log_id : null;
  }

  /** Machine-readable detail code, e.g. "email_not_verified" or "expired". */
  get code(): string | null {
    const data = this.data as { code?: unknown } | null;
    return typeof data?.code === "string" ? data.code : null;
  }
}

type Json = Record<string, unknown> | unknown[] | null;

function messageFromDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    // FastAPI validation errors: [{ loc, msg, type }, …]
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") return first.msg;
  }
  if (detail && typeof detail === "object") {
    const maybe = (detail as { message?: unknown }).message;
    if (typeof maybe === "string" && maybe.trim()) return maybe;
  }
  return fallback;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, signal } = options;
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(headers ?? {}) },
    signal,
  };
  if (body !== undefined) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Network error. Check your connection and try again.", 0, null);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: Json = null;
  if (text) {
    try {
      data = JSON.parse(text) as Json;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new ApiError(
      messageFromDetail(detail, `Request failed (${response.status})`),
      response.status,
      detail ?? data,
    );
  }

  return data as T;
}

/** BYOK headers. The key travels only here: never a URL, never a log line. */
export function llmHeaders(settings: LlmSettings): Record<string, string> {
  if (!settings.key) return {};
  const headers: Record<string, string> = {
    "X-LLM-Provider": settings.provider,
    "X-LLM-Key": settings.key,
  };
  if (settings.model) headers["X-LLM-Model"] = settings.model;
  return headers;
}

export const api = {
  health: () => request<Health>("/health"),

  authConfig: () => request<AuthConfig>("/auth/config"),
  me: () => request<UserOut>("/auth/me"),
  signup: (input: SignupInput) =>
    request<SignupOut>("/auth/signup", { method: "POST", body: input }),
  login: (email: string, password: string) =>
    request<UserOut>("/auth/login", { method: "POST", body: { email, password } }),
  verifyEmail: (token: string) =>
    request<VerifyEmailResult>("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: (email: string) =>
    request<{ message: string }>("/auth/resend-verification", {
      method: "POST",
      body: { email },
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  updateStartDate: (startDate: string) =>
    request<UserOut>("/auth/me", { method: "PATCH", body: { start_date: startDate } }),
  deleteAccount: () => request<void>("/auth/me", { method: "DELETE" }),

  stats: (signal?: AbortSignal) => request<Stats>("/stats", { signal }),

  listLogs: (params: { q?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    const qs = search.toString();
    return request<LogOut[]>(`/logs${qs ? `?${qs}` : ""}`, { signal });
  },
  getByDay: (dayNumber: number, signal?: AbortSignal) =>
    request<LogOut>(`/logs/day/${dayNumber}`, { signal }),
  createLog: (payload: LogCreate, llm: LlmSettings, signal?: AbortSignal) =>
    request<LogResult>("/logs", {
      method: "POST",
      body: payload,
      headers: llmHeaders(llm),
      signal,
    }),
  regenerate: (logId: number, llm: LlmSettings, signal?: AbortSignal) =>
    request<LogResult>(`/logs/${logId}/regenerate`, {
      method: "POST",
      headers: llmHeaders(llm),
      signal,
    }),
  updateLog: (logId: number, payload: LogUpdate) =>
    request<LogOut>(`/logs/${logId}`, { method: "PUT", body: payload }),

  checkKey: (llm: LlmSettings) =>
    request<KeyCheck>("/llm/check", { method: "POST", headers: llmHeaders(llm) }),
};
