import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchCsvRows } from "../../scripts/lib/sync/fetchers";
import { resaleCsvRowSchema } from "../../scripts/lib/schemas";

vi.mock("../../scripts/lib/sync/rate-limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/sync/rate-limits")>()),
  waitForUpstreamSlot: vi.fn().mockResolvedValue(undefined),
}));

const HEADERS =
  "month,town,flat_type,block,street_name,storey_range,floor_area_sqm,flat_model,lease_commence_date,resale_price";
const ROW = "2014-12,BEDOK,4 ROOM,1,TEST STREET,01 TO 03,90,Model A,1980,300000";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function loadFixture(csv: string) {
  vi.stubEnv("DATA_GOV_API_KEY", "");
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { url: "https://example.test/source.csv" } })),
    )
    .mockResolvedValueOnce(new Response(csv));
  vi.stubGlobal("fetch", fetchMock);
  return fetchCsvRows("fixture");
}

describe("canonical CSV optional-column evidence", () => {
  it("preserves an absent optional column through CSV parsing and raw source validation", async () => {
    const [row] = await loadFixture(`${HEADERS}\n${ROW}\n`);
    expect(Object.hasOwn(row, "remaining_lease")).toBe(false);
    const checked = resaleCsvRowSchema.parse(row);
    expect(Object.hasOwn(checked, "remaining_lease")).toBe(false);
    expect(checked.remaining_lease).toBeUndefined();
  });

  it("preserves a present blank cell as an explicit empty string", async () => {
    const [row] = await loadFixture(`${HEADERS},remaining_lease\n${ROW},\n`);
    expect(Object.hasOwn(row, "remaining_lease")).toBe(true);
    expect(row.remaining_lease).toBe("");
    const checked = resaleCsvRowSchema.parse(row);
    expect(Object.hasOwn(checked, "remaining_lease")).toBe(true);
    expect(checked.remaining_lease).toBe("");
  });

  it("preserves raw supplied whitespace and legitimate duplicate occurrences before normalization", async () => {
    const raw = `${ROW}, 60 years  \n`;
    const rows = await loadFixture(`${HEADERS},remaining_lease\n${raw}${raw}`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(rows[1]);
    expect(rows[0].remaining_lease).toBe(" 60 years  ");
    expect(resaleCsvRowSchema.parse(rows[0]).remaining_lease).toBe(" 60 years  ");
  });
});
