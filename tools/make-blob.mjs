// tools/make-blob.mjs -- write the carrier file that holds the shared drive folder id.
//
// src/collect.mjs does not name that file anywhere: it keeps its byte size (BLOB_SIZE) and finds it by
// that size alone. This script writes the file and the number together, so the two cannot drift apart.
// The author keeps a walk-through for doing it by hand in his own notes, outside this repository.
//
// Usage:
//   node tools/make-blob.mjs --id <folder id or sharing link>
//   node tools/make-blob.mjs --id-file <path with the id in it>
//   node tools/make-blob.mjs                  # asks for the id on the terminal (nothing in history)
//   node tools/make-blob.mjs --root <dir>     # another tree, e.g. the publish stage
//   node tools/make-blob.mjs --show           # print the id as it is, not masked
//   node tools/make-blob.mjs --remove         # drop the carrier and set BLOB_SIZE back to 0
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { BLOB_REL, MIN_SIZE, carrierPath, idOnly, mask, writeCarrier } from "./blob-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const take = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : ""; };
const ROOT = path.resolve(take("--root") || path.resolve(HERE, ".."));
const SHOW = argv.indexOf("--show") >= 0;

function patchSize(size) {
  const target = path.join(ROOT, "src", "collect.mjs");
  let text = "";
  try { text = fs.readFileSync(target, "utf8"); } catch (e) { return false; }
  const after = text.replace(/const BLOB_SIZE = \d+;/, "const BLOB_SIZE = " + size + ";");
  if (after === text) return false;
  fs.writeFileSync(target, after, "utf8");
  return true;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((done) => rl.question(question, (answer) => { rl.close(); done(answer); }));
}

const file = carrierPath(ROOT);
if (argv.indexOf("--remove") >= 0) {
  try { fs.rmSync(file, { force: true }); } catch (e) { }
  const patched = patchSize(0);
  console.log("make-blob: carrier removed from " + ROOT + (patched ? ", BLOB_SIZE is 0" : ", BLOB_SIZE already 0"));
} else {
  let raw = take("--id");
  const fromFile = take("--id-file");
  if (!raw && fromFile) { try { raw = fs.readFileSync(fromFile, "utf8").trim(); } catch (e) { raw = ""; } }
  if (!raw && process.stdin.isTTY) raw = (await ask("folder id or sharing link: ")).trim();
  const id = idOnly(raw);
  if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) {
    console.error("make-blob: no usable id (pass --id, --id-file, or type it when asked)");
    process.exit(1);
  }
  const made = writeCarrier(ROOT, id, MIN_SIZE);
  const patched = patchSize(made.size);
  console.log("make-blob: " + BLOB_REL + " is " + made.size + " bytes in " + ROOT + ", id " + (SHOW ? id : mask(id)) + (patched ? ", BLOB_SIZE written" : ", BLOB_SIZE already " + made.size));
  console.log("make-blob: check it with  node tools/check-blob.mjs" + (ROOT === path.resolve(HERE, "..") ? "" : " --root " + ROOT));
}
