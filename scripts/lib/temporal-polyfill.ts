import { Temporal } from "@js-temporal/polyfill";

if (typeof (globalThis as any).Temporal === "undefined") {
  (globalThis as any).Temporal = Temporal;
}
