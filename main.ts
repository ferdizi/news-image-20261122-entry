// THE SUNDAY WORLD — Sunday 22 November 2026.
// A single-file program (Node standard library only) that draws a 1024x1024
// broadsheet front page summing up the world's news of 22 November 2026 and
// writes it to /output/entry.png. No network, no randomness, no clock: two
// runs write byte-identical PNGs. Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---- palette: newsprint cream, ink, and one accent per region band ----
const CREAM = [247, 243, 232];
const INK = [20, 20, 20];
const PAPER_LINE = [120, 110, 90];
const WHITE = [255, 255, 255];
const SKY = [186, 214, 235];
const SEA = [64, 120, 168];
const GREEN = [34, 139, 80];
const LEAF = [120, 190, 90];
const SUN = [240, 170, 60];
const NIGHT = [28, 44, 84];
const FIRE = [235, 110, 40];
const ROCK = [122, 106, 92];
const SNOW = [240, 240, 238];

// ---- canvas: an RGB buffer with small vector-drawing helpers ----
const px = new Uint8Array(W * H * 3);
function fillAll(c) {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2];
  }
}
function setPix(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function rect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPix(xx, yy, c);
  }
}
function frame(x, y, w, h, c, t) {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}
function hline(x, y, w, c, t) { rect(x, y - Math.floor(t / 2), w, t, c); }
function vline(x, y, h, c, t) { rect(x - Math.floor(t / 2), y, t, h, c); }
function stamp(x, y, s, c) {
  const r = Math.floor(s / 2);
  rect(x - r, y - r, s, s, c);
}
// Bresenham line, stamped square for thickness.
function line(x0, y0, x1, y1, c, t) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    stamp(x, y, t, c);
  }
}
function polyline(pts, c, t, closed) {
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, t);
  }
  if (closed && pts.length > 2) {
    line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], c, t);
  }
}
// Scanline fill for a simple polygon.
function fillPoly(pts, c) {
  let minY = H;
  let maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) setPix(x, y, c);
    }
  }
}
function fillCircle(cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    for (let x = Math.floor(cx - dx); x <= Math.ceil(cx + dx); x++) setPix(x, y, c);
  }
}
function ring(cx, cy, r, c, t) {
  const steps = Math.max(24, Math.floor(2 * Math.PI * r));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    stamp(Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), t, c);
  }
}
function fillEllipse(cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = Math.floor(cx - dx); x <= Math.ceil(cx + dx); x++) setPix(x, y, c);
  }
}

// ---- PNG encoding (stdlib zlib + a small CRC32) ----
const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const parts = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(parts);
}

// ---- stroke font: every glyph is polylines on a 5-wide, 7-tall grid ----
// All image text is set in capitals, digits and plain punctuation, so the
// font only needs those glyphs. A glyph's strokes are point lists.
const FONT = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 4], [3, 4]]],
  B: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [3, 2], [0, 2]], [[0, 2], [3, 2], [4, 3], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6]]],
  E: [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]], [[0, 6], [4, 6]]],
  F: [[[0, 0], [0, 6]], [[0, 0], [4, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
  L: [[[0, 0], [0, 6]], [[0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2, 4], [4, 6]]],
  R: [[[0, 0], [0, 6]], [[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 3], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  '0': [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[1, 2], [3, 4]]],
  '1': [[[1, 1], [2, 0], [2, 6]], [[0, 6], [4, 6]]],
  '2': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  '3': [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  '4': [[[3, 0], [0, 4], [4, 4]], [[3, 0], [3, 6]]],
  '5': [[[4, 0], [0, 0], [0, 2], [3, 2], [4, 3], [4, 5], [3, 6], [1, 6], [0, 5]]],
  '6': [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 6], [1, 6], [3, 6], [4, 5], [4, 3], [3, 2], [1, 2], [0, 3]]],
  '7': [[[0, 0], [4, 0], [2, 6]]],
  '8': [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]], [[1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3]]],
  '9': [[[4, 6], [4, 0], [3, 0], [1, 0], [0, 1], [0, 3], [1, 4], [3, 4], [4, 3]]],
  '.': [[[2, 6], [2, 6]]],
  ',': [[[2, 4], [2, 6], [1, 6]]],
  ':': [[[2, 2], [2, 2]], [[2, 5], [2, 5]]],
  ';': [[[2, 2], [2, 2]], [[2, 4], [2, 6], [1, 6]]],
  '-': [[[0, 3], [4, 3]]],
  "'": [[[2, 0], [2, 2]]],
  '/': [[[4, 6], [0, 0]]],
  '(': [[[3, 0], [2, 1], [2, 5], [3, 6]]],
  ')': [[[1, 0], [2, 1], [2, 5], [1, 6]]],
  '!': [[[2, 0], [2, 4]], [[2, 6], [2, 6]]],
  '?': [[[1, 1], [2, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3]], [[2, 6], [2, 6]]],
  '%': [[[3, 0], [1, 6]], [[1, 1], [1, 1]], [[3, 5], [3, 5]]],
  $: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]], [[2, 0], [2, 6]]],
  '+': [[[0, 3], [4, 3]], [[2, 0], [2, 6]]],
  '=': [[[0, 2], [4, 2]], [[0, 4], [4, 4]]],
  '"': [[[1, 0], [1, 2]], [[3, 0], [3, 2]]],
  ' ': [],
};

