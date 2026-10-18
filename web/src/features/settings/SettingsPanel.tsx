import { useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { maskKey } from "@/lib/storage";
import { useApp } from "@/store/app";
import type { Provider } from "@/types";

const PROVIDERS = [
  { value: "gemini" as const, label: "Gemini" },
  { value: "groq" as const, label: "Groq" },
];

export function SettingsPanel() {
  const { llm, setLlm, clearKey, run } = useApp();
  const [provider, setProvider] = useState<Provider>(llm.provider);
  const [model, setModel] = useState(llm.model);
  const [keyInput, setKeyInput] = useState("");
  const [remember, setRemember] = useState(llm.remember);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const hasKey = llm.key.length > 0;

  const persist = (nextKey?: string) => {
    setLlm({ provider, model: model.trim(), key: nextKey ?? llm.key, remember });
  };

  const onProvider = (next: Provider) => {
    setProvider(next);
    setTestResult(null);
    setLlm({ provider: next, model: model.trim(), key: llm.key, remember });
  };

  const saveKey = () => {
    const value = keyInput.trim();
    if (!value) {
      toast.error("Paste a key first");
      return;
    }
    persist(value);
    setKeyInput("");
    toast.success("Key saved in this browser");
  };

  const removeKey = () => {
    clearKey();
    setKeyInput("");
    setTestResult(null);
    toast.success("Key cleared");
  };

  const testKey = async () => {
    const candidate = keyInput.trim() || llm.key;
    if (!candidate) {
      toast.error("Add a key to test");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await run(() => api.checkKey({ provider, model: model.trim(), key: candidate, remember }));
      setTestResult({ ok: result.ok, message: result.message });
    } catch {
      setTestResult({ ok: false, message: "Could not reach the provider" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-1)]">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <KeyRound className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-fg">Bring your own key</h2>
            <p className="text-[13px] text-fg-muted">
              Optional. Without a key you still get clean bullets and a draft, using the shared key or basic mode.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <SegmentedControl
              name="llm-provider"
              value={provider}
              onChange={onProvider}
              options={PROVIDERS}
              className="w-full max-w-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-model">Model (optional)</Label>
            <Input
              id="llm-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => persist()}
              placeholder="Leave blank for the default"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="llm-key">{hasKey ? "Your key" : "API key"}</Label>
            {hasKey ? (
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 font-mono text-[13px] text-fg">
                  {maskKey(llm.key)}
                </code>
                <Badge variant="accent">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Stored in this browser
                </Badge>
              </div>
            ) : (
              <Input
                id="llm-key"
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste your API key"
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
            <span className="text-[13px] text-fg-muted">
              Remember this key on this device (otherwise it lasts the session)
            </span>
            <Switch
              checked={remember}
              onCheckedChange={(checked) => {
                setRemember(checked);
                setLlm({ provider, model: model.trim(), key: llm.key, remember: checked });
              }}
              aria-label="Remember key"
            />
          </label>

          {testResult ? (
            <div
              role="status"
              className={
                testResult.ok
                  ? "flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-[13px] text-accent motion-safe:animate-in motion-safe:fade-in-0"
                  : "flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-[13px] text-danger motion-safe:animate-in motion-safe:fade-in-0"
              }
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle className="size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{testResult.message}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {!hasKey ? (
              <Button variant="primary" onClick={saveKey} disabled={!keyInput.trim()}>
                Save key
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void testKey()} loading={testing}>
              Test key
            </Button>
            {hasKey ? (
              <Button variant="ghost" onClick={removeKey}>
                Clear key
              </Button>
            ) : null}
          </div>

          <p className="flex items-start gap-2 text-[12px] text-fg-subtle">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Your key is sent only to this app's own API in a request header, never logged, and never sent anywhere else.
          </p>
        </div>
      </section>
    </div>
  );
}
