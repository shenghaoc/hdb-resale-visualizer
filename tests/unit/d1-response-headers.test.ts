import { describe, expect, it } from "vite-plus/test";
import {
  badRequest,
  jsonResponse,
  notFound,
  privateJsonResponse,
  serverError,
} from "../../functions/_lib/d1";

describe("jsonResponse", () => {
  it("marks public D1 reads as edge-cacheable", () => {
    const response = jsonResponse({ ok: true });
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=3600");
  });

  it("merges array and Headers init without dropping cache-control", () => {
    const fromArray = jsonResponse({ ok: true }, { headers: [["x-test", "array"]] });
    expect(fromArray.headers.get("x-test")).toBe("array");
    expect(fromArray.headers.get("cache-control")).toContain("s-maxage=3600");

    const fromHeaders = jsonResponse(
      { ok: true },
      { headers: new Headers({ "x-test": "headers" }) },
    );
    expect(fromHeaders.headers.get("x-test")).toBe("headers");
    expect(fromHeaders.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});

describe("privateJsonResponse", () => {
  it("never shares shortlist payloads at the edge", async () => {
    const response = privateJsonResponse(
      { items: [{ addressKey: "secret-block" }] },
      { headers: { "cache-control": "public, max-age=3600" } },
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ items: [{ addressKey: "secret-block" }] });
  });
});

describe("error helpers", () => {
  it("returns JSON 400/404/500 bodies", async () => {
    const bad = badRequest("town filename required");
    const missing = notFound();
    const failed = serverError("Internal server error");

    expect(bad.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(failed.status).toBe(500);
    await expect(bad.json()).resolves.toEqual({ error: "town filename required" });
    await expect(missing.json()).resolves.toEqual({ error: "Not Found" });
    await expect(failed.json()).resolves.toEqual({ error: "Internal server error" });
  });
});
