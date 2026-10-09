// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  existingWranglerOAuth,
  type WranglerAuthRunner,
} from "../../scripts/neon-benchmark/pilot/wrangler-auth";

describe("existing Wrangler OAuth authentication", () => {
  it("uses normal Wrangler refresh, explicit config/CWD and inherited credential selection", async () => {
    const runner = vi.fn<WranglerAuthRunner>().mockResolvedValue({
      stdout: JSON.stringify({ type: "oauth", token: "fixture-only-token" }),
    });
    const inherited: NodeJS.ProcessEnv = {
      PATH: "/fixture/bin",
      CLOUDFLARE_AUTH_USE_KEYRING: "false",
      SESSION_ID: "candidate-counter-cohort-20261005",
    };
    const result = await existingWranglerOAuth(
      "/fixture/wrangler.jsonc",
      "/fixture",
      runner,
      inherited,
    );
    expect(result).toEqual({ token: "fixture-only-token", source: "wrangler-oauth" });
    expect(runner).toHaveBeenCalledExactlyOnceWith(
      "wrangler",
      ["auth", "token", "--json", "--config", "/fixture/wrangler.jsonc"],
      {
        cwd: "/fixture",
        env: {
          ...inherited,
          CI: "true",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_WRITE_LOGS: "false",
          WRANGLER_LOG_SANITIZE: "true",
          WRANGLER_LOG: "log",
        },
        timeout: 20_000,
        maxBuffer: 100_000,
      },
    );
    expect(inherited).toEqual({
      PATH: "/fixture/bin",
      CLOUDFLARE_AUTH_USE_KEYRING: "false",
      SESSION_ID: "candidate-counter-cohort-20261005",
    });
  });

  it("stops once on refresh failure without leaking subprocess credentials", async () => {
    const runner = vi.fn<WranglerAuthRunner>().mockRejectedValue({
      message: "fixture-secret",
      stdout: "fixture-secret",
      stderr: "fixture-secret",
    });
    let failure: unknown;
    try {
      await existingWranglerOAuth("/fixture/wrangler.jsonc", "/fixture", runner, {
        SESSION_ID: "candidate-counter-cohort-20261005",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("fixture-secret");
    expect(failure).not.toHaveProperty("cause");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it.each([
    "fixture-secret invalid json",
    JSON.stringify({ type: "api_token", token: "fixture-secret" }),
    JSON.stringify({ type: "api_key", key: "fixture-secret", email: "private@example.test" }),
    JSON.stringify({ type: "oauth", token: "" }),
    JSON.stringify({ type: "oauth", token: "fixture\nsecret" }),
    "null",
  ])("rejects unexpected credential output without reflecting it", async (stdout) => {
    const runner = vi.fn<WranglerAuthRunner>().mockResolvedValue({ stdout });
    let failure: unknown;
    try {
      await existingWranglerOAuth("/fixture/wrangler.jsonc", "/fixture", runner, {
        SESSION_ID: "candidate-counter-cohort-20261005",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("fixture-secret");
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
