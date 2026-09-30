// src/rowinfo.mjs -- the numbers behind one row of the picker.
//
// A row shows what the room already costs on disk ("already saved") or what it is expected to cost
// ("estimated"), and the total line adds those figures up. Working them out means reading the room's
// page and stat-ing every media file that page points at. That is fine once, but the page asks for
// its state every second, so the answer is cached behind a cheap fingerprint of its own inputs: same
// chat files, same pages, same summary - same numbers.
import fs from "node:fs";
import path from "node:path";
import { dirs, estimateFor } from "./pipeline.mjs";
import { fmtSize } from "./size.mjs";

function stamp(p) {
  try { const s = fs.statSync(p); return s.size + ":" + Math.round(s.mtimeMs); } catch (e) { return "-"; }
}

// Everything estimateFor() reads, in one line: the room's three own files, both rendered pages, and
// the two summaries it takes its months from. All cheap stat calls, none of them reads a page back.
export function rowSignature(cfg, slug) {
  const d = dirs(cfg);
  return [
    slug,
    stamp(path.join(d.rooms, slug + ".html")),
    stamp(path.join(d.rooms, slug + ".md")),
    stamp(path.join(d.rooms, slug + ".jsonl")),
    stamp(path.join(d.roomsPublic, slug + ".html")),
    stamp(path.join(d.rooms, slug + ".summary.json")),
    stamp(path.join(d.rooms, "summary.json")),
  ].join("|");
}

// Which rows exist and what they are called. A room only changing its numbers can be patched into the
// page; a room that was not there when the page was built needs the page again.
export function listSignature(list) {
  return (list || []).map((r) => String(r.slug) + "|" + String(r.rowLabel || r.slug)).join(",");
}

const cache = new Map();

export function rowNumbers(cfg, room, tr) {
  const sig = rowSignature(cfg, room.slug);
  const hit = cache.get(room.slug);
  if (hit && hit.sig === sig) return hit;
  const e = estimateFor(cfg, room);
  const row = {
    sig: sig,
    text: e.measured ? tr("gui.sizeSaved", { v: fmtSize(e.saved) }) : tr("gui.sizeGuess", { v: fmtSize(e.bytes) }),
    full: e.full,
    saved: e.saved || 0,
    months: e.months || 0,
    firstMonth: e.firstMonth || null,
    lastMonth: e.lastMonth || null,
  };
  cache.set(room.slug, row);
  return row;
}
