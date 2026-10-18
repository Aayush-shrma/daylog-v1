/**
 * Guards the Vercel same-origin proxy configuration.
 *
 * The frontend is deployed to Vercel while the API stays on Render, so
 * `vercel.json` rewrites the API prefixes to Render and falls back to
 * `index.html` for client-side routes (like `/verify`). The browser therefore
 * stays same-origin with the Vercel deployment, which keeps the httpOnly
 * session cookie working without switching to `SameSite=None`.
 */
import { describe, expect, it } from "vitest";

import rawConfig from "../vercel.json";

interface Rewrite {
  source: string;
  destination: string;
}

interface VercelConfig {
  rewrites?: Rewrite[];
}

const config = rawConfig as VercelConfig;
const rewrites: Rewrite[] = config.rewrites ?? [];

const API_PREFIXES = ["/auth", "/logs", "/stats", "/llm", "/health"] as const;

function isApiRewrite(rule: Rewrite): boolean {
  return API_PREFIXES.some(
    (prefix) => rule.source === prefix || rule.source.startsWith(`${prefix}/`),
  );
}

function isExternal(destination: string): boolean {
  return /^https?:\/\//.test(destination);
}

describe("vercel.json proxy configuration", () => {
  it("proxies every API prefix to an absolute https backend", () => {
    for (const prefix of API_PREFIXES) {
      const rule = rewrites.find(
        (r) => r.source === prefix || r.source === `${prefix}/:path*`,
      );
      expect(rule, `no rewrite for ${prefix}`).toBeDefined();
      expect(rule?.destination, `destination for ${prefix}`).toMatch(/^https:\/\//);
      expect(rule?.destination).toContain(prefix);
    }
  });

  it("keeps all API rewrites on one backend host", () => {
    const hosts = new Set(
      rewrites
        .filter(isApiRewrite)
        .map((rule) => new URL(rule.destination).origin),
    );
    expect(hosts.size).toBe(1);
  });

  it("falls back to the SPA entrypoint so /verify and other routes load", () => {
    const fallback = rewrites.find((rule) => rule.destination === "/index.html");
    expect(fallback).toBeDefined();
    expect(fallback?.source).toBe("/(.*)");
    // /verify is served by the SPA, never proxied to the API.
    expect(
      rewrites.some((rule) => isApiRewrite(rule) && rule.source.includes("verify")),
    ).toBe(false);
  });

  it("evaluates the SPA fallback last so API rewrites win", () => {
    const fallbackIndex = rewrites.findIndex(
      (rule) => rule.destination === "/index.html",
    );
    expect(fallbackIndex).toBe(rewrites.length - 1);
  });

  it("never sends static frontend assets to the backend", () => {
    for (const rule of rewrites) {
      if (isExternal(rule.destination)) {
        expect(
          isApiRewrite(rule),
          `unexpected external rewrite: ${rule.source}`,
        ).toBe(true);
      }
    }
    expect(rewrites.some((rule) => rule.source.startsWith("/assets"))).toBe(false);
  });
});
