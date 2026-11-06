/**
 * Generates the Amit PWA icons without ImageMagick/canvas.
 * Draws at 2x and box-downsamples, then writes PNG with zlib.
 *
 * Usage: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const INK = [8, 33, 31];
const INK_2 = [18, 54, 48];
const CREAM = [247, 243, 232];
const MANGO = [255, 176, 32];
const TEAL = [31, 127, 113];

function blend(px, i, color, alpha = 1) {
  if (alpha <= 0) return;
  const a = Math.min(1, Math.max(0, alpha));
  px[i] = Math.round(px[i] * (1 - a) + color[0] * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + color[1] * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + color[2] * a);
  px[i + 3] = Math.max(px[i + 3], Math.round(255 * a));
}

function makeCanvas(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4) };
}

function fillRoundRect(c, x, y, w, h, r, color) {
  const { size, data } = c;
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(size, Math.ceil(y + h)); py++) {
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(size, Math.ceil(x + w)); px++) {
      const dx = Math.max(x + r - px, 0, px - (x + w - r));
      const dy = Math.max(y + r - py, 0, py - (y + h - r));
      const inside = dx * dx + dy * dy <= r * r;
      if (inside) blend(data, (py * size + px) * 4, color, 1);
    }
  }
}

function disc(c, cx, cy, radius, color, alpha = 1) {
  const { size, data } = c;
  for (let py = Math.max(0, Math.floor(cy - radius)); py < Math.min(size, Math.ceil(cy + radius)); py++) {
    for (let px = Math.max(0, Math.floor(cx - radius)); px < Math.min(size, Math.ceil(cx + radius)); px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      if (d <= radius) blend(data, (py * size + px) * 4, color, alpha * Math.min(1, radius - d + 0.5));
    }
  }
}

function ring(c, cx, cy, radius, width, color, alpha = 1) {
  const { size, data } = c;
  const outer = radius + width / 2;
  for (let py = Math.max(0, Math.floor(cy - outer)); py < Math.min(size, Math.ceil(cy + outer)); py++) {
    for (let px = Math.max(0, Math.floor(cx - outer)); px < Math.min(size, Math.ceil(cx + outer)); px++) {
      const d = Math.abs(Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius);
      if (d <= width / 2) blend(data, (py * size + px) * 4, color, alpha * Math.min(1, width / 2 - d + 0.5));
    }
  }
}

function segment(c, x1, y1, x2, y2, width, color, alpha = 1) {
  const { size, data } = c;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy || 1;
  const pad = width / 2 + 1;
  for (let py = Math.max(0, Math.floor(Math.min(y1, y2) - pad)); py < Math.min(size, Math.ceil(Math.max(y1, y2) + pad)); py++) {
    for (let px = Math.max(0, Math.floor(Math.min(x1, x2) - pad)); px < Math.min(size, Math.ceil(Math.max(x1, x2) + pad)); px++) {
      let t = ((px + 0.5 - x1) * vx + (py + 0.5 - y1) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px + 0.5 - (x1 + t * vx), py + 0.5 - (y1 + t * vy));
      if (d <= width / 2) blend(data, (py * size + px) * 4, color, alpha * Math.min(1, width / 2 - d + 0.5));
    }
  }
}

function gradientBackground(c, radius, size) {
  const { data } = c;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const color = [
      Math.round(INK[0] + (INK_2[0] - INK[0]) * t),
      Math.round(INK[1] + (INK_2[1] - INK[1]) * t),
      Math.round(INK[2] + (INK_2[2] - INK[2]) * t),
    ];
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, 0, x - (size - radius));
      const dy = Math.max(radius - y, 0, y - (size - radius));
      if (dx * dx + dy * dy <= radius * radius) {
        blend(data, (y * size + x) * 4, color, 1);
      }
    }
  }
}

/** Artwork in a 512 reference frame, scaled by s and offset by ox/oy. */
function drawMark(c, scale, ox, oy) {
  const S = (v) => v * scale;
  const X = (v) => ox + S(v);
  const Y = (v) => oy + S(v);

  // Sun
  disc(c, X(371), Y(146), S(64), MANGO, 1);
  // Subtle horizon ring behind the bike
  ring(c, X(256), Y(330), S(186), S(3), CREAM, 0.16);

  const w = 19;
  ring(c, X(148), Y(352), S(52), S(w), CREAM, 1);
  ring(c, X(366), Y(352), S(52), S(w), CREAM, 1);

  // Frame
  segment(c, X(148), Y(352), X(246), Y(258), S(w), CREAM, 1);
  segment(c, X(246), Y(258), X(334), Y(258), S(w), CREAM, 1);
  segment(c, X(334), Y(258), X(366), Y(352), S(w), CREAM, 1);
  segment(c, X(246), Y(258), X(208), Y(352), S(w), CREAM, 1);

  // Handlebar
  segment(c, X(334), Y(258), X(342), Y(216), S(w), CREAM, 1);
  segment(c, X(314), Y(216), X(371), Y(216), S(w), CREAM, 1);

  // Saddle
  segment(c, X(226), Y(246), X(272), Y(246), S(w + 6), CREAM, 1);

  // Mango hub on the rear wheel
  disc(c, X(148), Y(352), S(11), MANGO, 1);
}

function downsample(src, outSize) {
  const factor = src.size / outSize;
  const out = makeCanvas(outSize);
  for (let y = 0; y < outSize; y++) {
    for (let x = 0; x < outSize; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * src.size + (x * factor + sx)) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          a += src.data[i + 3];
          n++;
        }
      }
      const j = (y * outSize + x) * 4;
      out.data[j] = r / n;
      out.data[j + 1] = g / n;
      out.data[j + 2] = b / n;
      out.data[j + 3] = a / n;
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(canvas) {
  const { size, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function build({ size, maskable = false }) {
  const scaleFactor = 2;
  const big = makeCanvas(512 * scaleFactor);
  gradientBackground(big, maskable ? 0 : 112 * scaleFactor, big.size);
  const scale = (maskable ? 0.78 : 1) * scaleFactor;
  const offset = (big.size - 512 * scale) / 2;
  drawMark(big, scale, offset, offset);
  const out = downsample(big, size);
  return encodePng(out);
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), build({ size }));
}
writeFileSync(join(OUT, 'maskable-512.png'), build({ size: 512, maskable: true }));
writeFileSync(join(OUT, 'apple-touch-icon.png'), build({ size: 180 }));

console.log('Icons written to', OUT);
