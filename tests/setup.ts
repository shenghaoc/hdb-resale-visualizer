import "@testing-library/jest-dom/vitest";

// Node 24 does not include the Temporal API (available in Node >= 26).
// Provide a minimal stub so the pipeline's buildArtifacts() can run in tests.
if (typeof globalThis.Temporal === "undefined") {
  (globalThis as unknown as Record<string, unknown>).Temporal = {
    Now: {
      instant() {
        return {
          toString() {
            return new Date().toISOString();
          },
        };
      },
      plainDateISO() {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
      },
    },
    PlainYearMonth: {
      from(value: string) {
        const [year, month] = value.split("-").map(Number);
        return {
          year,
          month,
          toString() {
            return value;
          },
          until(other: { year: number; month: number }) {
            return { months: (other.year - year!) * 12 + (other.month - month!) };
          },
        };
      },
    },
  };
}
