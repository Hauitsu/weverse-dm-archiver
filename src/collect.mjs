// src/collect.mjs -- asking for a finished room, in the author own words.
//
// The author has one complete backup of his own (Yunha) and would like the rest of the group, so a
// room somebody else archived from the very beginning is worth asking about. "Complete" means the
// archive starts where the group DM history starts (April 2025) and still reaches the current month:
// a room that stops three months ago is missing exactly the part that cannot be fetched back later.
//
// The shared drive link is not written out anywhere. It is stitched together when the button is
// pressed, out of two halves kept apart plus a host spelled in pieces, so searching this repository
// for the link - or for its folder id - finds nothing. That is hiding from a search box, not from a
// reader: this file is public, and anyone who reads it can recover the link. Keep that in mind when
// deciding who may write into that folder.
import { DM_START_MONTH, monthIndex, thisMonth } from "./pipeline.mjs";
import { rowNumbers } from "./rowinfo.mjs";

// Rooms the author already holds a complete backup of, so asking for them would be pointless. A
// comma separated list of slugs in config.json (collectOwned) replaces this; an empty string turns
// the exception off and offers every complete room.
const OWNED = "yunha";

// Two halves of the drive folder id, base64 each. Empty in a build that ships no link, which is why
// driveUrl() below is the only thing that decides whether the offer exists at all.
const ID_A = "";
const ID_B = "";

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

// A collectUrl in config.json wins, so the link can be changed without touching this file.
export function driveUrl(cfg) {
  const override = String((cfg && cfg.collectUrl) || "").trim();
  if (override) return override;
  const id = Buffer.from(ID_A + ID_B, "base64").toString("utf8").trim();
  if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) return "";
  return "https://" + "drive" + "." + "google" + ".com/drive/folders/" + id;
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
