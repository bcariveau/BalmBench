import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      let r = 0xf3;
      let g = 0xea;
      let b = 0xdc;
      const dx = nx - 0.5;
      const dy = ny - 0.52;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.38) {
        r = 0x3f;
        g = 0x6b;
        b = 0x4e;
      }
      if (nx > 0.3 && nx < 0.7 && ny > 0.46 && ny < 0.74) {
        r = 0xf7;
        g = 0xf1;
        b = 0xe4;
      }
      if (nx > 0.26 && nx < 0.74 && ny > 0.4 && ny < 0.5) {
        r = 0xc4;
        g = 0x6b;
        b = 0x4a;
      }
      const lx = nx - 0.64;
      const ly = ny - 0.32;
      if (lx * lx * 1.7 + ly * ly < 0.012) {
        r = 0xe7;
        g = 0xef;
        b = 0xdf;
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const dir = path.resolve("public/icons");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "icon-192.png"), png(192));
fs.writeFileSync(path.join(dir, "icon-512.png"), png(512));
console.log("wrote icons");