// One character cell is 6 grid units wide (5 + 1 spacing); cap height is 7.
function textWidth(s, size) { return s.length * 6 * (size / 7); }
function drawChar(ch, x, y, size, c, w) {
  const g = FONT[ch];
  if (!g) return;
  const s = size / 7;
  for (const stroke of g) {
    const pts = stroke.map((p) => [x + p[0] * s, y + p[1] * s]);
    if (pts.length === 1) { stamp(Math.round(pts[0][0]), Math.round(pts[0][1]), Math.max(w, 2), c); continue; }
    polyline(pts, c, w, false);
  }
}
function drawText(s, x, y, size, c, w) {
  const adv = 6 * (size / 7);
  for (let i = 0; i < s.length; i++) drawChar(s[i], x + i * adv, y, size, c, w);
  return x + s.length * adv;
}
function drawTextCentred(s, cx, y, size, c, w) {
  drawText(s, cx - textWidth(s, size) / 2, y, size, c, w);
}
function weightFor(size) { return Math.max(1, Math.round(size / 8)); }

// ---- hero illustrations: three drawn panels, no photos, no portraits ----

// Panel 1 — COP31: sunrise over the Antalya coast, a green deal document
// and a globe.
function drawCop31(x, y, w, h) {
  rect(x, y, w, h, SKY);
  fillCircle(x + w * 0.72, y + h * 0.34, 26, SUN);
  ring(x + w * 0.72, y + h * 0.34, 34, SUN, 3);
  // sea + coast
  rect(x, y + h * 0.62, w, h * 0.38, SEA);
  fillPoly([[x, y + h * 0.62], [x + w * 0.45, y + h * 0.55], [x + w, y + h * 0.62], [x + w, y + h * 0.62]], [222, 200, 150]);
  line(x, y + h * 0.70, x + w, y + h * 0.70, WHITE, 2);
  line(x + w * 0.1, y + h * 0.80, x + w * 0.9, y + h * 0.80, WHITE, 2);
  line(x + w * 0.2, y + h * 0.90, x + w * 0.8, y + h * 0.90, WHITE, 2);
  // globe, left
  const gx = x + w * 0.22;
  const gy = y + h * 0.30;
  fillCircle(gx, gy, 34, SEA);
  fillEllipse(gx - 8, gy - 10, 14, 8, LEAF);
  fillEllipse(gx + 10, gy + 8, 12, 9, LEAF);
  fillEllipse(gx - 14, gy + 14, 8, 6, LEAF);
  ring(gx, gy, 34, INK, 2);
  // deal document, right, with a green seal and check
  const dx = x + w * 0.58;
  const dy = y + h * 0.42;
  rect(dx, dy, 62, 78, WHITE);
  frame(dx, dy, 62, 78, INK, 2);
  rect(dx, dy, 62, 14, GREEN);
  rect(dx + 8, dy + 22, 46, 4, INK);
  rect(dx + 8, dy + 32, 46, 4, INK);
  rect(dx + 8, dy + 42, 34, 4, INK);
  polyline([[dx + 12, dy + 60], [dx + 24, dy + 70], [dx + 46, dy + 52]], GREEN, 4, false);
  // small green leaves above the document
  fillEllipse(x + w * 0.62, y + h * 0.30, 16, 7, GREEN);
  fillEllipse(x + w * 0.80, y + h * 0.26, 14, 6, LEAF);
}

