#!/usr/bin/env node
// One-shot Playwright driver that walks the resale portal and dumps
// screenshots, button-bounding-box JSON, and console logs to OUT.
//
// Env:
//   URL       Dev server URL (default http://localhost:5173)
//   OUT       Output directory (default /tmp/audit-screens)
//   VIEWPORT  "desktop" | "mobile" (default desktop)
//   CHROME    Override Chromium executable path. If unset, falls back to
//             playwright's resolved chromium, then a sandbox-specific path.
//
// Usage:
//   npm run dev &
//   OUT=/tmp/audit-screens node scripts/audit-screens.mjs
//   VIEWPORT=mobile node scripts/audit-screens.mjs

import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const URL = process.env.URL ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "/tmp/audit-screens";
const VIEWPORT = process.env.VIEWPORT ?? "desktop";

function resolveChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  try {
    const pwPath = chromium.executablePath();
    if (pwPath && existsSync(pwPath)) return pwPath;
  } catch {
    // playwright resolution failed; fall through
  }
  const sandboxFallback = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  if (existsSync(sandboxFallback)) return sandboxFallback;
  return undefined; // let playwright launch with its default
}

const PROFILE = VIEWPORT === "mobile"
  ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 };

mkdirSync(OUT, { recursive: true });

const logs = { console: [], errors: [], failures: [] };

function tag(name) {
  return `${VIEWPORT}-${String(step).padStart(2, "0")}-${name}.png`;
}

let step = 0;
async function shot(page, name, opts = {}) {
  step += 1;
  const file = `${OUT}/${tag(name)}`;
  await page.screenshot({ path: file, fullPage: false, ...opts });
  console.log("shot", file);
  return file;
}

async function attempt(label, fn) {
  try { await fn(); console.log("ok", label); }
  catch (e) { console.log("fail", label, e.message?.slice(0, 200)); logs.failures.push({ label, msg: e.message }); }
}

const executablePath = resolveChrome();
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: PROFILE.width, height: PROFILE.height },
  deviceScaleFactor: PROFILE.deviceScaleFactor,
  isMobile: PROFILE.isMobile,
  hasTouch: PROFILE.hasTouch,
  // Block geolocation to avoid a popup
  permissions: [],
});
const page = await context.newPage();

page.on("console", (m) => logs.console.push({ type: m.type(), text: m.text() }));
page.on("pageerror", (e) => logs.errors.push(e.message));

// 1. Cold load
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await shot(page, "cold-load");

// 2. Search profile wizard appears on first visit — capture it, then skip
await attempt("wizard visible", async () => {
  const wizard = page.locator('text=/Search Profile|search profile|Skip|onboarding/i').first();
  if (await wizard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await shot(page, "wizard");
  }
});

// 3. Dismiss wizard if present
await attempt("dismiss wizard", async () => {
  const skipBtn = page.getByRole("button", { name: /skip|later|dismiss|continue without/i }).first();
  if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }
});

await shot(page, "after-dismiss");

// 4. Empty-scope state — should show ScopePrompt
await shot(page, "empty-scope");

// 5. Open filter panel
await attempt("open filters", async () => {
  const filtersBtn = page.getByRole("button", { name: /filter/i }).first();
  await filtersBtn.click({ timeout: 5000 });
  await page.waitForTimeout(600);
});
await shot(page, "filters-open");

// 6. Set a town filter
await attempt("set town", async () => {
  const townTrigger = page.getByRole("combobox").first();
  if (await townTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await townTrigger.click();
    await page.waitForTimeout(300);
    await shot(page, "town-dropdown");
    const bedok = page.getByRole("option").filter({ hasText: /bedok/i }).first();
    if (await bedok.isVisible({ timeout: 2000 }).catch(() => false)) {
      await bedok.click();
    } else {
      await page.keyboard.press("Escape");
    }
  }
});
await page.waitForTimeout(800);
await shot(page, "after-town");

// 7. Set flat type 4 ROOM if combobox present
await attempt("set flat type", async () => {
  const combos = await page.getByRole("combobox").all();
  for (const c of combos) {
    const label = (await c.textContent())?.toLowerCase() ?? "";
    if (label.includes("flat") || label.includes("room") || label.includes("type")) {
      await c.click();
      await page.waitForTimeout(300);
      const opt = page.getByRole("option").filter({ hasText: /4 ROOM/i }).first();
      if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
        await opt.click();
        break;
      }
      await page.keyboard.press("Escape");
    }
  }
});
await page.waitForTimeout(600);
await shot(page, "after-flat-type");

// 8. Close filters / view results
await attempt("close filters or open results", async () => {
  const resultsBtn = page.getByRole("button", { name: /result/i }).first();
  if (await resultsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await resultsBtn.click();
    await page.waitForTimeout(600);
  }
});
await shot(page, "results-pane");

// 9. Search bar test — type a query
await attempt("search bar typing", async () => {
  const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="address" i], input[placeholder*="station" i]').first();
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill("");
    await searchInput.type("near bedok mrt", { delay: 30 });
    await page.waitForTimeout(800);
  }
});
await shot(page, "search-bedok-mrt");

// 10. Try clicking a block on the map / first result
await attempt("select first result", async () => {
  const firstRow = page.locator('[role="button"], button, a, li').filter({ hasText: /\d+\s+\w+/ }).first();
  if (await firstRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstRow.click();
    await page.waitForTimeout(1200);
  }
});
await shot(page, "block-selected");

// 11. Detail drawer if open
await shot(page, "detail-drawer");

// 12. Try the asking-price-check input
await attempt("asking price check", async () => {
  const askingInput = page.locator('input[type="number"], input[inputmode="numeric"]').last();
  if (await askingInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await askingInput.fill("700000");
    await page.waitForTimeout(800);
  }
});
await shot(page, "asking-price");

// 13. Toggle price heatmap if button visible
await attempt("toggle heatmap", async () => {
  const heatmapBtn = page.getByRole("button", { name: /heat/i }).first();
  if (await heatmapBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await heatmapBtn.click();
    await page.waitForTimeout(800);
  }
});
await shot(page, "heatmap-on");

// 14. Theme toggle if present
await attempt("toggle theme", async () => {
  const themeBtn = page.getByRole("button", { name: /theme|dark|light/i }).first();
  if (await themeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await themeBtn.click();
    await page.waitForTimeout(500);
  }
});
await shot(page, "after-theme");

// 15. Open shortlist / saved tab if present
await attempt("open saved", async () => {
  const savedBtn = page.getByRole("button", { name: /saved|shortlist/i }).first();
  if (await savedBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await savedBtn.click();
    await page.waitForTimeout(500);
  }
});
await shot(page, "saved-tab");

// 16. Final full-page tall screenshot
await shot(page, "final-fullpage", { fullPage: true });

// Dump role/structure of visible buttons to disk for analysis
const buttons = await page.evaluate(() => {
  const result = [];
  for (const el of document.querySelectorAll('button,[role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    result.push({
      text: (el.textContent || "").trim().slice(0, 80),
      aria: el.getAttribute("aria-label") || "",
      w: Math.round(r.width),
      h: Math.round(r.height),
      x: Math.round(r.x),
      y: Math.round(r.y),
    });
  }
  return result;
});
writeFileSync(`${OUT}/${VIEWPORT}-buttons.json`, JSON.stringify(buttons, null, 2));

// Dump console errors
writeFileSync(`${OUT}/${VIEWPORT}-console.json`, JSON.stringify(logs, null, 2));

await browser.close();
console.log("DONE");
