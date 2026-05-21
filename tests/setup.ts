import "temporal-polyfill/global";
import "@testing-library/jest-dom/vitest";

if (typeof ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

