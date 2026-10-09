import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NearbyMrtExits } from "@/features/block-detail/NearbyMrtExits";
import {
  getNearbySpatialAvailable,
  resetNearbySpatialAvailableForTests,
} from "@/features/block-detail/nearbyMrtExitsApi";
import { I18nProvider } from "@/shared/lib/i18n";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const renderPanel = () =>
  render(
    <I18nProvider>
      <NearbyMrtExits lat={1.35} lng={103.75} />
    </I18nProvider>,
  );

describe("NearbyMrtExits opt-in spatial UI", () => {
  beforeEach(() => {
    resetNearbySpatialAvailableForTests();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("memoizes only successful boolean capability responses", async () => {
    let calls = 0;
    const responses = [
      json({ error: "temporary" }, 503),
      json({ available: "yes" }),
      json({ available: false }),
    ];
    const probe = vi.fn(async () => responses[calls++] ?? json({ available: true }));
    vi.stubGlobal("fetch", probe);
    expect(await getNearbySpatialAvailable()).toBe(false); // HTTP error not cached
    expect(await getNearbySpatialAvailable()).toBe(false); // malformed not cached
    expect(await getNearbySpatialAvailable()).toBe(false); // valid false cached
    expect(await getNearbySpatialAvailable()).toBe(false); // valid false reused
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("retries after a rejected capability fetch", async () => {
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValue(json({ available: true }));
    vi.stubGlobal("fetch", probe);
    expect(await getNearbySpatialAvailable()).toBe(false);
    expect(await getNearbySpatialAvailable()).toBe(true);
    expect(await getNearbySpatialAvailable()).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("is absent when the backend is disabled", async () => {
    const mock = vi.fn(async () => json({ available: false }));
    vi.stubGlobal("fetch", mock);
    renderPanel();
    await waitFor(() => expect(mock).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("nearby-mrt-exits")).not.toBeInTheDocument();
  });

  it("only queries PostGIS after user expansion and labels distances correctly", async () => {
    const mock = vi.fn(async (request: string) =>
      request.includes("nearby-capabilities")
        ? json({ available: true })
        : json({
            distanceBasis: "straight-line",
            places: [
              {
                id: "mrt_geojson:mrt_exit:21436",
                kind: "mrt_exit",
                name: "BUKIT BATOK MRT STATION (Exit B)",
                lat: 1.349,
                lng: 103.749,
                distanceMeters: 163.3,
                addressKey: null,
              },
            ],
          }),
    );
    vi.stubGlobal("fetch", mock);
    renderPanel();
    const toggle = await screen.findByRole("button", { name: "View nearby MRT exits" });
    expect(mock).toHaveBeenCalledOnce();
    fireEvent.click(toggle);
    expect(await screen.findByText("BUKIT BATOK MRT STATION (Exit B)")).toBeInTheDocument();
    expect(
      screen.getByText("Straight-line distances; actual walking routes may be longer."),
    ).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
    const request = String(mock.mock.calls[1][0]);
    expect(request).toContain("lat=1.35");
    expect(request).toContain("lng=103.75");
    expect(request).toContain("types=mrt_exit");
    expect(request).toContain("radius=1500");
  });

  it("shows an honest empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: string) =>
        request.includes("capabilities")
          ? json({ available: true })
          : json({ distanceBasis: "straight-line", places: [] }),
      ),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "View nearby MRT exits" }));
    expect(await screen.findByText("No station exits found within 1.5 km.")).toBeInTheDocument();
  });

  it("allows retry after a failure rather than displaying false zero results", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (request: string) => {
        if (request.includes("capabilities")) return json({ available: true });
        calls++;
        return calls === 1
          ? json({ error: "Unavailable" }, 503)
          : json({ distanceBasis: "straight-line", places: [] });
      }),
    );
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "View nearby MRT exits" }));
    expect(await screen.findByText("Station exits could not be loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No station exits found within 1.5 km.")).toBeInTheDocument();
  });
});
