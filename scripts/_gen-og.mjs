// One-off generator: 1200×630 OG preview card for social sharing.
// Run: node scripts/_gen-og.mjs public/og-card.png
import { chromium } from "playwright";
import { resolve } from "node:path";

const W = 1200;
const H = 630;
const BG = "#2563eb"; // Brand blue
const FG = "#ffffff"; // White

const html = `<!doctype html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px;
    height: ${H}px;
    background: ${BG};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .card {
    text-align: center;
    color: ${FG};
    padding: 0 80px;
  }
  .icon {
    font-size: 120px;
    line-height: 1;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 64px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }
  p {
    font-size: 28px;
    font-weight: 500;
    opacity: 0.85;
    max-width: 800px;
    margin: 0 auto;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🏠</div>
    <h1>HDB Resale Explorer</h1>
    <p>Map-first explorer for Singapore HDB resale flats using official open data</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: W, height: H });
await page.setContent(html, { waitUntil: "networkidle" });
const out = resolve(process.argv[2] ?? "public/og-card.png");
const buffer = await page.screenshot({ path: out, type: "png" });
await browser.close();
console.log(`Wrote ${out} (${buffer.length} bytes)`);
