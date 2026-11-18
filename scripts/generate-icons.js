/**
 * Generates minimal PWA icons (192px and 512px) as PNG files.
 * Blue (#2563eb) square with white "R" letter.
 * Uses only Node.js built-ins + a hand-crafted minimal PNG structure.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/**
 * Creates a minimal valid PNG buffer for a solid-colour square with a
 * centred white letter "R" drawn via pixel manipulation.
 *
 * @param {number} size - Width and height in pixels
 * @returns {Buffer} PNG file contents
 */
function createIconPng(size) {
  // ── Pixel data (RGBA) ──────────────────────────────────────────────────────
  const bg = { r: 0x25, g: 0x63, b: 0xeb, a: 0xff }; // #2563eb blue
  const fg = { r: 0xff, g: 0xff, b: 0xff, a: 0xff }; // white

  // Build raw RGBA pixel array
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = bg.r;
    pixels[i * 4 + 1] = bg.g;
    pixels[i * 4 + 2] = bg.b;
    pixels[i * 4 + 3] = bg.a;
  }

  // Draw a simple "R" shape (relative to icon size)
  // Scale the letter to ~40% of icon size, centred
  const scale = size / 64; // design grid is 64px
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);

  // Stem: x from 22..26 (scaled), y from 16..48
  const sx = Math.floor(22 * scale);
  const ex = Math.floor(26 * scale);
  const sy = Math.floor(16 * scale);
  const ey = Math.floor(48 * scale);

  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      const idx = (y * size + x) * 4;
      pixels[idx + 0] = fg.r;
      pixels[idx + 1] = fg.g;
      pixels[idx + 2] = fg.b;
      pixels[idx + 3] = fg.a;
    }
  }

  // Bump top: x from 26..42, y from 16..32  (right half of bowl)
  const bx1 = Math.floor(26 * scale);
  const bx2 = Math.floor(42 * scale);
  const by1 = Math.floor(16 * scale);
  const by2 = Math.floor(32 * scale);

  for (let y = by1; y < by2; y++) {
    for (let x = bx1; x < bx2; x++) {
      const idx = (y * size + x) * 4;
      pixels[idx + 0] = fg.r;
      pixels[idx + 1] = fg.g;
      pixels[idx + 2] = fg.b;
      pixels[idx + 3] = fg.a;
    }
  }

  // Leg: diagonal from (38,32) to (46,48) (scaled)
  const legStartX = Math.floor(38 * scale);
  const legStartY = Math.floor(32 * scale);
  const legEndX = Math.floor(46 * scale);
  const legEndY = Math.floor(48 * scale);
  const legLen = legEndY - legStartY;
  const thick = Math.max(1, Math.floor(4 * scale));

  for (let i = 0; i < legLen; i++) {
    const lx = Math.floor(legStartX + (legEndX - legStartX) * (i / legLen));
    const ly = legStartY + i;
    for (let dx = 0; dx < thick; dx++) {
      const px = lx + dx;
      const py = ly;
      if (px >= 0 && px < size && py >= 0 && py < size) {
        const idx = (py * size + px) * 4;
        pixels[idx + 0] = fg.r;
        pixels[idx + 1] = fg.g;
        pixels[idx + 2] = fg.b;
        pixels[idx + 3] = fg.a;
      }
    }
  }

  // ── Build PNG ──────────────────────────────────────────────────────────────
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: width(4), height(4), bitDepth(1), colorType(2=RGB,6=RGBA), ...
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Scanlines: prepend filter byte 0 to each row
  const rawRows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rawRows[y * (1 + size * 4)] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (1 + size * 4) + 1 + x * 4;
      rawRows[dst + 0] = pixels[src + 0];
      rawRows[dst + 1] = pixels[src + 1];
      rawRows[dst + 2] = pixels[src + 2];
      rawRows[dst + 3] = pixels[src + 3];
    }
  }

  const compressed = zlib.deflateSync(rawRows, { level: 9 });
  const idat = compressed;

  function buildChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, "ascii");
    const crcInput = Buffer.concat([typeB, data]);
    const crcVal = crc32(crcInput);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  const pngBuf = Buffer.concat([
    signature,
    buildChunk("IHDR", ihdr),
    buildChunk("IDAT", idat),
    buildChunk("IEND", Buffer.alloc(0)),
  ]);

  return pngBuf;
}

// ── CRC-32 implementation ────────────────────────────────────────────────────

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const iconsDir = path.join(__dirname, "..", "public", "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

const icon192 = createIconPng(192);
const icon512 = createIconPng(512);

fs.writeFileSync(path.join(iconsDir, "icon-192.png"), icon192);
fs.writeFileSync(path.join(iconsDir, "icon-512.png"), icon512);

console.log("Icons generated:");
console.log(`  public/icons/icon-192.png  (${icon192.length} bytes)`);
console.log(`  public/icons/icon-512.png  (${icon512.length} bytes)`);
