import { describe, expect, it } from "vite-plus/test";
import { resolveE2EPort } from "../e2e/runtime-config";

describe("resolveE2EPort", () => {
  it.each([undefined, "", "  "])("uses the default port for %j", (value) => {
    expect(resolveE2EPort(value)).toBe(4173);
  });

  it("accepts an integer port within the TCP range", () => {
    expect(resolveE2EPort("4174")).toBe(4174);
    expect(resolveE2EPort("65535")).toBe(65_535);
  });

  it.each(["0", "65536", "4173.5", "not-a-port"])("rejects invalid port %s", (value) => {
    expect(() => resolveE2EPort(value)).toThrow(
      `E2E_PORT must be an integer from 1 to 65535; received "${value}"`,
    );
  });
});
