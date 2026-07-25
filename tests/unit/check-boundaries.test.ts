import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const ROOT_DIR = process.cwd();
const CHECK_BOUNDARIES_SCRIPT = path.join(ROOT_DIR, "scripts/check-boundaries.ts");
const TSX_IMPORT = path.join(ROOT_DIR, "node_modules/tsx/dist/esm/index.mjs");
const NODE_BIN = process.execPath;

const tempWorkspaces: string[] = [];

function makeWorkspace(files: Record<string, string>): string {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "check-boundaries-"));
  tempWorkspaces.push(workspace);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf8");
  }

  return workspace;
}

function runBoundaryCheck(workspace: string) {
  return spawnSync(NODE_BIN, ["--import", TSX_IMPORT, CHECK_BOUNDARIES_SCRIPT], {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NODE_NO_WARNINGS: "1" },
  });
}

afterEach(() => {
  for (const workspace of tempWorkspaces.splice(0)) {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

describe("check-boundaries", () => {
  it("allows scripts to import local script and shared modules", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { double } from "./lib/math";
        import { baseValue } from "../shared/value";

        export const computedValue = double(baseValue);
      `,
      "scripts/lib/math.ts": `
        export function double(value: number): number {
          return value * 2;
        }
      `,
      "shared/value.ts": `
        export const baseValue = 21;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Script boundary check passed");
  });

  it("rejects direct relative imports from scripts into src", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { runtimeValue } from "../src/runtime";

        export const value = runtimeValue;
      `,
      "src/runtime.ts": `
        export const runtimeValue = "browser-only";
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Script boundary check failed:");
    expect(result.stderr).toContain("scripts/check.ts");
    expect(result.stderr).toContain("Node-executed import graph reaches src/");
    expect(result.stderr).toContain("src/runtime.ts");
  });

  it("rejects transitive shared imports that reach src", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import { sharedValue } from "../shared/leaky";

        export const value = sharedValue;
      `,
      "shared/leaky.ts": `
        export { runtimeValue as sharedValue } from "../src/runtime";
      `,
      "src/runtime.ts": `
        export const runtimeValue = "browser-only";
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shared/leaky.ts");
    expect(result.stderr).toContain("Node-executed import graph reaches src/");
    expect(result.stderr).toContain("src/runtime.ts");
  });

  it("rejects Vite aliases in static and dynamic imports", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        import "@/lib/data";

        void import("@shared/runtime");
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Vite alias "@/"');
    expect(result.stderr).toContain('Vite alias "@shared/"');
  });

  it("rejects Vite aliases in require() calls", () => {
    const workspace = makeWorkspace({
      "scripts/check.ts": `
        require("@shared/legacy");
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Vite alias "@shared/"');
  });

  // ── Frontend architecture direction ──────────────────────────────────

  it("allows a feature to import an entity and shared UI", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/entities/block/lease.ts": `
        export function remainingYears(): number {
          return 80;
        }
      `,
      "src/shared-ui/Badge.tsx": `
        export function Badge() {
          return null;
        }
      `,
      "src/features/listing-check/Panel.tsx": `
        import { remainingYears } from "@/entities/block/lease";
        import { Badge } from "@/shared-ui/Badge";

        export function Panel() {
          return remainingYears() > 0 ? Badge : null;
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Script boundary check passed");
  });

  it("allows an entity to import another entity", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/entities/transaction/price.ts": `
        export function pricePerSqm(price: number, area: number): number {
          return price / area;
        }
      `,
      "src/entities/block/summary.ts": `
        import { pricePerSqm } from "@/entities/transaction/price";

        export function blockPsf(price: number, area: number): number {
          return pricePerSqm(price, area);
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("allows an entity to import src/shared/lib", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/shared/lib/math.ts": `
        export function clamp(value: number): number {
          return value;
        }
      `,
      "src/entities/block/score.ts": `
        import { clamp } from "@/shared/lib/math";

        export function score(value: number): number {
          return clamp(value);
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects an entity importing a feature", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/features/listing-check/verdict.ts": `
        export const verdict = "fair";
      `,
      "src/entities/block/summary.ts": `
        import { verdict } from "@/features/listing-check/verdict";

        export const label = verdict;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/entities/block/summary.ts");
    expect(result.stderr).toContain("entities must not import features");
    expect(result.stderr).toContain("src/features/listing-check/verdict.ts");
  });

  it("rejects an entity importing shared UI", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/shared-ui/Badge.tsx": `
        export function Badge() {
          return null;
        }
      `,
      "src/entities/block/summary.ts": `
        import { Badge } from "@/shared-ui/Badge";

        export const Component = Badge;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/entities/block/summary.ts");
    expect(result.stderr).toContain("entities must not import shared-ui");
  });

  it("rejects an entity importing generic components", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/components/LegacyBadge.tsx": `
        export function LegacyBadge() {
          return null;
        }
      `,
      "src/entities/block/summary.ts": `
        import { LegacyBadge } from "@/components/LegacyBadge";

        export const Component = LegacyBadge;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/entities/block/summary.ts");
    expect(result.stderr).toContain("entities must not import components");
  });

  it("allows shared UI to import src/components/ui", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/components/ui/button.tsx": `
        export function Button() {
          return null;
        }
      `,
      "src/shared-ui/Action.tsx": `
        import { Button } from "@/components/ui/button";

        export function Action() {
          return Button;
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("allows shared UI to import src/shared/lib", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/shared/lib/utils.ts": `
        export function cn(...parts: string[]): string {
          return parts.join(" ");
        }
      `,
      "src/shared-ui/Label.tsx": `
        import { cn } from "@/shared/lib/utils";

        export function Label(className: string) {
          return cn("label", className);
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("rejects shared UI importing a feature", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/features/listing-check/verdict.ts": `
        export const verdict = "fair";
      `,
      "src/shared-ui/Panel.tsx": `
        import { verdict } from "@/features/listing-check/verdict";

        export const label = verdict;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/shared-ui/Panel.tsx");
    expect(result.stderr).toContain("shared-ui must not import features");
  });

  it("rejects shared UI importing an entity", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/entities/block/lease.ts": `
        export const years = 80;
      `,
      "src/shared-ui/Panel.tsx": `
        import { years } from "@/entities/block/lease";

        export const label = years;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/shared-ui/Panel.tsx");
    expect(result.stderr).toContain("shared-ui must not import entities");
  });

  it("rejects shared UI importing HDB-domain types", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/types/data.ts": `
        export type BlockId = string;
      `,
      "src/shared-ui/Panel.tsx": `
        import type { BlockId } from "@/types/data";

        export type Props = { id: BlockId };
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/shared-ui/Panel.tsx");
    expect(result.stderr).toContain("shared-ui must not import HDB-domain types");
    expect(result.stderr).toContain("src/types/data.ts");
  });

  // ── Runtime cycle detection ──────────────────────────────────────────

  it("rejects a direct runtime source cycle", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/a.ts": `
        import { b } from "./b";
        export const a = b;
      `,
      "src/b.ts": `
        import { a } from "./a";
        export const b = a;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime source import cycle detected");
    expect(result.stderr).toMatch(
      /src\/a\.ts.*src\/b\.ts.*src\/a\.ts|src\/b\.ts.*src\/a\.ts.*src\/b\.ts/,
    );
  });

  it("rejects a multi-file runtime cycle", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/a.ts": `
        import { b } from "./b";
        export const a = b;
      `,
      "src/b.ts": `
        import { c } from "./c";
        export const b = c;
      `,
      "src/c.ts": `
        import { a } from "./a";
        export const c = a;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime source import cycle detected");
    expect(result.stderr).toContain("src/a.ts");
    expect(result.stderr).toContain("src/b.ts");
    expect(result.stderr).toContain("src/c.ts");
  });

  it("does not fail on type-only mutual imports", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/a.ts": `
        import type { B } from "./b";
        export type A = { b?: B };
        export const aValue = 1;
      `,
      "src/b.ts": `
        import type { A } from "./a";
        export type B = { a?: A };
        export const bValue = 2;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("detects dynamic-import cycles", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "src/a.ts": `
        export async function loadB() {
          return import("./b");
        }
      `,
      "src/b.ts": `
        export async function loadA() {
          return import("./a");
        }
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Runtime source import cycle detected");
  });

  it("keeps shared/product browser-package checks intact", () => {
    const workspace = makeWorkspace({
      "scripts/noop.ts": `export const ok = true;`,
      "shared/product/bad.ts": `
        import React from "react";
        export const element = React;
      `,
    });

    const result = runBoundaryCheck(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("shared/product");
    expect(result.stderr).toContain("browser-only package");
    expect(result.stderr).toContain("react");
  });
});
