// scripts/make-icons.js
// Generates four placeholder PNG icons in the orange brand color.
// Each is a solid-color square. PNGs are hand-encoded with raw filters
// (filter type 0 = None) and one IDAT chunk compressed via zlib.
//
// Outputs:
//   icons/icon-192.png            192x192
//   icons/icon-512.png            512x512
//   icons/icon-512-maskable.png   512x512  (same image)
//   icons/apple-touch-180.png     180x180

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const iconsDir = path.join(root, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

// Brand color #ff9f0a (RGB 255, 159, 10), opaque.
const R = 0xff, G = 0x9f, B = 0x0a, A = 0xff;

function crc32(buf) {
  let table = crc32._table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    crc32._table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeSolidPng(width, height, r, g, b, a) {
  // PNG signature.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;                   // bit depth
  ihdr[9] = 6;                   // RGBA color type
  ihdr[10] = 0;                  // compression
  ihdr[11] = 0;                  // filter
  ihdr[12] = 0;                  // interlace

  // Raw image data: each row prefixed with filter byte (0 = None) and width*4 RGBA bytes.
  const rowLen = width * 4 + 1;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 4;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = a;
    }
  }
  const idatData = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-512-maskable.png', 512],
  ['apple-touch-180.png', 180],
];

for (const [name, size] of targets) {
  const png = makeSolidPng(size, size, R, G, B, A);
  fs.writeFileSync(path.join(iconsDir, name), png);
  // Verify magic bytes.
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const first = png.subarray(0, 8);
  if (!first.equals(expected)) {
    throw new Error(`Invalid PNG header for ${name}`);
  }
  process.stdout.write(`wrote ${name} (${size}x${size}, ${png.length} bytes)\n`);
}
