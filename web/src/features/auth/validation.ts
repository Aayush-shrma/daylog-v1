/** Client-side registration/login validation.
 *
 * These rules mirror app/schemas/user.py so the server stays the source of
 * truth while the form gives immediate feedback.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const FIRST_NAME_MAX = 80;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateFirstName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "First name is required.";
  if (trimmed.length > FIRST_NAME_MAX) {
    return `Use at most ${FIRST_NAME_MAX} characters.`;
  }
  return undefined;
}

export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your email address.";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return undefined;
}

export function validatePassword(
  value: string,
  { required = true }: { required?: boolean } = {},
): string | undefined {
  if (!value) return required ? "Enter your password." : undefined;
  if (value.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (value.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  return undefined;
}

export function validateConfirmPassword(
  password: string,
  confirm: string,
): string | undefined {
  if (!confirm) return "Confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return undefined;
}
