// src/rooms.mjs -- read, validate and edit the room registry (rooms.unis.json).
//
// The registry is the one file a user may hand-edit. It maps a friendly slug (used for
// output file names) to a Weverse DM room id; everything else is derived at harvest time.
//
// Shape:
//   { group, label, tz, _note,
//     rooms: [ { slug, nameKo, nameEn, roomId, rowLabel?, roomName?, tz? } ] }
//
// roomId is the only field the tool truly needs. rowLabel is what the row said when the
// id was captured, kept for convenience; roomName is filled in automatically on the first
// harvest. tz at room level wins over the group tz, and "auto" means the machine zone.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_FILE = path.join(ROOT, "rooms.unis.json");

// A DM room id is always WR followed by five characters of [A-Z0-9].
export const ROOM_ID = /^WR[A-Z0-9]{5}$/;
// The slug becomes a file name, so keep it boring.
export const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function tzOk(z) {
  const s = String(z == null ? "" : z).trim();
  if (!s || /^auto$/i.test(s)) return true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: s }); return true; } catch (e) { return false; }
}

export function parseRooms(text) {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("rooms file: the top level must be an object");
  if (!Array.isArray(obj.rooms)) throw new Error("rooms file: missing the rooms array");
  return obj;
}

export function loadRooms(file) {
  return parseRooms(fs.readFileSync(file || DEFAULT_FILE, "utf8"));
}

// Two-space indent plus a trailing newline: the shape git diff likes.
export function serializeRooms(obj) { return JSON.stringify(obj, null, 2) + "\n"; }

export function saveRooms(file, obj) {
  const problems = validate(obj);
  if (problems.length) throw new Error("rooms file not saved:\n  " + problems.join("\n  "));
  fs.writeFileSync(file || DEFAULT_FILE, serializeRooms(obj), "utf8");
}

// Every problem that would make a harvest do the wrong thing. An empty array means good.
export function validate(obj) {
  const bad = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return ["the top level must be an object"];
  if (!Array.isArray(obj.rooms)) return ["missing the rooms array"];
  if (!obj.rooms.length) bad.push("rooms is empty: there is nothing to harvest");
  if (!tzOk(obj.tz)) bad.push("group tz \"" + obj.tz + "\" is not a known IANA zone (try Asia/Jakarta)");
  const slugs = new Set(), ids = new Set();
  obj.rooms.forEach((r, i) => {
    const at = "rooms[" + i + "]" + (r && r.slug ? " (" + r.slug + ")" : "");
    if (!r || typeof r !== "object" || Array.isArray(r)) { bad.push(at + ": must be an object"); return; }
    if (!SLUG.test(String(r.slug || ""))) bad.push(at + ": slug must be lowercase letters, digits and dashes (got " + JSON.stringify(r.slug) + ")");
    else if (slugs.has(r.slug)) bad.push(at + ": duplicate slug \"" + r.slug + "\"");
    else slugs.add(r.slug);
    if (!ROOM_ID.test(String(r.roomId || ""))) bad.push(at + ": roomId must look like WR2A3B4 (got " + JSON.stringify(r.roomId) + ")");
    else if (ids.has(r.roomId)) bad.push(at + ": duplicate roomId \"" + r.roomId + "\"");
    else ids.add(r.roomId);
    if (r.roomId && ROOM_ID.test(String(r.roomId)) && r.roomId !== String(r.roomId).toUpperCase()) bad.push(at + ": roomId must be uppercase");
    if (!String(r.nameEn || "").trim() && !String(r.nameKo || "").trim()) bad.push(at + ": needs a nameEn or a nameKo so the GUI has something to show");
    if (r.tz != null && !tzOk(r.tz)) bad.push(at + ": tz \"" + r.tz + "\" is not a known IANA zone");
  });
  return bad;
}

export function findRoom(obj, key) {
  const k = String(key == null ? "" : key).toLowerCase();
  return obj.rooms.find((r) => String(r.slug).toLowerCase() === k || r.roomId === key) || null;
}

export const slugify = (s) => String(s == null ? "" : s).toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

// The time zone actually used for one room: room tz > group tz > "auto".
export function resolveTz(obj, room) {
  const z = (room && room.tz) || obj.tz || "auto";
  return String(z).trim() || "auto";
}

// Add one room. Rejects a bad room and a duplicate slug/roomId before touching the file.
export function addRoom(obj, room) {
  const next = JSON.parse(JSON.stringify(obj));
  next.rooms.push(room);
  const problems = validate(next);
  if (problems.length) throw new Error("room not added:\n  " + problems.join("\n  "));
  return next;
}

export function removeRoom(obj, key) {
  const gone = findRoom(obj, key);
  if (!gone) return null;
  const next = JSON.parse(JSON.stringify(obj));
  next.rooms = next.rooms.filter((r) => r !== gone && (r.slug !== gone.slug || r.roomId !== gone.roomId));
  return { obj: next, removed: gone };
}

// Hand the GUI the minimum it needs, in file order.
export function listRooms(obj) {
  return obj.rooms.map((r) => ({
    slug: r.slug, roomId: r.roomId, nameEn: r.nameEn || null, nameKo: r.nameKo || null,
    title: r.nameEn || r.nameKo || r.slug, subtitle: r.nameKo || null,
    rowLabel: r.rowLabel || null, roomName: r.roomName || null, tz: resolveTz(obj, r),
  }));
}

// node src/rooms.mjs --check : report whether the registry on disk is usable.
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/rooms.mjs");
if (isMain && process.argv.includes("--check")) {
  try {
    const obj = loadRooms();
    const problems = validate(obj);
    console.log("file   : " + DEFAULT_FILE);
    console.log("group  : " + (obj.group || "(none)") + " / " + (obj.label || "(none)") + " / tz " + (obj.tz || "auto"));
    console.log("rooms  : " + obj.rooms.length + " (" + obj.rooms.map((r) => r.slug + "=" + r.roomId).join(", ") + ")");
    for (const p of problems) console.log("problem: " + p);
    console.log(problems.length ? "FAIL: " + problems.length + " problem(s)" : "OK: registry is usable");
    process.exit(problems.length ? 1 : 0);
  } catch (e) {
    console.log("FAIL: " + e.message);
    process.exit(1);
  }
}