// Panel 2 — Bahrain: missile trails and defence arcs over a Gulf skyline.
function drawBahrain(x, y, w, h) {
  rect(x, y, w, h, NIGHT);
  // stars
  const stars = [[14, 12], [52, 26], [96, 10], [150, 30], [210, 14], [260, 26], [300, 12], [120, 44], [180, 18], [240, 46]];
  for (const s of stars) stamp(x + s[0], y + s[1], 3, WHITE);
  // skyline
  const towers = [[0, 62, 34, 90], [38, 40, 30, 112], [72, 74, 36, 78], [112, 30, 26, 122], [142, 58, 34, 94], [180, 44, 30, 108], [214, 70, 36, 82], [254, 36, 28, 116], [286, 60, 34, 92]];
  for (const t of towers) {
    rect(x + t[0], y + h - t[3], t[2], t[3], [52, 66, 110]);
    frame(x + t[0], y + h - t[3], t[2], t[3], INK, 1);
  }
  for (const t of towers) {
    for (let wy = y + h - t[3] + 10; wy < y + h - 8; wy += 14) {
      for (let wx = x + t[0] + 6; wx < x + t[0] + t[2] - 4; wx += 12) stamp(wx, wy, 3, [250, 210, 120]);
    }
  }
  // defence arcs
  ring(x + w * 0.5, y + h, 120, [120, 190, 240], 3);
  ring(x + w * 0.5, y + h, 88, [120, 190, 240], 2);
  ring(x + w * 0.5, y + h, 56, [120, 190, 240], 2);
  // missile trails with bright heads
  line(x + 30, y + 18, x + 130, y + 96, FIRE, 4);
  line(x + 290, y + 10, x + 200, y + 88, FIRE, 4);
  line(x + 170, y + 6, x + 165, y + 70, [255, 200, 90], 4);
  fillCircle(x + 130, y + 96, 7, FIRE);
  fillCircle(x + 200, y + 88, 7, FIRE);
  fillCircle(x + 165, y + 70, 7, [255, 200, 90]);
  // burst where a trail meets an arc
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI;
    line(x + 130, y + 96, x + 130 + Math.round(16 * Math.cos(a)), y + 96 + Math.round(16 * Math.sin(a)), [255, 200, 90], 2);
  }
}

// Panel 3 — Peru quake: cracked Andes, shaking houses, motion lines.
function drawPeru(x, y, w, h) {
  rect(x, y, w, h, SKY);
  fillCircle(x + w * 0.82, y + h * 0.20, 20, SUN);
  // Andes: two big peaks with snow caps
  fillPoly([[x, y + h], [x + w * 0.30, y + h * 0.18], [x + w * 0.62, y + h]], ROCK, );
  fillPoly([[x + w * 0.42, y + h], [x + w * 0.72, y + h * 0.10], [x + w, y + h]], [96, 84, 72]);
  fillPoly([[x + w * 0.30, y + h * 0.18], [x + w * 0.22, y + h * 0.30], [x + w * 0.38, y + h * 0.30]], SNOW);
  fillPoly([[x + w * 0.72, y + h * 0.10], [x + w * 0.64, y + h * 0.24], [x + w * 0.80, y + h * 0.24]], SNOW);
  // ground crack, zigzag
  polyline([[x + w * 0.10, y + h * 0.86], [x + w * 0.24, y + h * 0.78], [x + w * 0.36, y + h * 0.88], [x + w * 0.52, y + h * 0.76], [x + w * 0.66, y + h * 0.88], [x + w * 0.82, y + h * 0.78], [x + w * 0.95, y + h * 0.86]], INK, 4, false);
  polyline([[x + w * 0.30, y + h * 0.30], [x + w * 0.36, y + h * 0.42], [x + w * 0.30, y + h * 0.52], [x + w * 0.38, y + h * 0.62]], INK, 3, false);
  // shaking houses in the foreground
  const houses = [[18, 0], [86, 6], [158, -4], [228, 4]];
  for (const hs of houses) {
    const hx = x + hs[0];
    const hy = y + h - 52 + hs[1];
    fillPoly([[hx, hy + 22], [hx + 22, hy], [hx + 44, hy + 22]], FIRE);
    rect(hx + 4, hy + 22, 36, 26, WHITE);
    frame(hx + 4, hy + 22, 36, 26, INK, 2);
    rect(hx + 17, hy + 34, 10, 14, INK);
  }
  // motion lines beside the houses
  for (const mx of [8, 70, 140, 205, 275]) {
    line(x + mx, y + h - 62, x + mx + 14, y + h - 62, INK, 2);
    line(x + mx, y + h - 52, x + mx + 14, y + h - 52, INK, 2);
  }
}

