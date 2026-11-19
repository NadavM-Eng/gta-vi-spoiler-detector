// Draws the extension icon and writes it as PNG files into icons/.
// Usage: node scripts/make-icons.js
// The icon is a dark rounded square with "VI" in off-white and an orange-red slash through it.
// No dependencies: shapes are drawn with distance functions and the PNG is encoded by hand.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZES = [16, 32, 48, 96, 128];
const OUT_DIR = path.join(__dirname, '..', 'icons');
const SAMPLES = 4; // each pixel is sampled SAMPLES x SAMPLES times for smooth edges

const INK = [0x1d, 0x1d, 0x1b];
const PAPER = [0xf4, 0xf3, 0xef];
const SLASH = [0xd4, 0x54, 0x2b];

// A stroke with round ends, in a 0..1 coordinate space.
function stroke(from, to, width, color) {
  return { from, to, radius: width / 2, color };
}

const STROKES = [
  stroke([0.19, 0.3], [0.35, 0.7], 0.1, PAPER), // V, left arm
  stroke([0.51, 0.3], [0.35, 0.7], 0.1, PAPER), // V, right arm
  stroke([0.71, 0.3], [0.71, 0.7], 0.1, PAPER), // I
  stroke([0.17, 0.8], [0.83, 0.2], 0.17, INK), // dark gap around the slash
  stroke([0.17, 0.8], [0.83, 0.2], 0.085, SLASH),
];

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

function insideStroke(x, y, s) {
  const [ax, ay] = s.from;
  const [bx, by] = s.to;
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)));
  const dx = x - (ax + t * abx);
  const dy = y - (ay + t * aby);
  return dx * dx + dy * dy <= s.radius * s.radius;
}

// Colour and coverage of one sample point: the topmost shape that contains it.
function sample(x, y) {
  if (!insideRoundedSquare(x, y, 0.22)) return null;
  let color = INK;
  for (const s of STROKES) if (insideStroke(x, y, s)) color = s.color;
  return color;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = sample((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          if (!color) continue;
          r += color[0]; g += color[1]; b += color[2];
          covered++;
        }
      }
      const i = (py * size + px) * 4;
      if (covered > 0) {
        pixels[i] = Math.round(r / covered);
        pixels[i + 1] = Math.round(g / covered);
        pixels[i + 2] = Math.round(b / covered);
        pixels[i + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
      }
    }
  }
  return pixels;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(zlib.crc32(body), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type: RGBA

  // Each row is prefixed with a filter byte (0 = none).
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(file, encodePng(size, render(size)));
  console.log(`icons/icon-${size}.png`);
}
