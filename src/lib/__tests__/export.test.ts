import { describe, expect, it } from "vitest";
import {
  buildCsvContent,
  buildResultsCsvContent,
  buildShortlistCsvContent,
  escapeCsvQuotedField,
  formatCsvCell,
  sanitizeCsvCell,
} from "@/lib/export";

describe("sanitizeCsvCell", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+cmd", "'+cmd"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["-100", "'-100"],
    ["\tdata", "'\tdata"],
    ["|pipe", "'|pipe"],
    ["  =leading-space", "'  =leading-space"],
  ])("prefixes formula trigger %j with a single quote", (input, expected) => {
    expect(sanitizeCsvCell(input)).toBe(expected);
  });

  it("does not sanitize formula-like content after the first line", () => {
    const multiline = "safe first line\n=malicious";
    expect(sanitizeCsvCell(multiline)).toBe(multiline);
  });

  it("leaves normal text unchanged", () => {
    expect(sanitizeCsvCell("Block 123 Bedok")).toBe("Block 123 Bedok");
    expect(sanitizeCsvCell("100% happy")).toBe("100% happy");
  });
});

describe("escapeCsvQuotedField", () => {
  it("escapes embedded double quotes", () => {
    expect(escapeCsvQuotedField('say "hello"')).toBe('"say ""hello"""');
  });

  it("sanitizes and quotes =/+/@-prefixed values", () => {
    expect(escapeCsvQuotedField("=cmd")).toBe('"\'=cmd"');
    expect(escapeCsvQuotedField("+2")).toBe('"\'+2"');
    expect(escapeCsvQuotedField("@evil")).toBe('"\'@evil"');
    expect(escapeCsvQuotedField("-5")).toBe('"\'-5"');
  });
});

describe("formatCsvCell", () => {
  it("renders numbers without quotes", () => {
    expect(formatCsvCell(450000)).toBe("450000");
  });

  it("renders empty values as blank cells", () => {
    expect(formatCsvCell("")).toBe("");
    expect(formatCsvCell(null)).toBe("");
  });
});

describe("buildCsvContent", () => {
  it("builds a header row and sanitized data rows", () => {
    const csv = buildCsvContent(
      ["Address", "Notes"],
      [
        ["Blk 1", "=1+1"],
        ["Blk 2", "normal"],
      ],
    );
    expect(csv).toBe('"Address","Notes"\n"Blk 1","\'=1+1"\n"Blk 2","normal"');
  });
});

describe("buildShortlistCsvContent", () => {
  it("exports shortlist rows with sanitized notes", () => {
    const csv = buildShortlistCsvContent(
      ["Address", "Notes"],
      [
        {
          address: "Blk 1",
          medianPrice: 500000,
          targetPrice: null,
          schools1km: 2,
          hawkers1km: 1,
          supermarkets1km: 0,
          parks1km: 1,
          mrtDistanceMeters: 400,
          notes: "@import",
        },
      ],
    );
    expect(csv).toContain('"\'@import"');
  });
});

describe("buildResultsCsvContent", () => {
  it("exports results rows with the remaining lease value preserved", () => {
    const csv = buildResultsCsvContent(
      ["Address", "Town", "Median", "PSM", "Txns", "Remaining Lease", "MRT", "Flat Types"],
      [
        {
          address: "Blk 1",
          town: "Bedok",
          medianPrice: 500000,
          pricePerSqm: 6000,
          transactionCount: 12,
          remainingLeaseYears: 73,
          mrtDistanceMeters: 400,
          flatTypes: "3 ROOM; 4 ROOM",
        },
      ],
    );
    expect(csv).toBe(
      '"Address","Town","Median","PSM","Txns","Remaining Lease","MRT","Flat Types"\n' +
        '"Blk 1","Bedok",500000,6000,12,73,400,"3 ROOM; 4 ROOM"',
    );
  });

  it("sanitizes formula-like text fields", () => {
    const csv = buildResultsCsvContent(
      ["Address", "Flat Types"],
      [
        {
          address: "=cmd",
          town: "",
          medianPrice: 0,
          pricePerSqm: 0,
          transactionCount: 0,
          remainingLeaseYears: "",
          mrtDistanceMeters: "",
          flatTypes: "@evil",
        },
      ],
    );
    expect(csv).toContain('"\'=cmd"');
    expect(csv).toContain('"\'@evil"');
  });
});
