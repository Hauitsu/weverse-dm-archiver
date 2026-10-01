// src/pipeline.mjs -- the order of operations, shared by the window and the command line.
//
//   harvest  signed GETs, one page at a time, appended to downloads/<slug>/
//   render   turns those pages into two exports: rooms/<slug>.* (private, both sides) and
//            rooms-public/<slug>.* (artist messages only, nickname hidden, safe to send)
//   media    downloads the photos and video the private export points at
//   render   again, so both pages link to the files that are actually on disk
//   bundle   optional: one zip per room, built from the public export
//
// Each room keeps its own folder under downloads/. The renderer merges every part file it finds,
// so keeping rooms apart is what stops one room history from leaking into another.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { harvest, readArchive, saveArtistPhoto } from "./harvest.mjs";
import { downloadMedia } from "./media.mjs";
import { buildThumbs, makeQueue, modeOf } from "./thumbs.mjs";
import { findFfmpeg } from "./quality.mjs";
import { bundle } from "./bundle.mjs";
import { findBrowser, launch, launchPlain, killBrowser, waitExit, profileDir } from "./browser.mjs";
import { waitPage, attach, ensureAuth } from "./cdp.mjs";
import { loadRooms } from "./rooms.mjs";

// Small pause helper - used by the login wait and the browser hand-over.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NL = String.fromCharCode(10);
export const REPO = path.resolve(import.meta.dirname, "..");
export const SRC = path.join(REPO, "src");

export function dirs(cfg) {
  const c = cfg || loadConfig();
  return {
    rooms: path.resolve(REPO, c.output || "rooms"),
    roomsPublic: path.resolve(REPO, (c.output || "rooms") + "-public"),
    media: path.join(REPO, "media"),
    downloads: path.join(REPO, "downloads"),
  share: path.join(REPO, "share"),
  verify: path.join(REPO, "verify"),
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
export const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1);
const monthsBetween = (a, b) => monthIndex(b) - monthIndex(a) + 1;
export const thisMonth = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };

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
  for (const dir of [d.rooms, d.roomsPublic]) {
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
// a room with nothing on disk falls back to cfg.estimateGb, the ceiling of a full room.
export function estimateFor(cfg, room) {
  const c = cfg || loadConfig();
  const guess = Math.round(Number(c.estimateGb || 3) * GIB);
  let months = null;
  let firstMonth = null;
  let lastMonth = null;
  // rooms/summary.json belongs to whichever room was rendered last, so it only counts when it really
  // describes this room; the per-room copy is the reliable one.
  for (const n of [room.slug + ".summary.json", "summary.json"]) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dirs(c).rooms, n), "utf8"));
      const from = String(j.sumber || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop();
      const ids = Array.isArray(j.roomIds) ? j.roomIds : [j.roomIds];
      if (n === "summary.json" && from !== room.slug && ids.indexOf(room.roomId) < 0) continue;
      if (Array.isArray(j.perBulan) && j.perBulan.length) {
        months = j.perBulan.length;
        firstMonth = String((j.perBulan[0] || {}).bulan || "") || null;
        lastMonth = String((j.perBulan[j.perBulan.length - 1] || {}).bulan || "") || null;
      }
      else if (Number(j.bulan) > 0) months = Number(j.bulan);
      break;
    } catch (e) {}
  }
  const saved = savedBytes(c, room.slug);
  if (!saved) {
    const archived = readArchive(srcFor(room.slug));
    return { known: false, measured: false, saved: null, months: months, firstMonth: firstMonth, lastMonth: lastMonth, full: guess, bytes: guess, messages: archived.seen.size || null };
  }
  // April 2025 is the floor of the window; a room whose history starts later projects from there.
  const start = firstMonth && monthIndex(firstMonth) > monthIndex(DM_START_MONTH) ? firstMonth : DM_START_MONTH;
  const totalMonths = Math.max(monthsBetween(start, thisMonth()), months || 1);
  const full = Math.max(Math.round(saved * (totalMonths / Math.max(months || 1, 1))), saved);
  return { known: true, measured: true, saved: saved, months: months, firstMonth: firstMonth, lastMonth: lastMonth, totalMonths: totalMonths, full: full, bytes: full, messages: null };
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
  // Thumbnails are linked only while the user wants them and ffmpeg can build them. The renderer
  // still checks every single one on disk before linking it, so the pass that runs before a download
  // simply keeps the originals instead of pointing at files that are not there yet.
  const cfg = loadConfig();
  const ffmpeg = findFfmpeg(cfg);
  const thumbsOn = modeOf(cfg, ffmpeg) === "on";
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
    DM_THUMB_DIR: thumbsOn ? "../media/thumbs/photos" : "",
    DM_VIDEO_POSTER: thumbsOn ? "../media/thumbs/video" : "",
    DM_BOOKMARKS: o.bookmarks === undefined ? "" : o.bookmarks,
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

