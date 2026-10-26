import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.resolve(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. Create crisp SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c121e"/>
      <stop offset="100%" stop-color="#05080f"/>
    </linearGradient>
    <linearGradient id="primary" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00ffcc"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <radialGradient id="radar" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(0, 255, 204, 0.25)"/>
      <stop offset="70%" stop-color="rgba(0, 255, 204, 0.05)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>

  <!-- Background Shield / Squircle -->
  <rect width="512" height="512" rx="108" fill="url(#bg)"/>
  <rect width="504" height="504" x="4" y="4" rx="104" fill="none" stroke="url(#primary)" stroke-width="6" stroke-opacity="0.5"/>

  <!-- Radar Grid Rings -->
  <circle cx="256" cy="256" r="180" fill="none" stroke="#1f2c42" stroke-width="2" stroke-dasharray="8 8"/>
  <circle cx="256" cy="256" r="120" fill="url(#radar)" stroke="#2b3d5c" stroke-width="3"/>
  <circle cx="256" cy="256" r="60" fill="none" stroke="#3b82f6" stroke-width="2"/>

  <!-- Crosshairs -->
  <line x1="256" y1="56" x2="256" y2="456" stroke="#25354e" stroke-width="2"/>
  <line x1="56" y1="256" x2="456" y2="256" stroke="#25354e" stroke-width="2"/>

  <!-- Tactical Chevron / Hawk Symbol -->
  <polygon points="256,96 140,320 256,270 372,320" fill="url(#primary)" filter="drop-shadow(0 0 12px rgba(0,255,204,0.6))"/>

  <!-- Center Core Beacon -->
  <circle cx="256" cy="256" r="10" fill="#00ffcc"/>
  <circle cx="256" cy="256" r="18" fill="none" stroke="#00ffcc" stroke-width="2"/>

  <!-- Tactical HUD Marks -->
  <polyline points="96,136 96,96 136,96" fill="none" stroke="#00ffcc" stroke-width="4"/>
  <polyline points="416,136 416,96 376,96" fill="none" stroke="#00ffcc" stroke-width="4"/>
  <polyline points="96,376 96,416 136,416" fill="none" stroke="#00ffcc" stroke-width="4"/>
  <polyline points="416,376 416,416 376,416" fill="none" stroke="#00ffcc" stroke-width="4"/>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');

// Helper to create pure uncompressed/deflated RGBA PNG
function createPng(width, height) {
  // Simple CRC32 implementation
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // Create raster pixels (theme: dark tactical navy background with cyan & blue chevron)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc((1 + rowBytes) * height);
  const cx = width / 2;
  const cy = height / 2;
  const rMax = width * 0.45;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowBytes);
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default dark tactical background
      let r = 11, g = 16, b = 27, a = 255;

      // Outer border / glow
      if (dist < 0.95 && dist > 0.88) {
        r = 0; g = 255; b = 204;
      } else if (dist < 0.7 && dist > 0.67) {
        r = 59; g = 130; b = 246;
      } else if (dist < 0.4 && dist > 0.37) {
        r = 0; g = 255; b = 204;
      }

      // Center chevron representation
      const normY = (y - height * 0.2) / (height * 0.5);
      const halfWidth = normY * width * 0.35;
      if (normY >= 0 && normY <= 1 && Math.abs(x - cx) <= halfWidth) {
        const innerCutout = (normY - 0.25) * width * 0.35;
        if (normY < 0.25 || Math.abs(x - cx) >= innerCutout) {
          r = 0; g = 255; b = 204;
        }
      }

      // Center point
      if (dist < 0.06) {
        r = 255; g = 255; b = 255;
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG structure
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = Buffer.alloc(4 + 4 + 13 + 4);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.write('IHDR', 4);
  ihdrData.copy(ihdrChunk, 8);
  const ihdrCrc = crc32(ihdrChunk.subarray(4, 21));
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // IDAT
  const idatChunk = Buffer.alloc(4 + 4 + compressed.length + 4);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatChunk.write('IDAT', 4);
  compressed.copy(idatChunk, 8);
  const idatCrc = crc32(idatChunk.subarray(4, 8 + compressed.length));
  idatChunk.writeUInt32BE(idatCrc, 8 + compressed.length);

  // IEND
  const iendChunk = Buffer.alloc(4 + 4 + 0 + 4);
  iendChunk.writeUInt32BE(0, 0);
  iendChunk.write('IEND', 4);
  const iendCrc = crc32(Buffer.from('IEND'));
  iendChunk.writeUInt32BE(iendCrc, 8);

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Write PNG files
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPng(192, 192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPng(512, 512));
fs.writeFileSync(path.join(iconsDir, 'icon-maskable.png'), createPng(512, 512));

console.log('Icons generated successfully in public/icons/');
