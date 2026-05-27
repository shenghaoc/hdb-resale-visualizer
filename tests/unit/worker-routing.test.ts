import { describe, expect, it } from "vitest";
import { apiRouteDefinitions, matchApiRoute, methodNotAllowedResponse } from "../../worker/api-route-match";

describe("matchApiRoute", () => {
  it("returns method_not_allowed for POST /api/manifest with Allow: GET", () => {
    const match = matchApiRoute(new URL("https://example.com/api/manifest"), "POST");
    expect(match.kind).toBe("method_not_allowed");
    if (match.kind === "method_not_allowed") {
      expect(match.allow).toEqual(["GET"]);
    }
  });

  it("returns method_not_allowed for GET /api/shortlist with Allow: POST", () => {
    const match = matchApiRoute(new URL("https://example.com/api/shortlist"), "GET");
    expect(match.kind).toBe("method_not_allowed");
    if (match.kind === "method_not_allowed") {
      expect(match.allow).toEqual(["POST"]);
    }
  });

  it("returns no_match for unknown paths so the SPA/asset fallback can run", () => {
    expect(matchApiRoute(new URL("https://example.com/"), "GET").kind).toBe("no_match");
    expect(matchApiRoute(new URL("https://example.com/?town=BEDOK"), "GET").kind).toBe("no_match");
    expect(matchApiRoute(new URL("https://example.com/robots.txt"), "GET").kind).toBe("no_match");
    expect(matchApiRoute(new URL("https://example.com/sitemap.xml"), "GET").kind).toBe("no_match");
    expect(matchApiRoute(new URL("https://example.com/og/block/foo.png"), "GET").kind).toBe("no_match");
  });

  it("still matches valid API method/path pairs", () => {
    expect(matchApiRoute(new URL("https://example.com/api/manifest"), "GET").kind).toBe("handler");
    expect(matchApiRoute(new URL("https://example.com/api/shortlist"), "POST").kind).toBe("handler");
    expect(
      matchApiRoute(new URL("https://example.com/api/shortlist/abc123abc123abc1"), "GET").kind,
    ).toBe("handler");
  });
});

describe("methodNotAllowedResponse", () => {
  it("returns 405 with a JSON body and Allow header", async () => {
    const response = methodNotAllowedResponse(["GET"]);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
    await expect(response.json()).resolves.toEqual({ error: "Method Not Allowed" });
  });
});

describe("apiRouteDefinitions", () => {
  it("covers every documented read endpoint with GET", () => {
    const getPaths = apiRouteDefinitions
      .filter((route) => (route.method ?? "GET") === "GET")
      .map((route) => route.pattern.pathname);
    expect(getPaths).toContain("/api/manifest{/}?");
    expect(getPaths).toContain("/api/shortlist/:syncCode{/}?");
  });
});
