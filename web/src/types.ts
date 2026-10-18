/** API response/request types, mirroring app/schemas/*.py exactly.
 *
 * Dates cross the wire as "YYYY-MM-DD" strings (Pydantic `dt.date`), so they are
 * typed as strings and parsed by hand — never with `new Date("YYYY-MM-DD")`.
 */

export interface UserOut {
  id: string;
  email: string;
  name: string | null;
  start_date: string;
  has_password: boolean;
  email_verified: boolean;
}

export interface LogOut {
  id: number;
  date: string;
  day_number: number;
  raw_text: string;
  bullets: string[];
  tweet_text: string;
  item_count: number;
}

/** `used` tells the UI which key produced the result. */
export type UsedSource = "user" | "server" | "fallback";

export interface LogResult {
  log: LogOut;
  used: UsedSource | string;
  notice: string | null;
}

export interface LogCreate {
  raw_text: string;
  date?: string;
}

export interface LogUpdate {
  bullets?: string[];
  tweet_text?: string;
}

export interface HeatmapDay {
  date: string;
  count: number;
  level: number;
}

export interface Stats {
  current_streak: number;
  longest_streak: number;
  total_days: number;
  total_items: number;
  heatmap: HeatmapDay[];
}

export interface AuthConfig {
  google_enabled: boolean;
  email_enabled: boolean;
}

export interface SignupInput {
  first_name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export interface SignupOut {
  user: UserOut;
  verification_email_sent: boolean;
  message: string | null;
}

export interface VerifyEmailResult {
  verified: boolean;
  message: string;
}

export interface KeyCheck {
  ok: boolean;
  provider: string;
  message: string;
}

export interface Health {
  status: string;
}

export type Provider = "gemini" | "groq";

/** BYOK settings live in the browser; the key is only ever sent as a header. */
export interface LlmSettings {
  provider: Provider;
  model: string;
  key: string;
  remember: boolean;
}