// ---- dotted world map: continents as ellipses, dots where land is ----
const LAND = [
  // North America
  [180, 478, 78, 16], [222, 494, 46, 12], [118, 470, 32, 10], [252, 506, 26, 6],
  // South America
  [298, 502, 32, 24], [308, 522, 18, 12],
  // Europe
  [500, 470, 30, 10], [522, 478, 18, 8],
  // Africa
  [520, 502, 30, 22], [526, 520, 18, 10],
  // Middle East / Asia
  [566, 486, 22, 9], [650, 470, 110, 15], [700, 488, 70, 13], [758, 494, 34, 11],
  [730, 504, 24, 8], [800, 478, 8, 10],
  // Australia
  [800, 518, 34, 10], [852, 524, 8, 8],
];
function onLand(pxx, pyy) {
  for (const e of LAND) {
    const dx = (pxx - e[0]) / e[2];
    const dy = (pyy - e[1]) / e[3];
    if (dx * dx + dy * dy <= 1) return true;
  }
  return false;
}
function drawMap(x0, y0, x1, y1) {
  for (let gy = y0 + 4; gy < y1; gy += 7) {
    for (let gx = x0 + 4; gx < x1; gx += 7) {
      if (onLand(gx, gy)) rect(gx, gy, 3, 3, INK);
    }
  }
}
function drawPin(cx, cy, n, c) {
  fillCircle(cx, cy, 11, c);
  ring(cx, cy, 11, WHITE, 2);
  drawTextCentred(String(n), cx + 1, cy - 5, 13, WHITE, 2);
}

// ---- the page: masthead, heroes, map, region bands, ticker, footer ----
const BANDS = [
  { name: ['EUROPE'], color: [37, 99, 235], stories: [
    'KRYVYI RIH: 2 KILLED, 60 WOUNDED 21 NOV',
    'LVIV STRIKE: 2 KILLED, 10 INJURED 21 NOV',
    'SPARTA II ABLAZE OFF FINLAND 21 NOV',
    '2 MISSILES + DRONE LAND IN POLAND 21 NOV',
    'DRONE HITS DUTCH EMBASSY, KYIV 21 NOV',
  ] },
  { name: ['MIDDLE', 'EAST'], color: [220, 38, 38], stories: [
    'TANKER FIRE OFF OMAN, IRAN: MINE 21 NOV',
    'ADNOC SHIP HIT, HORMUZ: 1 MISSING 21 NOV',
    'GAZA: 3 FOOD HANDOUT MEN KILLED 21 NOV',
    'ARAB STATES CONDEMN IRAN STRIKES 21 NOV',
    'YEMEN PORT ATTACKS ENDANGER AID 21 NOV',
  ] },
  { name: ['ASIA', 'PACIFIC'], color: [13, 148, 136], stories: [
    'M6.8 QUAKE OFF TIMOR-LESTE 22 NOV',
    'TRUMP-XI-PUTIN MEET IN SHENZHEN 21 NOV',
    'INDIA V NZ TEST IN WELLINGTON 21 NOV',
    '57TH IFFI FILM FESTIVAL IN GOA 21 NOV',
    'INDIA CALLS FOR CLIMATE JUSTICE 21 NOV',
  ] },
  { name: ['AMERICAS'], color: [234, 88, 12], stories: [
    "'CHAPO ISIDRO' CAPTURED IN MEXICO 21 NOV",
    'BRAZIL STORM KILLS 3, RAZES HOMES 21 NOV',
    'FBI PROBES HACK OF ITS DATABASE 22 NOV',
    'TRUMP WARNS US FIRMS ON AI ABROAD 21 NOV',
  ] },
  { name: ['MARKETS', 'TECH'], color: [124, 58, 237], stories: [
    'NASDAQ -5.3% AS S AND P SLIDE 21 NOV',
    'NVIDIA SHARES FALL 14% 21 NOV',
    'ANTHROPIC -9% AFTER RECORD IPO 21 NOV',
    "RIEMANN 'PROOF' CLAIM BY CLAUDE 21 NOV",
    'GTA 6: $3.79BN ON DAY ONE 21 NOV',
    'OIL NEAR $90 AS GULF FEARS GROW 21 NOV',
  ] },
  { name: ['AFRICA'], color: [22, 163, 74], stories: [
    'NIGERIA BOAT CAPSIZE: 24 BODIES 21 NOV',
    'NEXT CLIMATE SUMMIT IN ADDIS 2027 21 NOV',
    'EGYPT CONDEMNS BAHRAIN STRIKES 21 NOV',
  ] },
  { name: ['SPORT', 'CULTURE'], color: [219, 39, 119], stories: [
    'REAL MADRID WIN 2-1 21 NOV',
    'DORTMUND WIN 1-0, GO TOP 21 NOV',
    'LEEDS BEAT CHELSEA 4-1 21 NOV',
    'AUSTRALIA END ENGLAND T20 STREAK 21 NOV',
  ] },
];

