import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertTemporalBootstrap } from "../../scripts/lib/temporal-bootstrap-check";

describe("assertTemporalBootstrap", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeDist(html: string, withPolyfillFile = true): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dist-bootstrap-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
    if (withPolyfillFile) {
      fs.writeFileSync(path.join(dir, "temporal-polyfill.js"), "x".repeat(20_000), "utf8");
    }
    return dir;
  }

  it("accepts a classic temporal polyfill script and bundle file", () => {
    const distDir = makeDist(`<!doctype html><body>
      <script src="/temporal-polyfill.js"></script>
      <script type="module" src="/assets/index.js"></script>
    </body>`);

    expect(() => assertTemporalBootstrap(distDir, fs.readFileSync(path.join(distDir, "index.html"), "utf8"))).not.toThrow();
  });

  it("allows Vite output with a deferred head module and classic body polyfill", () => {
    const distDir = makeDist(`<!doctype html><head>
      <script type="module" crossorigin src="/assets/index.js"></script>
    </head><body>
      <script src="/temporal-polyfill.js"></script>
    </body>`);

    expect(() => assertTemporalBootstrap(distDir, fs.readFileSync(path.join(distDir, "index.html"), "utf8"))).not.toThrow();
  });

  it("rejects missing temporal-polyfill.js", () => {
    const distDir = makeDist(`<script src="/temporal-polyfill.js"></script>`, false);

    expect(() => assertTemporalBootstrap(distDir, fs.readFileSync(path.join(distDir, "index.html"), "utf8"))).toThrow(
      /Missing .*temporal-polyfill\.js/,
    );
  });

  it("rejects module-only polyfill loading", () => {
    const distDir = makeDist(`<script type="module" src="/temporal-polyfill.js"></script>`);

    expect(() => assertTemporalBootstrap(distDir, fs.readFileSync(path.join(distDir, "index.html"), "utf8"))).toThrow(
      /classic \(non-module\) script tag/,
    );
  });
});
