import { describe, expect, it } from "vite-plus/test";
import {
  parseLeaseCommenceYearInput,
  parsePositiveDecimalInput,
} from "@/features/listing-check/listingCheckInputs";

describe("listing check input parsing", () => {
  it("parses positive decimal inputs while tolerating currency separators", () => {
    expect(parsePositiveDecimalInput("S$750,000")).toBe(750000);
    expect(parsePositiveDecimalInput("93.5 sqm")).toBe(93.5);
    expect(parsePositiveDecimalInput("")).toBeNull();
    expect(parsePositiveDecimalInput("0")).toBeNull();
    expect(parsePositiveDecimalInput("12.3.4")).toBeNull();
    expect(parsePositiveDecimalInput("1e3")).toBeNull();
  });

  it("accepts only bounded four-digit lease commencement years", () => {
    expect(parseLeaseCommenceYearInput("1995")).toBe(1995);
    expect(parseLeaseCommenceYearInput(" 2001 ")).toBe(2001);
    expect(parseLeaseCommenceYearInput("")).toBeNull();
    expect(parseLeaseCommenceYearInput("1959")).toBeNull();
    expect(parseLeaseCommenceYearInput("1995.5")).toBeNull();
    expect(parseLeaseCommenceYearInput("1e3")).toBeNull();
    expect(parseLeaseCommenceYearInput("9999")).toBeNull();
  });
});
