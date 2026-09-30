// src/collect.mjs -- asking for a finished room, in the author own words.
//
// The author has one complete backup of his own (Yunha) and would like the rest of the group, so a
// room somebody else archived from the very beginning is worth asking about. "Complete" means the
// archive starts where the group DM history starts (April 2025) and still reaches the current month:
// a room that stops three months ago is missing exactly the part that cannot be fetched back later.
//
// The shared drive link is not written out anywhere. It is stitched together when the button is
// pressed, out of two halves kept apart plus a host spelled in pieces, so searching this repository
// for the link - or for its folder id - finds nothing. An owner can instead keep the id in a file
// outside this repository and point at it with a {name} placeholder in config.json (see SECRETS
// below). Both are hiding from a search box, not from a reader: this file is public, and anyone who
// reads it can recover the link. Keep that in mind when deciding who may write into that folder.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DM_START_MONTH, monthIndex, thisMonth } from "./pipeline.mjs";
import { rowNumbers } from "./rowinfo.mjs";

// Rooms the author already holds a complete backup of, so asking for them would be pointless. A
// comma separated list of slugs in config.json (collectOwned) replaces this; an empty string turns
// the exception off and offers every complete room.
const OWNED = "yunha";

// Two halves of the drive folder id, base64 each. They stay empty in this file; tools/publish.ps1
// fills them in the published copy from the secret file outside this repository. driveUrl() below is
// the only thing that decides whether the offer exists at all.
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

// Values for the {name} placeholders in collectUrl, kept in a small file outside this repository:
// <parent of this folder>/_secret/secrets.json, or wherever WDM_SECRETS points. The folder id is
// then in no published file and in no commit - a build can be published without ever writing it
// down. A machine without that file simply resolves nothing.
const SECRETS = process.env.WDM_SECRETS || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "_secret", "secrets.json");
let secretCache = { stamp: "", data: {} };

function secrets() {
  let stamp = "";
  try { const st = fs.statSync(SECRETS); stamp = st.mtimeMs + " " + st.size; } catch (e) { return {}; }
  if (stamp === secretCache.stamp) return secretCache.data;
  let data = {};
  try {
    const raw = JSON.parse(fs.readFileSync(SECRETS, "utf8"));
    if (raw && typeof raw === "object") data = raw;
  } catch (e) { data = {}; }
  secretCache = { stamp: stamp, data: data };
  return data;
}

// A value may be the folder id on its own or a whole sharing link; both come out as the id.
function idOnly(value) {
  const text = String(value == null ? "" : value).trim();
  const found = text.match(/\/folders\/([A-Za-z0-9_-]{8,})/);
  return found ? found[1] : text;
}

// {name} -> the matching secret. An unknown or empty placeholder makes the whole template unusable,
// so the button disappears instead of opening a broken link.
function fill(text) {
  const all = secrets();
  let missing = false;
  const out = String(text == null ? "" : text).replace(/\{([A-Za-z0-9_.-]+)\}/g, function (whole, name) {
    const value = idOnly(all[name]);
    if (!value) { missing = true; return ""; }
    return value;
  });
  return missing ? "" : out;
}

const FOLDER = "https://" + "drive" + "." + "google" + ".com/drive/folders/";

function asUrl(value) {
  const text = String(value == null ? "" : value).trim();
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  const id = idOnly(text);
  return /^[A-Za-z0-9_-]{8,}$/.test(id) ? FOLDER + id : "";
}

// The link the Share to button opens. A collectUrl in config.json wins, so it can be changed without
// touching this file, and a template there ({quant}) is filled from the secret file. Without an
// override the build's own two halves are used, and a build that shipped without them still looks
// for the placeholder in the secret file - that is how the author runs his own copy before anything
// is published.
export function driveUrl(cfg) {
  const raw = String((cfg && cfg.collectUrl) || "").trim();
  if (raw) return asUrl(fill(raw));
  const id = fill(Buffer.from(ID_A + ID_B, "base64").toString("utf8").trim() || "{quant}");
  return asUrl(id);
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
