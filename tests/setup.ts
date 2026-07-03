import "@testing-library/jest-dom/vitest";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof URLPattern === "undefined") {
  // A minimal mock for URLPattern since it's not natively supported in Node 18/jsdom
  // @ts-expect-error Types missing
  global.URLPattern = class URLPattern {
    pathname: string;
    constructor({ pathname }: { pathname: string }) {
      // Preserve the original pattern string so `.pathname` matches the real
      // URLPattern contract; normalize the optional trailing slash on demand.
      this.pathname = pathname;
    }
    test(input: { pathname: string }) {
      // Delegate to _match so parameterized patterns (e.g. /api/towns/:town)
      // and the optional trailing slash are handled consistently.
      return this._match(input.pathname) !== null;
    }
    exec(input: { pathname: string }) {
      const match = this._match(input.pathname);
      if (match) {
        return { pathname: { groups: match } };
      }
      return null;
    }
    _match(path: string) {
      const pathParts = path.split("/").filter(Boolean);
      const patternParts = this.pathname.replace("{/}?", "").split("/").filter(Boolean);
      if (pathParts.length !== patternParts.length) return null;
      const groups: Record<string, string> = {};
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(":")) {
          groups[patternParts[i].slice(1)] = pathParts[i];
        } else if (patternParts[i] !== pathParts[i]) {
          return null;
        }
      }
      return groups;
    }
  };
}

// Add Temporal to global object in JSDOM if needed
import { Temporal } from "@js-temporal/polyfill";
global.Temporal = Temporal;
globalThis.Temporal = Temporal;
