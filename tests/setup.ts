import "temporal-polyfill/global";
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
      this.pathname = pathname.replace("{/}?", "");
    }
    test(input: { pathname: string }) {
      return input.pathname === this.pathname || input.pathname + "/" === this.pathname || input.pathname === this.pathname + "/";
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
       const patternParts = this.pathname.split("/").filter(Boolean);
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