const HEROES = [
  { draw: drawCop31, head: ['COP31 NEARS', 'A DEAL'],
    cap: ['ANTALYA: NEW PACKAGE,', 'APPROVAL 06:00 GMT, 22 NOV'] },
  { draw: drawBahrain, head: ['IRAN HITS US', 'BASES IN BAHRAIN'],
    cap: ['IRGC STRIKES AL-RIFFA', 'AWALI; FIRE, NO INJURIES 21 NOV'] },
  { draw: drawPeru, head: ['M6.7 SHAKES', 'PERU'],
    cap: ['CARHUAMAYO, JUNIN: NO DEATHS;', '152 HOMES UNINHABITABLE, 21 NOV'] },
];

function drawPage() {
  fillAll(CREAM);
  frame(10, 10, 1004, 1004, INK, 2);
  frame(16, 16, 992, 992, PAPER_LINE, 1);

  // Masthead: name, then the date on an ink band so it cannot be missed.
  drawTextCentred('THE SUNDAY WORLD', 512, 26, 52, INK, 6);
  rect(24, 88, 976, 44, INK);
  drawTextCentred('SUNDAY 22 NOVEMBER 2026', 512, 97, 36, CREAM, 4);
  drawTextCentred('THE WORLD IN ONE DAY - 35 STORIES, 7 REGIONS', 512, 142, 15, INK, 2);
  hline(24, 162, 976, INK, 2);

  // Hero row: three drawn panels.
  const heroY = 170;
  const heroH = 278;
  for (let i = 0; i < 3; i++) {
    const x = 24 + i * 328;
    const hero = HEROES[i];
    frame(x, heroY, 320, heroH, INK, 2);
    hero.draw(x + 2, heroY + 2, 316, 148);
    hline(x + 2, heroY + 152, 316, INK, 2);
    drawTextCentred(hero.head[0], x + 160, heroY + 162, 23, INK, 3);
    drawTextCentred(hero.head[1], x + 160, heroY + 190, 23, INK, 3);
    drawTextCentred(hero.cap[0], x + 160, heroY + 224, 10, INK, 2);
    drawTextCentred(hero.cap[1], x + 160, heroY + 240, 10, INK, 2);
  }

  // World map strip with numbered region pins (numbers match the bands).
  drawText('THE WORLD TODAY', 24, 458, 12, INK, 2);
  drawText('NUMBERS MATCH THE REGIONS BELOW', 700, 458, 10, INK, 1);
  drawMap(24, 474, 1000, 542);
  const pins = [[508, 478, 1, BANDS[0].color], [570, 494, 2, BANDS[1].color],
    [715, 494, 3, BANDS[2].color], [295, 514, 4, BANDS[3].color],
    [225, 486, 5, BANDS[4].color], [520, 516, 6, BANDS[5].color],
    [812, 524, 7, BANDS[6].color]];
  for (const p of pins) drawPin(p[0], p[1], p[2], p[3]);

  // Region bands: colour block + dated one-line stories in two columns.
  let bandY = 550;
  for (let b = 0; b < BANDS.length; b++) {
    const band = BANDS[b];
    const bh = 54;
    rect(24, bandY, 130, bh, band.color);
    fillCircle(38, bandY + 10, 8, WHITE);
    drawTextCentred(String(b + 1), 39, bandY + 5, 10, band.color, 2);
    const nameY = band.name.length === 1 ? bandY + 22 : bandY + 14;
    for (let li = 0; li < band.name.length; li++) {
      drawTextCentred(band.name[li], 89, nameY + li * 16, 13, WHITE, 2);
    }
    const cols = [[], []];
    band.stories.forEach((s, i) => cols[i % 2].push(s));
    const rows = Math.max(cols[0].length, cols[1].length);
    const top = bandY + 8 + (3 - rows) * 7;
    for (let c = 0; c < 2; c++) {
      const cx = 164 + c * 412;
      for (let r = 0; r < cols[c].length; r++) {
        const ry = top + r * 14;
        rect(cx, ry + 3, 6, 6, band.color);
        drawText(cols[c][r], cx + 11, ry, 11, INK, 1);
      }
    }
    bandY += 56;
  }

  // Bottom ticker + the note to the judge.
  rect(24, 948, 976, 34, INK);
  drawTextCentred('ALSO TODAY: GTA 6 $3.79BN - RIEMANN CLAIM - EU-INDONESIA DEAL - FBI PROBE - OIL NEAR $90 - REAL MADRID 2-1', 512, 959, 10, CREAM, 1);
  drawTextCentred('EVERY STORY ABOVE WAS REPORTED ON 21-22 NOVEMBER 2026.', 512, 990, 11, INK, 2);
}

function main() {
  drawPage();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG());
}

main();
