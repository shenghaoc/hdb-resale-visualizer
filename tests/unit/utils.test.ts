import { describe, it, expect } from "vitest";
import { cn, townToFilename } from "../../src/lib/utils";

describe("utils", () => {
  describe("cn", () => {
    it("merges basic class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("merges tailwind classes and resolves conflicts", () => {
      // tailwind-merge behavior: later classes override earlier ones
      expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
      expect(cn("px-2 py-1", "p-4")).toBe("p-4");
    });

    it("handles conditional classes", () => {
      // clsx behavior: object keys with truthy values are included
      expect(cn("foo", { bar: true, baz: false })).toBe("foo bar");
    });

    it("handles array inputs", () => {
      expect(cn(["foo", "bar"], "baz")).toBe("foo bar baz");
    });

    it("ignores falsy values", () => {
      expect(cn("foo", null, undefined, false, 0, "", "bar")).toBe("foo bar");
    });

    it("handles complex combinations", () => {
      expect(
        cn(
          "base-class",
          { "bg-red-500": false, "bg-blue-500": true },
          ["text-sm", "font-bold"],
          "text-lg" // should override text-sm
        )
      ).toBe("base-class bg-blue-500 font-bold text-lg");
    });
  });

  describe("townToFilename", () => {
    it("converts uppercase town names to lowercase with hyphens", () => {
      expect(townToFilename("ANG MO KIO")).toBe("ang-mo-kio");
    });

    it("handles mixed case", () => {
      expect(townToFilename("Bukit Merah")).toBe("bukit-merah");
    });

    it("replaces special characters with hyphens", () => {
      expect(townToFilename("QUEENSTOWN (123)")).toBe("queenstown-123");
      expect(townToFilename("TOA PAYOH, NORTH")).toBe("toa-payoh-north");
    });

    it("removes leading and trailing hyphens", () => {
      expect(townToFilename("  Yishun  ")).toBe("yishun");
      expect(townToFilename("-Woodlands-")).toBe("woodlands");
      expect(townToFilename("!@# Sengkang #@!")).toBe("sengkang");
    });

    it("collapses multiple consecutive non-alphanumeric characters into a single hyphen", () => {
      expect(townToFilename("CHOA   CHU  KANG")).toBe("choa-chu-kang");
      expect(townToFilename("JURONG---WEST")).toBe("jurong-west");
    });
  });
});
