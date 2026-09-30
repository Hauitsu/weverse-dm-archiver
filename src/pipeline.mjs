// src/pipeline.mjs -- the order of operations, shared by the window and the command line.
//
//   harvest  signed GETs, one page at a time, appended to downloads/<slug>/
//   render   turns those pages into rooms/<slug>.html, .md and .jsonl
//   media    downloads the photos and video the export points at
//   render   again, so the page now links to the files that are actually on disk
//   bundle   optional: one zip per room, ready to send to someone
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

// How much disk a room will take, for the picker. A measured room reports what it really used.
export function estimateFor(cfg, room) {
  const d = dirs(cfg);
  try {
    const j = JSON.parse(fs.readFileSync(path.join(d.rooms, room.slug + ".summary.json"), "utf8"));
    if (Number(j.mediaLokal) > 0) return { known: true, bytes: null, messages: Number(j.entriMentah || 0) || null };
  } catch (e) {}
  const archived = readArchive(srcFor(room.slug));
  const gb = Number((cfg && cfg.estimateGb) || 2.5);
  return { known: false, bytes: Math.round(gb * 1073741824), messages: archived.seen.size || null };
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
      if (code === 0) warnMissingMedia(o, outDir, log);
      resolve(code == null ? -1 : code);
    });
  });
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

  const r1 = await renderRoom({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, onLog: log, outDir: d.rooms });
  out.phases.render = r1;
  if (r1 !== 0) return Object.assign(out, { error: "render" });
  keepSummary(o.slug, d.rooms);

  const m = await downloadMedia({
    jsonl: path.join(d.rooms, o.slug + ".jsonl"), mediaDir: d.media, roomId: o.roomId, cdp: o.cdp,
    kind: o.kind, conc: o.conc, onLog: log, onProgress: (p) => progress({ phase: "media", slug: o.slug, data: p }), shouldStop: stop,
  });
  out.phases.media = m;
  if (stop()) return Object.assign(out, { stopped: true });

  // The second pass is what makes the gallery show the files we now have locally.
  const r2 = await renderRoom({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, onLog: log, outDir: d.rooms });
  out.phases.render2 = r2;
  keepSummary(o.slug, d.rooms);

  if (o.share) {
    const b = await bundle({ slug: o.slug, roomId: o.roomId, roomName: roomName, artist: artist, roomDir: d.rooms, mediaDir: d.media, distDir: d.dist, credit: o.credit, onLog: log });
    out.phases.bundle = { zip: b.zip, sha256: b.sha256, bytes: b.bytes, entries: b.entries };
  }
  out.elapsedMs = Date.now() - out.startedAt;
  return out;
}
