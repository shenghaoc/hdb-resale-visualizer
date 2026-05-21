// One-off generator: 32x32 ICO (BMP-in-ICO) with white "H" monogram on brand blue (#2563eb) rounded square.
// Run: node scripts/_gen-favicon.mjs public/favicon.ico
import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const W = 32;
const H = 32;
const RADIUS = 5;
const BG = [0x25, 0x63, 0xeb]; // #2563eb
const FG = [0xff, 0xff, 0xff]; // white

function inRoundedRect(x, y) {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  const r = RADIUS;
  const cxLeft = r - 1;
  const cxRight = W - r;
  const cyTop = r - 1;
  const cyBottom = H - r;
  if (x < r && y < r) {
    const dx = x - cxLeft;
    const dy = y - cyTop;
    return dx * dx + dy * dy <= r * r;
  }
  if (x >= W - r && y < r) {
    const dx = x - cxRight;
    const dy = y - cyTop;
    return dx * dx + dy * dy <= r * r;
  }
  if (x < r && y >= H - r) {
    const dx = x - cxLeft;
    const dy = y - cyBottom;
    return dx * dx + dy * dy <= r * r;
  }
  if (x >= W - r && y >= H - r) {
    const dx = x - cxRight;
    const dy = y - cyBottom;
    return dx * dx + dy * dy <= r * r;
  }
  return true;
}

// "H" geometry on a 32x32 canvas (y=0 at top)
function isH(x, y) {
  const inLeft = x >= 9 && x <= 12 && y >= 6 && y <= 25;
  const inRight = x >= 19 && x <= 22 && y >= 6 && y <= 25;
  const inCross = x >= 9 && x <= 22 && y >= 14 && y <= 17;
  return inLeft || inRight || inCross;
}

// BMP rows are bottom-up; pixels are BGRA per row.
const pixelBuf = Buffer.alloc(W * H * 4);
for (let y = H - 1; y >= 0; y--) {
  for (let x = 0; x < W; x++) {
    const i = ((H - 1 - y) * W + x) * 4;
    if (!inRoundedRect(x, y)) {
      pixelBuf.writeUInt32LE(0, i);
    } else if (isH(x, y)) {
      pixelBuf[i] = FG[2]; pixelBuf[i + 1] = FG[1]; pixelBuf[i + 2] = FG[0]; pixelBuf[i + 3] = 0xff;
    } else {
      pixelBuf[i] = BG[2]; pixelBuf[i + 1] = BG[1]; pixelBuf[i + 2] = BG[0]; pixelBuf[i + 3] = 0xff;
    }
  }
}

// BITMAPINFOHEADER (40 bytes). biHeight is 2x (image + AND mask) for ICO.
const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0);
bmpHeader.writeInt32LE(W, 4);
bmpHeader.writeInt32LE(H * 2, 8);
bmpHeader.writeUInt16LE(1, 12);
bmpHeader.writeUInt16LE(32, 14);
bmpHeader.writeUInt32LE(0, 16);
bmpHeader.writeUInt32LE(0, 20);
bmpHeader.writeInt32LE(0, 24);
bmpHeader.writeInt32LE(0, 28);
bmpHeader.writeUInt32LE(0, 32);
bmpHeader.writeUInt32LE(0, 36);
// AND mask: 32 rows of 32 bits = 4 bytes per row => 128 bytes, all zero (rely on alpha channel).
const andMask = Buffer.alloc(128, 0);
const bmpData = Buffer.concat([bmpHeader, pixelBuf, andMask]);

// ICONDIR (6) + ICONDIRENTRY (16) + BMP data
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);
iconDir.writeUInt16LE(1, 2);
iconDir.writeUInt16LE(1, 4);

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(W === 256 ? 0 : W, 0);
dirEntry.writeUInt8(H === 256 ? 0 : H, 1);
dirEntry.writeUInt8(0, 2);
dirEntry.writeUInt8(0, 3);
dirEntry.writeUInt16LE(1, 4);
dirEntry.writeUInt16LE(32, 6);
dirEntry.writeUInt32LE(bmpData.length, 8);
dirEntry.writeUInt32LE(6 + 16, 12);

const ico = Buffer.concat([iconDir, dirEntry, bmpData]);
const out = resolve(process.argv[2] ?? "public/favicon.ico");
writeFileSync(out, ico);
console.log(`Wrote ${out} (${ico.length} bytes)`);
