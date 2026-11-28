// Generates the placeholder app icons in public/. Zero dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CREAM = [0xfb, 0xf6, 0xec];
const SAGE = [0x5f, 0x84, 0x6a];
const SAGE_DARK = [0x46, 0x66, 0x50];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgb.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed-distance-free rounded rectangle test, in unit coordinates.
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// The mark: a card with a darker header band and two cream "lines".
// `scale` shrinks the mark about the centre (maskable keeps it in the safe zone).
function colorAt(u, v, scale) {
  const x = (u - 0.5) / scale + 0.5;
  const y = (v - 0.5) / scale + 0.5;
  if (inRoundRect(x, y, 0.22, 0.26, 0.78, 0.74, 0.07)) {
    if (inRoundRect(x, y, 0.3, 0.52, 0.7, 0.57, 0.025)) return CREAM;
    if (inRoundRect(x, y, 0.3, 0.62, 0.55, 0.67, 0.025)) return CREAM;
    if (y < 0.4) return SAGE_DARK;
    return SAGE;
  }
  return CREAM;
}

function render(size, scale) {
  const ss = 3; // supersampling per axis, for smooth edges
  const rgb = Buffer.alloc(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, scale);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 3;
      rgb[i] = Math.round(r / n);
      rgb[i + 1] = Math.round(g / n);
      rgb[i + 2] = Math.round(b / n);
    }
  }
  return encodePng(size, rgb);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(outDir, { recursive: true });
const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // The mark spans 56% of the width; at 0.8 scale it sits well inside the 80% safe zone.
  ['icon-512-maskable.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
];
for (const [name, size, scale] of icons) {
  writeFileSync(join(outDir, name), render(size, scale));
  console.log(`wrote public/${name}`);
}
