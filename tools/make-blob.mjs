// tools/make-blob.mjs -- write the data file that carries the shared drive folder id.
//
// A published build has to be able to reach the folder, but nothing in the tree may name the file
// that holds the id: src/collect.mjs keeps its byte size (BLOB_SIZE) and finds it by that size alone.
// This script writes the file and the number together, so they cannot drift apart.
//
// The id is read from the private file outside this folder, <parent>/_secret/secrets.json, key "drive"
// (or "quant"). Without that file, or with an empty value, the carrier is removed from the target tree
// and BLOB_SIZE is set to 0: a build with no link ships no carrier either.
//
// Usage:
//   node tools/make-blob.mjs                 # this folder
//   node tools/make-blob.mjs --root <dir>    # another tree, e.g. the publish stage
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");
const BLOB_REL = "assets/wv-blob.wvb";
const MIN_SIZE = 1024;

const argv = process.argv.slice(2);
const rootAt = argv.indexOf("--root");
const ROOT = rootAt >= 0 && argv[rootAt + 1] ? path.resolve(argv[rootAt + 1]) : DEFAULT_ROOT;
const SECRETS = process.env.WDM_SECRETS || path.resolve(DEFAULT_ROOT, "..", "_secret", "secrets.json");
const BLOB = path.join(ROOT, BLOB_REL.split("/").join(path.sep));

function secretId() {
  let data = null;
  try { data = JSON.parse(fs.readFileSync(SECRETS, "utf8")); } catch (e) { return ""; }
  if (!data || typeof data !== "object") return "";
  const raw = String(data.drive || data.quant || "").trim();
  const found = raw.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
  return found ? found[1] : raw;
}

// Every byte size already used in the tree, so the carrier can pick one that is not ambiguous.
function usedSizes(dir, into, depth) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return into; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (path.resolve(full) === path.resolve(BLOB)) continue;
    if (entry.isDirectory()) {
      if (entry.name !== ".git" && depth < 4) usedSizes(full, into, depth + 1);
      continue;
    }
    try { into.add(fs.statSync(full).size); } catch (e) { }
  }
  return into;
}

function patchSize(size) {
  const target = path.join(ROOT, "src", "collect.mjs");
  let text = "";
  try { text = fs.readFileSync(target, "utf8"); } catch (e) { return false; }
  const after = text.replace(/const BLOB_SIZE = \d+;/, "const BLOB_SIZE = " + size + ";");
  if (after === text) return false;
  fs.writeFileSync(target, after, "utf8");
  return true;
}

const id = secretId();
if (id.length < 8) {
  try { fs.rmSync(BLOB, { force: true }); } catch (e) { }
  const patched = patchSize(0);
  console.log("make-blob: no id in " + SECRETS + " - no carrier at " + BLOB_REL + (patched ? ", BLOB_SIZE is 0" : " (BLOB_SIZE already 0)"));
} else {
  const head = Buffer.from("wv-blob\n" + id + "\n", "utf8");
  const taken = usedSizes(ROOT, new Set(), 0);
  let size = MIN_SIZE;
  while ((taken.has(size) || size < head.length + 8) && size < 65536) size++;
  const body = Buffer.concat([head, Buffer.alloc(size - head.length - 1, 0x2e), Buffer.from([0])]);
  fs.mkdirSync(path.dirname(BLOB), { recursive: true });
  fs.writeFileSync(BLOB, body);
  const patched = patchSize(body.length);
  console.log("make-blob: " + BLOB_REL + " is " + body.length + " bytes in " + ROOT + (patched ? ", BLOB_SIZE written" : ", BLOB_SIZE already " + body.length));
}
