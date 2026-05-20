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
//   AUDIT_TOWN=BEDOK AUDIT_ADDRESS_KEY=bedok-10d-bedok-sth-ave-2 node scripts/audit-screens.mjs

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

// Drive scope via URL params instead of brittle combobox clicks:
// the language selector is the first `[role=combobox]` in tab order,
// so `getByRole("combobox").first()` lands on it. URL state bypasses
// the whole UI flake.
const SCOPE_TOWN = process.env.AUDIT_TOWN ?? "BEDOK";
const SCOPE_ADDRESS_KEY = process.env.AUDIT_ADDRESS_KEY ?? "bedok-10d-bedok-sth-ave-2";

// 1. Cold load, no scope — wizard should appear here
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await shot(page, "cold-load");

// 2. Wizard screenshot
await attempt("wizard visible", async () => {
  const wizard = page.locator('text=/Search Profile|search profile|Skip|onboarding/i').first();
  if (await wizard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await shot(page, "wizard");
  }
});

// 3. Dismiss wizard so subsequent runs in the same context don't re-show it.
await attempt("dismiss wizard", async () => {
  const skipBtn = page.getByRole("button", { name: /skip|later|dismiss|continue without/i }).first();
  if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(500);
  }
});

await shot(page, "after-dismiss");
await shot(page, "empty-scope");

// 4. Apply scope via URL — this is what the app would parse via queryState
await page.goto(`${URL}?town=${encodeURIComponent(SCOPE_TOWN)}`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(800);
await shot(page, "scoped-town");

// 5. Open results pane
await attempt("open results", async () => {
  const resultsBtn = page.getByRole("button", { name: /^results$/i }).first();
  if (await resultsBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await resultsBtn.click();
    await page.waitForTimeout(600);
  }
});
await shot(page, "results-pane");

// 6. Geographic search via URL — exercises the geographic-intent codepath
await page.goto(`${URL}?search=${encodeURIComponent("near bedok mrt")}`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(800);
await shot(page, "search-bedok-mrt");

// 7. Select a specific block via URL — drives detail drawer reliably
await page.goto(
  `${URL}?town=${encodeURIComponent(SCOPE_TOWN)}&selected=${encodeURIComponent(SCOPE_ADDRESS_KEY)}`,
  { waitUntil: "domcontentloaded" },
);
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(1200);
await shot(page, "block-selected");
await shot(page, "detail-drawer");

// 8. Asking-price input — only meaningful with a block selected
await attempt("asking price check", async () => {
  const askingInput = page.locator('input[type="number"], input[inputmode="numeric"]').last();
  if (await askingInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await askingInput.fill("700000");
    await page.waitForTimeout(800);
  }
});
await shot(page, "asking-price");

// 9. Toggle price heatmap — now visible because we have a scoped block set
await attempt("toggle heatmap", async () => {
  const heatmapBtn = page.getByRole("switch", { name: /heat/i }).first();
  if (await heatmapBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await heatmapBtn.click();
  } else {
    const fallback = page.getByRole("button", { name: /heat/i }).first();
    if (await fallback.isVisible({ timeout: 1000 }).catch(() => false)) {
      await fallback.click();
    }
  }
  await page.waitForTimeout(900);
});
await shot(page, "heatmap-on");

// 10. Toggle theme
await attempt("toggle theme", async () => {
  const themeBtn = page.getByRole("button", { name: /theme|dark|light/i }).first();
  if (await themeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await themeBtn.click();
    await page.waitForTimeout(500);
  }
});
await shot(page, "after-theme");

// 11. Open shortlist / saved tab
await attempt("open saved", async () => {
  const savedBtn = page.getByRole("button", { name: /^saved$|shortlist/i }).first();
  if (await savedBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await savedBtn.click();
    await page.waitForTimeout(500);
  }
});
await shot(page, "saved-tab");

// 12. Add the selected block to the shortlist — captures populated shortlist UI
await attempt("toggle shortlist for selected block", async () => {
  const saveBtn = page.getByRole("button", { name: /save to shortlist|add to shortlist|shortlist/i }).first();
  if (await saveBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(500);
  }
});
await shot(page, "shortlist-populated");

// 13. Final full-page tall screenshot
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
