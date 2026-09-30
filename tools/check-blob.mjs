// tools/check-blob.mjs -- say whether the carrier in a tree is one src/collect.mjs can read.
//
// It imports the collect.mjs of the tree it is pointed at, so it walks exactly the way the running app
// walks - same depth limit, same skipped folders, same size comparison - and then reports what the
// Share to button would open. tools/publish.ps1 runs it against the stage folder before the scan.
//
// Usage:
//   node tools/check-blob.mjs                      # this folder
//   node tools/check-blob.mjs --root <dir>         # another tree
//   node tools/check-blob.mjs --root <dir> --fix   # move the size if another file already uses it
//   node tools/check-blob.mjs --show               # print the id as it is, not masked
// Exit code 0 only when the carrier is there, found by size, and yields a link.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BLOB_REL, carrierPath, mask, readId, sizeCounts, writeCarrier } from "./blob-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const take = (name) => { const i = argv.indexOf(name); if (i >= 0 && argv[i + 1]) return argv[i + 1]; return ""; };
const ROOT = path.resolve(take("--root") || path.resolve(HERE, ".."));
const FIX = argv.indexOf("--fix") >= 0;
const SHOW = argv.indexOf("--show") >= 0;

function say(text) { console.log("blob   : " + text); }

function patchSize(size) {
  const target = path.join(ROOT, "src", "collect.mjs");
  const text = fs.readFileSync(target, "utf8");
  const after = text.replace(/const BLOB_SIZE = \d+;/, "const BLOB_SIZE = " + size + ";");
  if (after !== text) fs.writeFileSync(target, after, "utf8");
  return after !== text;
}

const collect = await import(pathToFileURL(path.join(ROOT, "src", "collect.mjs")).href);
const declared = collect.BLOB_SIZE;
const file = carrierPath(ROOT);

if (declared === 0) {
  say("BLOB_SIZE is 0, this tree ships no carrier" + (fs.existsSync(file) ? " (but " + BLOB_REL + " is sitting there)" : ""));
  process.exit(0);
}
if (!fs.existsSync(file)) {
  say("BLOB_SIZE is " + declared + " but there is no " + BLOB_REL + " in " + ROOT);
  process.exit(0);
}
let size = declared;
let moved = false;
let counts = sizeCounts(ROOT, file);
const real = fs.statSync(file).size;
if (real !== declared || counts.has(declared)) {
  if (!FIX) {
    say(BLOB_REL + " is " + real + " bytes, BLOB_SIZE says " + declared + (real === declared ? ", and another file uses that size too" : ""));
    process.exit(1);
  }
  const id = readId(file);
  if (!id) { say("cannot read an id out of " + BLOB_REL); process.exit(1); }
  const made = writeCarrier(ROOT, id, Math.max(real, declared));
  patchSize(made.size);
  size = made.size;
  moved = true;
  counts = sizeCounts(ROOT, file);
}
if (!collect.zoner(size, ROOT)) {
  say(BLOB_REL + " is " + size + " bytes but zoner() does not find it - is it inside a skipped folder?");
  process.exit(1);
}
const id = readId(file);
const link = collect.driveUrl({});
const clash = counts.has(size);
say(BLOB_REL + ", " + size + " bytes, id " + (SHOW ? id : mask(id)) + (moved ? ", size moved to stay unique" : "") + (clash ? ", WARNING another file shares this size" : ""));
const shown = SHOW || !id ? link : link.split(id).join(mask(id));   // keep the id out of publish logs
say(link ? "the button would open " + shown : "no link: driveUrl() answers empty");
process.exit(link && !clash ? 0 : 1);
