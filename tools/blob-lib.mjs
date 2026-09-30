// tools/blob-lib.mjs -- the file operations the carrier needs: measure a tree, and write or read the
// one file that holds the drive folder id. Kept in one place so tools/make-blob.mjs and
// tools/check-blob.mjs cannot disagree with each other or with src/collect.mjs.
import fs from "node:fs";
import path from "node:path";

export const BLOB_REL = "assets/wv-blob.wvb";
export const MIN_SIZE = 1024;
export const HEAD = "wv-blob";
// The id is the only line in the file that is nothing but id characters; the rest is dots and one NUL.
export const ID_LINE = /^[A-Za-z0-9_-]{16,}$/m;

export function carrierPath(root) {
  return path.join(root, BLOB_REL.split("/").join(path.sep));
}

// The id inside a value that may be the id itself or a whole sharing link.
export function idOnly(value) {
  const text = String(value == null ? "" : value).trim();
  const found = text.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
  return found ? found[1] : text;
}

export function readId(file) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return ""; }
  const hit = text.match(ID_LINE);
  return hit ? idOnly(hit[0]) : "";
}

// How many files of each byte size a tree holds, ignoring one path (the carrier about to be replaced).
// Counts, not a set: two files of the same size must stay visible, because zoner() only looks at the
// size and would take whichever it meets first.
export function sizeCounts(root, except) {
  const counts = new Map();
  const skip = [".git", "node_modules"];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4 && skip.indexOf(entry.name) < 0) walk(full, depth + 1);
        continue;
      }
      if (except && path.resolve(full) === path.resolve(except)) continue;
      let size = -1;
      try { size = fs.statSync(full).size; } catch (e) { continue; }
      counts.set(size, (counts.get(size) || 0) + 1);
    }
  };
  walk(path.resolve(root), 0);
  return counts;
}

// Write the carrier: header line, the id alone on its line, dots up to the size, one NUL at the end.
// The NUL is what makes git and GitHub treat the file as binary, and -text in .gitattributes keeps its
// bytes (and so its size) untouched on every platform. The size starts at MIN_SIZE and moves up until
// no other file in the tree has it, so zoner() cannot pick the wrong file.
export function writeCarrier(root, id, minSize) {
  const file = carrierPath(root);
  const head = Buffer.from(HEAD + "\n" + id + "\n", "utf8");
  const counts = sizeCounts(root, file);
  let size = Math.max(minSize || MIN_SIZE, MIN_SIZE);
  while ((counts.has(size) || size < head.length + 8) && size < 65536) size++;
  const body = Buffer.concat([head, Buffer.alloc(size - head.length - 1, 0x2e), Buffer.from([0])]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return { file: file, size: body.length };
}

export function mask(id) {
  const text = String(id || "");
  return text.length > 10 ? text.slice(0, 4) + "..." + text.slice(-4) : (text ? "..." : "(empty)");
}
