#!/usr/bin/env node
// Pack a build folder into a .zip for upload (Yandex Games and YouTube Playables both take an archive with
// index.html at its root). No dependencies: a minimal zip writer on node:zlib.
//
//   node tools/zip.mjs dist-yandex      -> dist-yandex.zip

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync } from "node:zlib";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools/zip.mjs <folder>");
  process.exit(1);
}
const files = [];
(function walk(d) {
  for (const f of readdirSync(d).sort()) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const local = [], central = [];
let offset = 0;
for (const f of files) {
  const name = Buffer.from(relative(dir, f).split(sep).join("/"));
  const raw = readFileSync(f), crc = crc32(raw);
  // PNGs are already compressed: store them; deflate the rest
  const store = f.endsWith(".png");
  const data = store ? raw : deflateRawSync(raw, { level: 9 });
  const method = store ? 0 : 8;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8);
  h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18);
  h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  local.push(h, name, data);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10);
  c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + data.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, cd, end]);
writeFileSync(`${dir}.zip`, zip);
console.log(`${dir}.zip: ${files.length} files, ${(zip.length / 1024).toFixed(0)} KiB`);