// The login wait gets a full minute before the page offers the "I'm logged in" button: a click a few
// seconds in is almost always impatience, and the button only asks for the next check anyway.
export const HURRY_AFTER_MS = 60000;
// A minute after that first claim the very same button turns into a plain Retry. Nothing retries on
// its own: the wait is still automatic, the button only says that the last claim did not land yet.
export const HURRY_RETRY_AFTER_MS = 60000;
// "" hide it, "ready" -> "I'm logged in", "retry" -> "Retry".
export function hurryMode(st, now) {
  if (!st || !st.loginWait || st.phase !== "browser") return "";
  const t = Number(now || Date.now());
  // The plain sign-in window is the one case where waiting a minute first would be pointless: the
  // user opened it to type, so the button is there from the first second.
  if (st.plainWait) return st.hurryFirstAt && t - Number(st.hurryFirstAt) >= HURRY_RETRY_AFTER_MS ? "retry" : "ready";
  if (!st.hurryFirstAt) return t - Number(st.loginAt || 0) >= HURRY_AFTER_MS ? "ready" : "";
  return t - Number(st.hurryFirstAt) >= HURRY_RETRY_AFTER_MS ? "retry" : "ready";
}

// The public export is the shareable twin of the private one. It sits at the repo root as
// rooms-public/ instead of inside rooms/, because its pages link media as "../media" and that only
// resolves when exactly one level separates the page from media/.
export const publicDirFor = (cfg) => dirs(cfg).roomsPublic;

