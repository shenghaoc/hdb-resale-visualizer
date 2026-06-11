import { describe, expect, it } from "vite-plus/test";
import { sgPostalCodeSchema } from "../../scripts/lib/schemas";

describe("sgPostalCodeSchema", () => {
  it("pads a short numeric string to 6 digits", () => {
    expect(sgPostalCodeSchema.parse("88256")).toBe("088256");
  });

  it("returns a full 6-digit postal code as-is", () => {
    expect(sgPostalCodeSchema.parse("560101")).toBe("560101");
  });

  it("returns null for undefined", () => {
    expect(sgPostalCodeSchema.parse(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(sgPostalCodeSchema.parse("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(sgPostalCodeSchema.parse("   ")).toBeNull();
  });

  it('returns null for "NIL"', () => {
    expect(sgPostalCodeSchema.parse("NIL")).toBeNull();
  });

  it('returns null for "NA" (case-insensitive)', () => {
    expect(sgPostalCodeSchema.parse("NA")).toBeNull();
    expect(sgPostalCodeSchema.parse("na")).toBeNull();
    expect(sgPostalCodeSchema.parse("Na")).toBeNull();
  });

  it('returns null for dotted placeholders like "N.A."', () => {
    expect(sgPostalCodeSchema.parse("N.A.")).toBeNull();
  });

  it("strips non-digit characters and pads", () => {
    expect(sgPostalCodeSchema.parse("S088256")).toBe("088256");
  });

  it("trims surrounding whitespace", () => {
    expect(sgPostalCodeSchema.parse("  560101  ")).toBe("560101");
  });

  it("returns null when no digits remain after stripping", () => {
    expect(sgPostalCodeSchema.parse("ABC")).toBeNull();
  });

  it("returns null for strings with more than 6 digits", () => {
    expect(sgPostalCodeSchema.parse("1234567")).toBeNull();
  });

  it("pads a single digit to 6 digits", () => {
    expect(sgPostalCodeSchema.parse("1")).toBe("000001");
  });
});
