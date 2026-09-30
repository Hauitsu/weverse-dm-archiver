// src/pipeline.mjs -- the order of operations, shared by the window and the command line.
//
//   harvest  signed GETs, one page at a time, appended to downloads/<slug>/
//   render   turns those pages into two exports: rooms/<slug>.* (private, both sides) and
//            rooms/public/<slug>.* (artist messages only, nickname hidden, safe to send)
//   media    downloads the photos and video the private export points at
//   render   again, so both pages link to the files that are actually on disk
//   bundle   optional: one zip per room, built from the public export
//
// Each room keeps its own folder under downloads/. The renderer merges every part file it finds,
// so keeping rooms apart is what stops one room history from leaking into another.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { harvest, readArchive } from "./harvest.mjs";
import { downloadMedia } from "./media.mjs";
import { bundle } from "./bundle.mjs";
import { findBrowser, launch, profileDir } from "./browser.mjs";
import { waitPage, attach, ensureAuth } from "./cdp.mjs";
import { loadRooms } from "./rooms.mjs";

const NL = String.fromCharCode(10);
export const REPO = path.resolve(import.meta.dirname, "..");
export const SRC = path.join(REPO, "src");

export function dirs(cfg) {
  const c = cfg || loadConfig();
  return {
    rooms: path.resolve(REPO, c.output || "rooms"),
    media: path.join(REPO, "media"),
    downloads: path.join(REPO, "downloads"),
    dist: path.join(REPO, "dist"),
  };
}

export const srcFor = (slug) => path.join(REPO, "downloads", slug);

// The public export is the one that leaves the house, so it never shows the fan nickname: that name
// is already in the archive - every message the fan sent carries it - so nothing has to be typed or
// configured, and a nickname that changed over time hides every version of it. The private export is
// left alone and keeps the harvested name. publicRename stays available for extra find=replace pairs.
export const PUBLIC_ALIAS = "EverAfter";

export function publicRenameFor(cfg, slug) {
  const c = cfg || {};
  const alias = PUBLIC_ALIAS;
  const extra = String(c.publicRename || "").split("|").map((s) => s.trim()).filter((s) => s.indexOf("=") > 0);
  const pairs = extra.slice();
  const done = new Set(extra.map((p) => p.slice(0, p.indexOf("=")).trim()));
  let nicks = [];
  try { nicks = [...readArchive(srcFor(slug)).nicks]; } catch (e) { nicks = []; }
  for (const n of nicks) {
    const old = String(n).trim();
    if (!old || old === alias || done.has(old)) continue;
    done.add(old);
    pairs.push(old + "=" + alias);
  }
  return pairs.join("|");
}
export const tagFor = (slug) => "weverse-dm-" + slug;

// A zone the user pinned (the page, or config.json) beats the zone in the rooms file. "auto" means
// "let the room decide, and fall back to the machine zone".
export function tzFor(cfg, room) {
  const pinned = cfg && cfg.tz ? String(cfg.tz) : "auto";
  if (pinned && pinned !== "auto") return pinned;
  return (room && room.tz) || "auto";
}

// render.mjs writes one summary.json describing whatever it just rendered, so the pipeline keeps a
// copy per room: rendering the next room would otherwise overwrite the description of this one, and
// the share zip packs that description.
export function keepSummary(slug, outDir) {
  try { fs.copyFileSync(path.join(outDir, "summary.json"), path.join(outDir, slug + ".summary.json")); return true; } catch (e) { return false; }
}

// The DM history of this group begins in April 2025, so "the whole conversation" has a known window.
export const DM_START_MONTH = "2025-04";
export const GIB = 1073741824;
const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
const monthsBetween = (a, b) => monthIndex(b) - monthIndex(a) + 1;
const thisMonth = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

