// src/zip.mjs -- write a ZIP archive with no external program and no compression.
//
// Photos and video are already compressed, so storing them is both faster and smaller than
// deflating them again. Doing it here in JavaScript means the same code works on Windows,
// macOS and Linux, with no tar.exe, no 7-Zip and no dependency to install.
import fs from "node:fs";
import path from "node:path";
import { fmtSize } from "./size.mjs";

const TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

const crcStart = () => -1;
const crcStep = (crc, buf) => { let c = crc; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return c; };
const crcEnd = (crc) => (crc ^ -1) >>> 0;

// DOS date and time, still the only thing the ZIP format knows how to store.
function dosTime(ms) {
  const d = new Date(ms || Date.now());
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date & 0xFFFF, time: time & 0xFFFF };
}

const U32_MAX = 0xFFFFFFFF;

// entries: [{ name, abs, dir }] with forward slashes in name. Throws when the result would need
// ZIP64, which cannot happen for one room but would for a much bigger input.
export function writeZip(zipPath, entries, opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  const fd = fs.openSync(zipPath, "w");
  const central = [];
  let offset = 0;
  let bytes = 0;
  const buf = Buffer.allocUnsafe(1 << 20);
  const now = dosTime(Date.now());
  try {
    for (const e of entries) {
      const name = Buffer.from(String(e.name).replace(/\\/g, "/"), "utf8");
      let size = 0;
      let crc = 0;
      const stamp = e.dir ? now : dosTime(fs.statSync(e.abs).mtimeMs);
      if (!e.dir) {
        const inFd = fs.openSync(e.abs, "r");
        try {
          let c = crcStart();
          let read = 0;
          for (;;) {
            const n = fs.readSync(inFd, buf, 0, buf.length, null);
            if (n <= 0) break;
            c = crcStep(c, buf.subarray(0, n));
            read += n;
          }
          crc = crcEnd(c);
          size = read;
        } finally { fs.closeSync(inFd); }
      }
      if (offset + size > U32_MAX) throw new Error("zip: the archive would need ZIP64 (over 4 GB); split it per room instead");
      const head = Buffer.alloc(30);
      head.writeUInt32LE(0x04034b50, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(0x0800, 6);
      head.writeUInt16LE(0, 8);
      head.writeUInt16LE(stamp.time, 10);
      head.writeUInt16LE(stamp.date, 12);
      head.writeUInt32LE(crc, 14);
      head.writeUInt32LE(size, 18);
      head.writeUInt32LE(size, 22);
      head.writeUInt16LE(name.length, 26);
      head.writeUInt16LE(0, 28);
      fs.writeSync(fd, head);
      fs.writeSync(fd, name);
      if (!e.dir && size > 0) {
        const inFd = fs.openSync(e.abs, "r");
        try {
          let done = 0;
          while (done < size) {
            const n = fs.readSync(inFd, buf, 0, Math.min(buf.length, size - done), null);
            if (n <= 0) break;
            fs.writeSync(fd, buf, 0, n);
            done += n;
          }
        } finally { fs.closeSync(inFd); }
      }
      central.push({ name: name, crc: crc, size: size, offset: offset, stamp: stamp, dir: !!e.dir });
      offset += 30 + name.length + size;
      bytes += size;
    }
    const cdStart = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0);
      h.writeUInt16LE(20, 4);
      h.writeUInt16LE(20, 6);
      h.writeUInt16LE(0x0800, 8);
      h.writeUInt16LE(0, 10);
      h.writeUInt16LE(c.stamp.time, 12);
      h.writeUInt16LE(c.stamp.date, 14);
      h.writeUInt32LE(c.crc, 16);
      h.writeUInt32LE(c.size, 20);
      h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28);
      h.writeUInt32LE(c.dir ? 0x10 : 0, 38);
      h.writeUInt32LE(c.offset, 42);
      fs.writeSync(fd, h);
      fs.writeSync(fd, c.name);
      offset += 46 + c.name.length;
    }
    const cdSize = offset - cdStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(central.length, 8);
    end.writeUInt16LE(central.length, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(cdStart, 16);
    fs.writeSync(fd, end);
  } finally { fs.closeSync(fd); }
  const total = fs.statSync(zipPath).size;
  log("zip: " + central.length + " entries, " + fmtSize(total));
  return { path: zipPath, entries: central.length, bytes: bytes, zipBytes: total };
}

// Every file below dir, as zip entries relative to it, with directory entries included so that
// the built-in Windows extractor creates the tree without guessing.
export function collect(dir, prefix, skip) {
  const out = [];
  const seen = new Set();
  const walk = (cur, rel) => {
    let items = [];
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { return; }
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const it of items) {
      if (skip && skip(it.name, rel)) continue;
      const abs = path.join(cur, it.name);
      const name = rel ? rel + "/" + it.name : it.name;
      if (it.isDirectory()) { if (!seen.has(name)) { seen.add(name); out.push({ name: prefix + name + "/", abs: abs, dir: true }); } walk(abs, name); }
      else if (it.isFile()) out.push({ name: prefix + name, abs: abs, dir: false });
    }
  };
  walk(dir, "");
  return out;
}
