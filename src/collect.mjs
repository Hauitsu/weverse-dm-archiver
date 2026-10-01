// src/collect.mjs -- asking for a finished room, in the author own words.
//
// The author has one complete backup of his own (Yunha) and would like the rest of the group, so a
// room somebody else archived from the very beginning is worth asking about. "Complete" means the
// archive starts where the group DM history starts (April 2025) and still reaches the current month:
// a room that stops three months ago is missing exactly the part that cannot be fetched back later.
//
// The shared drive link is nowhere to be read. This file holds a number, not a name: zoner() takes a
// byte size, walks the tree for the file of exactly that size, pulls the folder id out of it and hands
// it back - and its return value is what quant holds here. No name, no extension and no path in this
// file leads to the carrier. The host is spelled in pieces. All of it is hiding from a search box, not
// from a reader: this file is public, and anyone who works through the code reaches the link. Keep that
// in mind when deciding who may write into that folder.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DM_START_MONTH, monthIndex, thisMonth } from "./pipeline.mjs";
import { rowNumbers } from "./rowinfo.mjs";

// Rooms never worth asking about, because the author already holds them. Empty by default: holding
// any room in full is what makes someone eligible, and the room they happen to hold is their own
// business. A comma separated list of slugs in config.json (collectOwned) still excludes some.
const OWNED = "";

// The byte size zoner() looks for. tools/make-blob.mjs writes the carrier file and this number
// together, and tools/publish.ps1 checks the two against each other before publishing, so they cannot
// drift apart. 0 means this copy carries no carrier at all. The walk-through for making one is the
// author own notes, kept outside this repository.
export const BLOB_SIZE = 1024;
const BLOB_DEPTH = 3;
const BLOB_SKIP = [".git", "node_modules", "media", "rooms", "rooms-public", "downloads", "dist", "share", "verify", "profile", "export", "recon"];

export function memberName(room, lang) {
  const ko = String((room && room.nameKo) || "");
  const en = String((room && room.nameEn) || "");
  const slug = String((room && room.slug) || "");
  if (String(lang || "").toLowerCase() === "ko") return ko || en || slug;
  if (!en) return ko || slug;
  return ko && ko !== en ? en + " (" + ko + ")" : en;
}

export function ownedSlugs(cfg) {
  const raw = String((cfg && cfg.collectOwned != null ? cfg.collectOwned : OWNED) || "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// A value may be the folder id on its own or a whole sharing link; both come out as the id.
function idOnly(value) {
  const text = String(value == null ? "" : value).trim();
  const found = text.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
  return found ? found[1] : text;
}

// zoner: hand it a size and it walks the tree this file lives in for the one file of exactly that
// size, then pulls the folder id out of it. Depth limited, media/ and the other work folders skipped,
// so the carrier can sit anywhere without being named here. Nothing found: an empty string.
export function zoner(size, where) {
  if (!(size > 0)) return "";
  const base = where ? path.resolve(where) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const queue = [{ dir: base, depth: 0 }];
  while (queue.length) {
    const here = queue.shift();
    let entries = [];
    try { entries = fs.readdirSync(here.dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const entry of entries) {
      const full = path.join(here.dir, entry.name);
      if (entry.isDirectory()) {
        if (here.depth < BLOB_DEPTH && entry.name.charAt(0) !== "." && BLOB_SKIP.indexOf(entry.name) < 0) queue.push({ dir: full, depth: here.depth + 1 });
        continue;
      }
      let stat = null;
      try { stat = fs.statSync(full); } catch (e) { continue; }
      if (stat.size !== size) continue;
      let text = "";
      try { text = fs.readFileSync(full, "utf8"); } catch (e) { continue; }
      const hit = text.match(/^[A-Za-z0-9_-]{16,}$/m);
      if (hit) return idOnly(hit[0]);
    }
  }
  return "";
}

// The id this build carries: what zoner() found at the size above, kept for the life of the process.
const quant = zoner(BLOB_SIZE);

// {name} -> the id zoner() found. A copy without a carrier leaves the placeholder empty, which makes
// the template unusable on purpose: the button disappears instead of opening a broken link.
function fill(text) {
  if (!quant) return "";
  return String(text == null ? "" : text).replace(/\{[A-Za-z0-9_.-]+\}/g, quant);
}
const FOLDER = "https://" + "drive" + "." + "google" + ".com/drive/folders/";

function asUrl(value) {
  const text = String(value == null ? "" : value).trim();
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  const id = idOnly(text);
  return /^[A-Za-z0-9_-]{8,}$/.test(id) ? FOLDER + id : "";
}

// The link the Share to button opens. A collectUrl in config.json wins, so it can be changed without
// touching this file, and a placeholder in it is filled from the carrier. Without an override the id
// is quant - what zoner() pulled out of the carrier this build ships with.
export function driveUrl(cfg) {
  const raw = String((cfg && cfg.collectUrl) || "").trim();
  if (raw) return asUrl(fill(raw));
  return asUrl(quant);
}

export function collectReady(cfg) { return !!driveUrl(cfg); }

// Complete: starts at the floor of the window and ends in this month or, for a backup taken days
// before the month turned over, the one before it.
export function isComplete(est) {
  if (!est || !est.firstMonth) return false;
  const last = est.lastMonth || est.firstMonth;
  return monthIndex(est.firstMonth) <= monthIndex(DM_START_MONTH) && monthIndex(last) >= monthIndex(thisMonth()) - 1;
}

export function canOffer(cfg, est, slug) {
  // collectDebug is the owner switch for looking at the popup: every room offers the button, complete
  // archive or not, own room or not. It is never on unless config.json asks for it.
  if (cfg && cfg.collectDebug) return true;
  return collectReady(cfg) && isComplete(est) && ownedSlugs(cfg).indexOf(String(slug)) < 0;
}

// Every room worth asking for, in the order the picker shows them.
export function eligibleRooms(cfg, list, tr) {
  return (list || []).filter((r) => canOffer(cfg, rowNumbers(cfg, r, tr), r.slug));
}