// Two exports per room, because they answer two different questions:
//   rooms/<slug>.*         private - every message, for the person who owns the account
//   rooms-public/<slug>.*  public  - artist messages only, nickname hidden, safe to hand to anyone
// The private one is the archive of record and is also what the media download works from, so nothing
// the user sent goes missing from their own copy. The public one is what gets packed.
export async function renderBoth(o) {
  const log = o.onLog || (() => {});
  const d = dirs();
  const pub = publicDirFor();
  const base = { slug: o.slug, srcDir: o.srcDir, roomName: o.roomName, artist: o.artist, tz: o.tz, lang: o.lang, onLog: log };
  log("render: private export (both sides) -> " + path.join(d.rooms, o.slug + ".html"));
  // Bookmarks are made in the browser and kept there (see src/bm.js). A bookmarks.json sitting next
  // to the room is baked in as the starting list; the public export never carries any.
  const priv = await renderRoom(Object.assign({}, base, { only: o.only || "", rename: "", bookmarks: o.bookmarks || "", outDir: d.rooms, warn: true }));
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

// Sign in by hand, then start the private browser window and wait until it can talk to the API.
// The one thing nothing here can look inside is the plain sign-in window: it has no debugging port
// by design, so only the person typing in it knows when the typing is done. They say so with the
// page button (the GUI), by closing the window, or by pressing Enter where the tool runs in a
// terminal. Returns why the wait ended so the caller can tell a stop from a timeout.
// That window opens on every run, even when the profile still holds a session from yesterday: a
// stored login can be stale, and this side cannot look inside the window to know either way.
// A browser left behind by an earlier run still holds the profile, and a launch on a locked
// profile just hands its arguments to that old instance: no fresh port opens, no page appears, and
// the run dies with "no-page". Clear the way before the first launch of a session.
export async function clearLeftovers(profile, onLog) {
  const log = onLog || (() => {});
  const needle = String(profile || "");
  if (!needle) return 0;
  const outFile = path.join(os.tmpdir(), "wdm-leftovers.txt");
  const win = process.platform === "win32";
  const script = win
    ? "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe','brave.exe','vivaldi.exe') -and $_.CommandLine -like '*" + needle.replace(/'/g, "''") + "*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \"gone\" } | Out-File -Encoding utf8 '" + outFile.replace(/'/g, "''") + "'"
    : null;
  try {
    if (win) {
      await new Promise((done) => { const c = spawn("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore" }); c.on("exit", done); c.on("error", done); });
    } else {
      await new Promise((done) => { const c = spawn("pkill", ["-f", needle], { stdio: "ignore" }); c.on("exit", done); c.on("error", done); });
    }
  } catch (e) {}
  let n = 0;
  try { n = fs.readFileSync(outFile, "utf8").split("\n").filter((x) => x.indexOf("gone") >= 0).length; fs.rmSync(outFile, { force: true }); } catch (e) {}
  if (n) { log("browser: closed " + n + " browser process(es) left over from an earlier run"); await sleep(600); }
  return n;
}
// How long the page keeps that button busy after the press. The hand-over itself starts on the
// click - the window closes and the browser opens again immediately - so this is only the cooldown
// that stops a second press from racing the hand-over it just started.
export const SETTLE_AFTER_CLICK_MS = 15000;

async function waitForGo(proc, opts, log) {
  const o = opts || {};
  const stop = o.shouldStop || (() => false);
  const said = o.saidDone;
  let typed = false;
  if (!said) {
    try {
      if (process.stdin.isTTY) { process.stdin.setEncoding("utf8"); process.stdin.on("data", () => { typed = true; }); process.stdin.resume(); }
    } catch (e) {}
  }
  log("browser: sign in there, then " + (said ? "press the button on the page" : "close that window (or press Enter here)"));
  // No deadline: the window is open, the page has a button, and only the person in front of it knows
  // whether the signing in is done. Stop is the way out, so this can afford to wait.
  let seen = Date.now();
  for (;;) {
    if (stop()) return "stopped";
    if (said && said()) return "done";
    if (typed) return "done";
    if (!proc || proc.exitCode !== null) return "closed";
    if (Date.now() - seen > 300000) { seen = Date.now(); log("browser: still waiting for that sign-in window"); }
    await sleep(400);
  }
}

export async function openSession(o) {
  const opts = o || {};
  const log = opts.onLog || (() => {});
  const cfg = opts.cfg || loadConfig();
  const found = findBrowser(cfg);
  if (!found) return { error: "no-browser" };
  const prof = opts.profile || profileDir();
  const open = () => launch({ browserPath: found.path, profile: prof, url: "https://weverse.io/", onLog: log });
  const use = async (started, ms) => {
    if (!started.port) return { error: "no-port" };
    const target = await waitPage(started.port, "weverse.io", 30000);
    if (!target) return { error: "no-page" };
    const cdp = await attach(target.webSocketDebuggerUrl);
    const ok = await ensureAuth(cdp, {
      onLog: log, shouldStop: opts.shouldStop, timeoutMs: ms,
      hurry: opts.hurry, hurryLog: opts.hurryLog,
    });
    return { cdp: cdp, browser: started, name: found.name, auth: ok };
  };
  // Every run starts by hand: open the window Google accepts, let the person sign in, and wait for
  // them to say the signing in is done. Nothing here decides on its own that the session already in
  // the profile still works - the person in front of the window is the only one who can see that.
  await clearLeftovers(prof, log);
  let current = null;   // the automated browser we are holding right now, if any
  log("browser: opening the normal sign-in window first, even when this profile has signed in before");
  // The browser that can read the page is exactly the one Google refuses, so from here it is a
  // cycle, not a countdown: hand the typing to a normal window, take over the session it leaves
  // behind, and if there is still nothing, open the sign-in window again. The button on the page is
  // a real check because pressing it runs that whole hand-over, and a login that never arrives is
  // nobody's error - Stop is the only way out, and the tool keeps the window open until then.
  for (;;) {
    if (opts.shouldStop && opts.shouldStop()) return { error: "stopped", cdp: null, browser: null };
    // The automated window holds the profile lock, and a second launch would only hand its arguments
    // to that running instance - so it has to be gone before the sign-in window opens, or the window
    // meant to be plain would inherit the very debug port Google refuses.
    if (current) { killBrowser(current.proc); await waitExit(current.proc, 15000); current = null; }
    log("browser: opening a normal window to sign in - Google refuses a browser that is driven over DevTools");
    const plain = await launchPlain({ browserPath: found.path, profile: prof, url: "https://weverse.io/", onLog: log });
    if (opts.onPlainWait) opts.onPlainWait(true);
    const why = await waitForGo(plain.proc, opts, log);
    // The click is the starting gun, not a pause: this window goes away and the browser opens again
    // right now. What the person gets instead is a cooldown on the page - the button stays busy for
    // this long - so nothing can be pressed twice while that hand-over is still in flight.
    if (why === "done" && opts.onSettle) {
      opts.onSettle(true, opts.settleMs == null ? SETTLE_AFTER_CLICK_MS : Number(opts.settleMs));
    }
    if (opts.onPlainWait) opts.onPlainWait(false);
    killBrowser(plain.proc);
    await waitExit(plain.proc, 15000);
    if (why === "stopped") return { error: "stopped", cdp: null, browser: plain };
    log("browser: taking over the session the sign-in window left behind");
    const again = await open();
    current = again;
    // Right after a sign-in the session is either there or it is not: a short look keeps the
    // window from coming back with nothing to say. authTimeoutMs stays the ceiling, so a caller
    // can shorten it but never stretch it past a minute.
    const got = await use(again, Math.min(opts.authTimeoutMs || 45000, 60000));
    if (got.error) return got;
    if (got.auth) return { cdp: got.cdp, browser: got.browser, name: got.name };
    log("browser: still no session after that sign-in - the normal window comes back, press the button when you are done");
    await sleep(1500);
  }
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

  // The artist's picture travels with the conversation: fetch it here so the render below can show it.
  // Best effort only - a failed download must never fail the harvest that just succeeded.
  try {
    const photo = await saveArtistPhoto({ dir: srcFor(o.slug), mediaDir: d.media, slug: o.slug, onLog: log });
    if (photo) out.phases.artistPhoto = photo;
  } catch (e) { log("artist photo skipped: " + String(e.message || e)); }

  progress({ phase: "render", slug: o.slug, data: { pass: 1 } });
  const r1 = await renderBoth({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, rename: o.rename, bookmarks: o.bookmarks, onLog: log });
  out.phases.render = r1.private;
  out.phases.renderPublic = r1.public;
  if (r1.private !== 0) return Object.assign(out, { error: "render" });

  // Thumbnails ride along with the download (see src/thumbs.mjs): the cpu work happens while the next
  // file is still on the wire, so a fresh room pays almost no extra wait for the small copies the page
  // and the gallery show. Files that were already on disk from an earlier run are covered by the sweep
  // below, and neither path ever rebuilds a thumb that is newer than the file it came from.
  const cfg = loadConfig();
  const ffmpeg = findFfmpeg(cfg);
  const thumbsOn = modeOf(cfg, ffmpeg) === "on";
  const thumbQueue = makeQueue({ mediaDir: d.media, enabled: thumbsOn, ffmpeg: ffmpeg, shouldStop: stop, onLog: log });
  progress({ phase: "media", slug: o.slug, data: { done: 0, total: 0 } });
  const m = await downloadMedia({
    jsonl: path.join(d.rooms, o.slug + ".jsonl"), mediaDir: d.media, roomId: o.roomId, cdp: o.cdp,
    kind: o.kind, conc: o.conc, onLog: log, onProgress: (p) => progress({ phase: "media", slug: o.slug, data: p }), shouldStop: stop,
    // kind comes from the downloader: a voice note is an mp4 without a picture, so it is skipped.
    onSaved: (rel, kind) => { if (kind !== "audio") thumbQueue.push(rel); },
  });
  out.phases.media = m;
  // Everything the download pushed is already written by now; drain waits for the last one.
  const beside = await thumbQueue.drain();
  if (beside.queued) log("thumbs: " + beside.made + " built beside the download" + (beside.failed ? ", " + beside.failed + " skipped" : ""));
  if (stop()) return Object.assign(out, { stopped: true });
  if (thumbsOn) {
    const sweep = await buildThumbs({
      mediaDir: d.media, cfg: cfg, ffmpeg: ffmpeg, enabled: true, shouldStop: stop, onLog: log,
      onProgress: (p) => progress({ phase: "media", slug: o.slug, data: { done: m.total || 0, total: m.total || 0, thumbs: p } }),
    });
    if (sweep.total) log("thumbs: " + sweep.made + " built for files that were already on disk" + (sweep.failed ? ", " + sweep.failed + " skipped" : ""));
    out.phases.thumbs = { beside: beside.made, swept: sweep.made, failed: beside.failed + sweep.failed, bytes: beside.bytes + sweep.bytes };
  }

  // The second pass is what makes the gallery show the files we now have locally.
  progress({ phase: "render", slug: o.slug, data: { pass: 2 } });
  const r2 = await renderBoth({ slug: o.slug, srcDir: srcFor(o.slug), roomName: roomName, artist: artist, tz: o.tz, lang: o.lang, only: o.only, rename: o.rename, bookmarks: o.bookmarks, onLog: log });
  out.phases.render2 = r2.private;
  out.phases.render2Public = r2.public;

  if (o.share) {
    // Always pack the public export: the private one holds the other side of the conversation.
    progress({ phase: "bundle", slug: o.slug, data: {} });
    const b = await bundle({ slug: o.slug, roomId: o.roomId, roomName: roomName, artist: artist, roomDir: publicDirFor(), mediaDir: d.media, shareDir: d.share, verifyDir: d.verify, credit: o.credit, lowQuality: !!o.shareLow, onLog: log });
    out.phases.bundle = { zip: b.zip, sha256: b.sha256, bytes: b.bytes, entries: b.entries, quality: b.quality, mediaBytes: b.mediaBytes, mediaOriginal: b.mediaOriginal, recompressed: b.recompressed };
  }
  out.elapsedMs = Date.now() - out.startedAt;
  return out;
}
