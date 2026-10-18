import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
  hint?: string;
  minLength?: number;
  required?: boolean;
}

/** Password input with a show/hide control, matching the existing Input style. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  minLength,
  required = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-fg-subtle transition-colors hover:text-fg"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[12px] text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