// What one room has really used: its three chat files plus every media file its own page points at.
// The shared emoji font is left out on purpose - it is about 2 MB and belongs to no single room.
function savedBytes(cfg, slug) {
  const d = dirs(cfg);
  let total = 0;
  for (const f of [slug + ".html", slug + ".md", slug + ".jsonl"]) {
    try { total += fs.statSync(path.join(d.rooms, f)).size; } catch (e) {}
  }
  if (!total) return null;
  const seen = new Set();
  for (const dir of [d.rooms, path.join(d.rooms, "public")]) {
    let html = "";
    try { html = fs.readFileSync(path.join(dir, slug + ".html"), "utf8"); } catch (e) { continue; }
    for (const hit of html.match(/\.\.\/media\/[^"'\s)\\<>]+/g) || []) {
      if (seen.has(hit)) continue;
      seen.add(hit);
      try { total += fs.statSync(path.join(d.media, hit.slice("../media/".length))).size; } catch (e) {}
    }
  }
  return total;
}

// How much disk a room takes, for the picker: what is on disk right now (`saved`) and what the whole
// conversation is expected to cost (`full`). A saved room projects the average size of the months it
// already covers onto the months still missing, so a half-finished walk shows what finishing costs;
// a room with nothing on disk falls back to the reference room measured at cfg.estimateGb.
export function estimateFor(cfg, room) {
  const c = cfg || loadConfig();
  const guess = Math.round(Number(c.estimateGb || 2.5) * GIB);
  let months = null;
  let firstMonth = null;
  // rooms/summary.json belongs to whichever room was rendered last, so it only counts when it really
  // describes this room; the per-room copy is the reliable one.
  for (const n of [room.slug + ".summary.json", "summary.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dirs(c).rooms, n), "utf8"));
      const from = String(j.sumber || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop();
      const ids = Array.isArray(j.roomIds) ? j.roomIds : [j.roomIds];
      if (n === "summary.json" && from !== room.slug && ids.indexOf(room.roomId) < 0) continue;
      if (Array.isArray(j.perBulan) && j.perBulan.length) { months = j.perBulan.length; firstMonth = String((j.perBulan[0] || {}).bulan || "") || null; }
      else if (Number(j.bulan) > 0) months = Number(j.bulan);
      break;
    } catch (e) {}
  }
  const saved = savedBytes(c, room.slug);
  if (!saved) {
    const archived = readArchive(srcFor(room.slug));
    return { known: false, measured: false, saved: null, months: months, full: guess, bytes: guess, messages: archived.seen.size || null };
  }
  // April 2025 is the floor of the window; a room whose history starts later projects from there.
  const start = firstMonth && monthIndex(firstMonth) > monthIndex(DM_START_MONTH) ? firstMonth : DM_START_MONTH;
  const totalMonths = Math.max(monthsBetween(start, thisMonth()), months || 1);
  const full = Math.max(Math.round(saved * (totalMonths / Math.max(months || 1, 1))), saved);
  return { known: true, measured: true, saved: saved, months: months, firstMonth: firstMonth, totalMonths: totalMonths, full: full, bytes: full, messages: null };
}

export function rooms(cfg) {
  const c = cfg || loadConfig();
  const file = path.resolve(REPO, c.roomsFile || "rooms.unis.json");
  const raw = loadRooms(file);
  const list = raw.rooms || raw;
  return (Array.isArray(list) ? list : []).map((r) => Object.assign({}, r, { tz: r.tz || raw.tz || c.tz || "auto" }));
}

// The order matters here: the renderer only links media that is already on disk, so a render that
// runs before `media` produces a page with no photos in it. Say so, instead of letting the user
// wonder where the images went.
function warnMissingMedia(o, outDir, log) {
  let s = null;
  for (const n of [o.slug + ".summary.json", "summary.json"]) {
    try { s = JSON.parse(fs.readFileSync(path.join(outDir, n), "utf8")); break; } catch (e) { s = null; }
  }
  if (!s) return;
  if (Number(s.mediaTotal || 0) > 0 && Number(s.mediaLokal || 0) === 0) {
    log("warning: no media is on disk yet, so this page has no photos or video in it: run `media --room " + o.slug + "`, then render again");
  }
}

// Run the renderer as its own process. It is a script, not a library: importing it would start a
// render, and running it apart keeps its environment exactly as documented.
export async function renderRoom(o) {
  const outDir = o.outDir || dirs().rooms;
  const env = Object.assign({}, process.env, {
    DM_SRC: o.srcDir,
    DM_EXPORT: outDir,
    DM_BASE: o.slug,
    DM_JSONL: o.slug + ".jsonl",
    DM_ROOM_NAME: o.roomName || "",
    DM_ARTIST: o.artist || "",
    DM_TZ: o.tz || "auto",
    DM_MEDIA: dirs().media,
    DM_MEDIA_REL: "../media",
    DM_BOOKMARKS: o.bookmarks || "off",
    WDM_LANG: o.lang || "en",
    DM_LANG: o.lang || "en",
  });
  if (o.only) env.DM_ONLY = o.only;
  // Only ever set for the public export: DM_RENAME is deliberately not part of the global config env.
  if (o.rename) env.DM_RENAME = o.rename;
  const log = o.onLog || (() => {});
  const lines = [];
  return await new Promise((resolve) => {
    let proc = null;
    try { proc = spawn(process.execPath, [path.join(SRC, "render.mjs")], { env: env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { log("render: could not start (" + String(e.message || e) + ")"); resolve(-1); return; }
    const take = (buf) => { for (const line of String(buf).split(NL)) if (line.trim()) { lines.push(line); log("render: " + line.trim().slice(0, 200)); } };
    proc.stdout.on("data", take);
    proc.stderr.on("data", take);
    proc.on("error", (e) => { log("render: " + String(e.message || e)); });
    proc.on("close", (code) => {
      try { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, o.slug + "-render.log"), lines.join(NL) + NL, "utf8"); } catch (e) {}
      if (code === 0 && o.warn !== false) warnMissingMedia(o, outDir, log);
      resolve(code == null ? -1 : code);
    });
  });
}

// The public export is the shareable twin of the private one, and lives next to it so the relative
// "../media" links keep working from both.
export const publicDirFor = (cfg) => path.join(dirs(cfg).rooms, "public");

// Two exports per room, because they answer two different questions:
//   rooms/<slug>.*         private - every message, for the person who owns the account
//   rooms/public/<slug>.*  public  - artist messages only, nickname hidden, safe to hand to anyone
// The private one is the archive of record and is also what the media download works from, so nothing
// the user sent goes missing from their own copy. The public one is what gets packed.
export async function renderBoth(o) {
  const log = o.onLog || (() => {});
  const d = dirs();
  const pub = publicDirFor();
  const base = { slug: o.slug, srcDir: o.srcDir, roomName: o.roomName, artist: o.artist, tz: o.tz, lang: o.lang, onLog: log };
  log("render: private export (both sides) -> " + path.join(d.rooms, o.slug + ".html"));
  const priv = await renderRoom(Object.assign({}, base, { only: o.only || "", rename: "", bookmarks: o.bookmarks || "off", outDir: d.rooms, warn: true }));
  keepSummary(o.slug, d.rooms);
  if (priv !== 0) return { private: priv, public: null };
  log("render: public export (artist only" + (o.rename ? ", nickname hidden" : "") + ") -> " + path.join(pub, o.slug + ".html"));
  const p = await renderRoom(Object.assign({}, base, { only: "artist", rename: o.rename || "", bookmarks: "off", outDir: pub, warn: false }));
  keepSummary(o.slug, pub);
  if (p === 0) auditPublic(o, pub, log);
  return { private: priv, public: p };
}

// build-public.mjs used to count leftover occurrences of the hidden name by hand. Keep that check: a
// shareable export that still contains the nickname is worse than no export at all.
function auditPublic(o, dir, log) {
  const names = String(o.rename || "").split("|").filter((p) => p.indexOf("=") > 0).map((p) => p.slice(0, p.indexOf("=")));
  if (!names.length) return;
  let left = 0;
  for (const f of [o.slug + ".html", o.slug + ".md", o.slug + ".jsonl", "summary.json"]) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) { continue; }
    for (const n of names) { const hits = text.split(n).length - 1; if (hits) { left += hits; log("warning: the hidden name still appears " + hits + "x in the public " + f); } }
  }
  log(left === 0 ? "render: public export checked, the hidden name is gone" : "warning: " + left + " occurrence(s) of the hidden name are still in the public export");
}

// Start the private browser window and wait until it can talk to the API.
export async function openSession(o) {
  const opts = o || {};
  const log = opts.onLog || (() => {});
  const cfg = opts.cfg || loadConfig();
  const found = findBrowser(cfg);
  if (!found) return { error: "no-browser" };
  const started = await launch({ browserPath: found.path, profile: profileDir(), url: "https://weverse.io/", onLog: log });
  if (!started.port) return { error: "no-port" };
  const target = await waitPage(started.port, "weverse.io", 30000);
  if (!target) return { error: "no-page" };
  const cdp = await attach(target.webSocketDebuggerUrl);
  const ok = await ensureAuth(cdp, { onLog: log, shouldStop: opts.shouldStop, timeoutMs: opts.authTimeoutMs || 300000 });
  if (!ok) return { error: "no-auth", cdp: cdp, browser: started };
  return { cdp: cdp, browser: started, name: found.name };
}

// One room, start to finish.
export async function runRoom(o) {
  const log = o.onLog || (() => {});
  const progress = o.onProgress || (() => {});
  const stop = o.shouldStop || (() => false);
  const d = dirs();
  const out = { slug: o.slug, roomId: o.roomId, phases: {}, startedAt: Date.now() };
  const roomName = o.roomName || o.slug;
  const artist = o.artist || o.slug;

  log("== " + roomName + " (" + o.slug + " / " + o.roomId + ")");
  const h = await harvest({
    roomId: o.roomId, tag: tagFor(o.slug), outDir: srcFor(o.slug), cdp: o.cdp,
    onLog: log, onProgress: (p) => progress({ phase: "harvest", slug: o.slug, data: p }), shouldStop: stop, maxPages: o.maxPages,
  });
  out.phases.harvest = h;
  if (stop()) return Object.assign(out, { stopped: true });

  const r1 = await renderBoth({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, rename: o.rename, bookmarks: o.bookmarks, onLog: log });
  out.phases.render = r1.private;
  out.phases.renderPublic = r1.public;
  if (r1.private !== 0) return Object.assign(out, { error: "render" });

  const m = await downloadMedia({
    jsonl: path.join(d.rooms, o.slug + ".jsonl"), mediaDir: d.media, roomId: o.roomId, cdp: o.cdp,
    kind: o.kind, conc: o.conc, onLog: log, onProgress: (p) => progress({ phase: "media", slug: o.slug, data: p }), shouldStop: stop,
  });
  out.phases.media = m;
  if (stop()) return Object.assign(out, { stopped: true });

  // The second pass is what makes the gallery show the files we now have locally.
  const r2 = await renderBoth({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, rename: o.rename, bookmarks: o.bookmarks, onLog: log });
  out.phases.render2 = r2.private;
  out.phases.render2Public = r2.public;

  if (o.share) {
    // Always pack the public export: the private one holds the other side of the conversation.
    const b = await bundle({ slug: o.slug, roomId: o.roomId, roomName: roomName, artist: artist, roomDir: publicDirFor(), mediaDir: d.media, distDir: d.dist, credit: o.credit, onLog: log });
    out.phases.bundle = { zip: b.zip, sha256: b.sha256, bytes: b.bytes, entries: b.entries };
  }
  out.elapsedMs = Date.now() - out.startedAt;
  return out;
}
