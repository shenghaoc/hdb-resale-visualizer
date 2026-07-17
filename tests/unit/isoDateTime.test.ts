import { describe, expect, it } from "vite-plus/test";
import { isIsoInstant, parseIsoInstantMilliseconds } from "@shared/isoDateTime";

describe("parseIsoInstantMilliseconds", () => {
  it("parses canonical timestamps and equivalent offset forms", () => {
    const expected = Date.UTC(2025, 11, 31, 16);

    expect(parseIsoInstantMilliseconds("2026-01-01T00:00:00+08")).toBe(expected);
    expect(parseIsoInstantMilliseconds("2026-01-01T00:00:00+0800")).toBe(expected);
    expect(parseIsoInstantMilliseconds("2026-01-01T00:00:00+08:00")).toBe(expected);
    expect(parseIsoInstantMilliseconds("2025-12-31 16:00:00Z")).toBe(expected);
  });

  it("supports omitted seconds, fractional seconds, and lowercase markers", () => {
    expect(parseIsoInstantMilliseconds("2026-01-01t00:00z")).toBe(Date.UTC(2026, 0, 1));
    expect(parseIsoInstantMilliseconds("2026-01-01T00:00:00.123456789Z")).toBe(
      Date.UTC(2026, 0, 1, 0, 0, 0, 123),
    );
  });

  it("rejects permissive Date strings and invalid calendar or clock values", () => {
    for (const value of [
      "2026",
      "12/11/2024",
      "January 1, 2026",
      "2026-02-30T00:00:00Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T00:60:00Z",
      "2026-01-01T00:00:00+24",
    ]) {
      expect(parseIsoInstantMilliseconds(value), value).toBeNull();
      expect(isIsoInstant(value), value).toBe(false);
    }
  });

  it("constrains leap seconds to the final second of the minute", () => {
    expect(parseIsoInstantMilliseconds("2026-01-01T23:59:60Z")).toBe(
      Date.UTC(2026, 0, 1, 23, 59, 59),
    );
  });
});
