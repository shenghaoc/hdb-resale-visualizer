import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import {
  MAP_GLYPHS_URL,
  ONEMAP_DEFAULT_TILE_URL,
  ONEMAP_NIGHT_TILE_URL,
} from "@/shared/lib/constants";

function parseContentSecurityPolicy(headersFile: string): Map<string, string[]> {
  const cspLine = headersFile
    .split(/\r?\n/u)
    .find((line) => line.trim().startsWith("Content-Security-Policy:"));

  if (!cspLine) {
    throw new Error("Content-Security-Policy header not found");
  }

  const policy = cspLine.slice(cspLine.indexOf(":") + 1).trim();
  const directives = new Map<string, string[]>();

  for (const directive of policy.split(";")) {
    const [name, ...values] = directive.trim().split(/\s+/u);
    if (name) {
      directives.set(name, values);
    }
  }

  return directives;
}

function urlOrigin(urlTemplate: string): string {
  return new URL(urlTemplate).origin;
}

function expectSourceListToAllowOrigin(sourceList: string[], origin: string): void {
  const expectedUrl = new URL(origin);
  const allowed = sourceList.some((source) => {
    if (source === origin) {
      return true;
    }

    if (!source.includes("*")) {
      return false;
    }

    const sourceUrl = new URL(source.replace("*.", "wildcard."));
    const sourceHostSuffix = sourceUrl.hostname.replace(/^wildcard\./u, "");
    return (
      sourceUrl.protocol === expectedUrl.protocol &&
      expectedUrl.hostname.endsWith(`.${sourceHostSuffix}`)
    );
  });

  expect(allowed).toBe(true);
}

describe("Content Security Policy", () => {
  let directives: Map<string, string[]>;

  beforeAll(() => {
    const headersFile = fs.readFileSync("public/_headers", "utf8");
    directives = parseContentSecurityPolicy(headersFile);
  });

  it("allows configured MapLibre glyph endpoints through connect-src", () => {
    const connectSrc = directives.get("connect-src") ?? [];

    expect(connectSrc).toContain(urlOrigin(MAP_GLYPHS_URL));
    expect(connectSrc).toContain("https://fonts.openmaptiles.org");
  });

  it("allows OneMap raster tile origins through img-src", () => {
    const imgSrc = directives.get("img-src") ?? [];

    expectSourceListToAllowOrigin(imgSrc, urlOrigin(ONEMAP_DEFAULT_TILE_URL));
    expectSourceListToAllowOrigin(imgSrc, urlOrigin(ONEMAP_NIGHT_TILE_URL));
  });
});
