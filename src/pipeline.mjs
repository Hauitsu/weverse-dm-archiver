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
import { spawn, spawnSync } from "node:child_process";
import { loadConfig } from "./config.mjs";
import { harvest, readArchive, saveArtistPhoto } from "./harvest.mjs";
import { downloadMedia } from "./media.mjs";
import { buildThumbs, makeQueue, modeOf } from "./thumbs.mjs";
import { findFfmpeg } from "./quality.mjs";
import { bundle } from "./bundle.mjs";
import { findBrowser, listBrowsers, samePath, launch, killBrowser, closeBrowser, waitExit, profileDir } from "./browser.mjs";
import { waitPage, attach, ensureAuth } from "./cdp.mjs";
import { loadRooms, SLUG } from "./rooms.mjs";

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

// The slug comes out of rooms.unis.json, a file people edit by hand: a value like "../x" would put the
// downloads outside the folder, so it is refused here rather than resolved.
export const srcFor = (slug) => {
  const s = String(slug == null ? "" : slug);
  if (!SLUG.test(s)) throw new Error("room slug is not usable: " + JSON.stringify(slug));
  return path.join(REPO, "downloads", s);
};

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
  // The window the person signs in is the one case where waiting a minute first would be pointless: the
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
  if (!keepSummary(o.slug, d.rooms)) log("warning: the per-room summary could not be written - an older summary stays in place");
  if (priv !== 0) return { private: priv, public: null };
  log("render: public export (artist only" + (o.rename ? ", nickname hidden" : "") + ") -> " + path.join(pub, o.slug + ".html"));
  const p = await renderRoom(Object.assign({}, base, { only: "artist", rename: o.rename || "", bookmarks: "off", outDir: pub, warn: false }));
  if (!keepSummary(o.slug, pub)) log("warning: the public room summary could not be written - an older summary stays in place");
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

// Sign in by hand, then attach to the window that is already open and wait until it can talk to the
// API. That window carries a debugging port from the moment it is launched - the port is what makes
// the sign-in stick - but nothing attaches to it until the person says the typing is done, so the
// automation stays out of the way while they type. They say so with the page button (the GUI), by
// closing the window, or by pressing Enter where the tool runs in a terminal. Returns why the wait
// ended so the caller can tell a stop from a timeout.
// That window opens on every run, even when the profile still holds a session from yesterday: a
// stored login can be stale, and the page button is how the person answers for it either way.
// A browser left behind by an earlier run still holds the profile, and a launch on a locked
// profile just hands its arguments to that old instance: no fresh port opens, no page appears, and
// the run dies with "no-page". Clear the way before the first launch of a session.
export async function clearLeftovers(profile, onLog) {
  const log = onLog || (() => {});
  const needle = String(profile || "");
  if (!needle) return 0;
  // One file per run: a fixed name in the shared temp folder is a name two runs can collide on.
  const outFile = path.join(os.tmpdir(), "wdm-leftovers-" + process.pid + ".txt");
  const win = process.platform === "win32";
  // The profile travels through the environment, never inside the command text: a path may hold
  // quotes or spaces, and a path pasted into a script is a path that can break the script. The
  // pattern then matches the whole --user-data-dir argument, so a profile ending in "browser" no
  // longer claims the processes of a profile ending in "browser2".
  const profileRe = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\\/]+$/, "");
  const script = win
    ? "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe','brave.exe','vivaldi.exe') -and $_.CommandLine -match ('--user-data-dir=\"?' + $env:WDM_PROFILE_RE + '\"?(\\s|$)') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; \"gone\" } | Out-File -Encoding utf8 '" + outFile.replace(/'/g, "''") + "'"
    : null;
  let n = 0;
  let unknownCount = false;   // POSIX only: pkill ran but there was no way to count what it found
  try {
    if (win) {
      await new Promise((done) => { const c = spawn("powershell", ["-NoProfile", "-Command", script], { stdio: "ignore", env: Object.assign({}, process.env, { WDM_PROFILE_RE: profileRe }) }); c.on("exit", done); c.on("error", done); });
    } else {
      // pkill reports nothing on its own, and asking it afterwards would only count the survivors:
      // count the matches first, then kill them, so the caller still gets its number and its pause.
      try {
        const r = spawnSync("pgrep", ["-cf", "--", needle], { encoding: "utf8", timeout: 10000 });
        // 0 matches (status 1) is still a count; anything else means pgrep could not answer.
        n = Number(String((r && r.stdout) || "").trim()) || 0;
        unknownCount = !(r && !r.error && (r.status === 0 || r.status === 1));
      } catch (e) { unknownCount = true; }
      // The kill happens whether or not the count worked: a machine without pgrep would otherwise
      // stop clearing the profile, which is the one thing this function is for.
      await new Promise((done) => { const c = spawn("pkill", ["-f", "--", needle], { stdio: "ignore" }); c.on("exit", done); c.on("error", done); });
    }
  } catch (e) {}
  if (win) { try { n = fs.readFileSync(outFile, "utf8").split("\n").filter((x) => x.indexOf("gone") >= 0).length; fs.rmSync(outFile, { force: true }); } catch (e) {} }
  if (n) { log("browser: closed " + n + " browser process(es) left over from an earlier run"); await sleep(600); }
  // Nothing could be counted, so nothing can be reported, but the profile still gets the same
  // moment to settle before the next launch tries to lock it.
  else if (unknownCount) await sleep(600);
  return n;
}
// How long the page keeps that button busy after the press. The check starts on the click, and this
// window is not going anywhere - it is the same browser that was just typed into - so this is only the
// cooldown that stops a second press from racing the check it just started.
export const SETTLE_AFTER_CLICK_MS = 15000;

async function waitForGo(proc, opts, log, swap) {
  const o = opts || {};
  const stop = o.shouldStop || (() => false);
  const said = o.saidDone;
  let typed = false;
  let onData = null;
  if (!said) {
    try {
      if (process.stdin.isTTY) { process.stdin.setEncoding("utf8"); onData = () => { typed = true; }; process.stdin.on("data", onData); process.stdin.resume(); }
    } catch (e) {}
  }
  log("browser: sign in in that window, then " + (said ? "press the button on the page" : "press Enter here"));
  // No deadline: the window is open, the page has a button, and only the person in front of it knows
  // whether the signing in is done. Stop is the way out, so this can afford to wait.
  let seen = Date.now();
  try {
    for (;;) {
      if (stop()) return "stopped";
      // Checked on the same beat as Stop: the person picks another browser because this window was
      // refused, and while they are still signing in the swap costs them nothing but the window.
      if (swap && swap()) return "switch";
      if (said && said()) return "done";
      if (typed) return "done";
      if (!proc || proc.exitCode !== null) return "closed";
      if (Date.now() - seen > 300000) { seen = Date.now(); log("browser: still waiting for that sign-in window"); }
      await sleep(400);
    }
  } finally {
    // One listener per call, removed again: a run that goes round this loop a dozen times must not
    // leave a dozen of them behind.
    if (onData) { try { process.stdin.off("data", onData); } catch (e) {} }
  }
}

// The browser picked on the page while a sign-in is being waited on. A refused sign-in is the whole
// reason the picker exists, and stopping the run to change browsers would throw away everything the
// run has done so far. "" is Automatic: the first browser found, the one a fresh run would start.
export function browserSwap(cfg, currentPath, wish) {
  // null means nobody has picked anything yet, which is not the same as Automatic: reading it as
  // Automatic would send every untouched run looking for the first browser and swapping back to it.
  if (wish == null) return null;
  const w = String(wish).trim();
  const hit = w ? listBrowsers(cfg).find((x) => samePath(x.path, w)) : findBrowser(cfg);
  return hit && !samePath(hit.path, currentPath) ? hit : null;
}

export async function openSession(o) {
  const opts = o || {};
  const log = opts.onLog || (() => {});
  const cfg = opts.cfg || loadConfig();
  const found = findBrowser(cfg);
  if (!found) return { error: "no-browser" };
  const prof = opts.profile || profileDir();
  const use = async (started, ms) => {
    if (!started.port) return { error: "no-port" };
    const target = await waitPage(started.port, "weverse.io", 30000);
    if (!target) return { error: "no-page" };
    let cdp = null;
    try { cdp = await attach(target.webSocketDebuggerUrl); }
    // Its own code: the page was there, the socket was not, and saying "no page" here sends the
    // person looking in the wrong place. The browser is handed back so the caller can close it.
    catch (e) { log("browser: could not open the debugger socket (" + String((e && e.message) || e) + ")"); return { error: "no-socket", cdp: null, browser: started }; }
    // A tab restored from the previous session is also weverse.io, and the login check below would
    // read whatever state that old page is in. Start the hand-over from a fresh load.
    try { await cdp.send("Page.navigate", { url: "https://weverse.io/" }, 30000); }
    catch (e) { log("browser: could not reload the page (" + String((e && e.message) || e) + ")"); }
    const ok = await ensureAuth(cdp, {
      onLog: log, shouldStop: opts.shouldStop, timeoutMs: ms,
      hurry: opts.hurry, hurryLog: opts.hurryLog,
    });
    return { cdp: cdp, browser: started, auth: ok };
  };
  // One window, start to finish. The sign-in tokens Weverse hands out are session cookies: they live
  // and die with the browser process. Every earlier design typed into a second, debug-free window and
  // then closed it, and the window that took over was sent only the anonymous cookies - measured on
  // this machine 2026-10-02: the sign-in cookies were on disk marked is_persistent=0, and the next
  // window did not get them, which is why --restore-last-session and a tidy close were not enough. So
  // the window that is typed into is the window that reads the page: it is launched with the debugging
  // port from the start, but nothing attaches while the person types - the check that refuses a driven
  // browser is about a client being attached, not about a port being open. The session never has to
  // survive a restart: the browser is only swapped during the wait below, before any page is read,
  // and the profile folder carries the sign-in from one window of it to the next.
  await clearLeftovers(prof, log);
  // Whatever window is up right now: which executable it is, so a swap that shows up in the picker can
  // be told apart from the window already on screen.
  let curPath = found.path;
  const startWindow = () => launch({ browserPath: curPath, profile: prof, url: "https://weverse.io/", onLog: log });
  const swapHook = () => {
    const pb = opts.pickBrowser;
    if (!pb || !pb.get || !pb.cfg) return false;
    const wish = pb.get();
    if (wish == null) return false;
    // Once read, the wish is spent - even when it turns out to be the window already on screen. Left
    // standing, it would be read again on every tick of the wait below and a pick that meant "this one
    // is fine" would keep asking the same question for as long as the person takes to sign in.
    if (pb.clear) pb.clear();
    const next = browserSwap(pb.cfg(), curPath, wish);
    if (!next) return false;
    curPath = next.path;
    return true;
  };
  log("browser: opening the window you sign in with (the session stays inside this browser)");
  const authMs = Math.min(opts.authTimeoutMs || 45000, 60000);
  let current = await startWindow();
  if (!current.port) return { error: "no-port" };
  for (;;) {
    if (opts.shouldStop && opts.shouldStop()) return { error: "stopped", cdp: null, browser: current };
    if (opts.onPlainWait) opts.onPlainWait(true);
    const why = await waitForGo(current.proc, opts, log, swapHook);
    if (opts.onPlainWait) opts.onPlainWait(false);
    if (why === "switch") {
      // Same profile, different browser: the profile folder is what carries a sign-in from one window
      // to the next, so this costs the window, never the session. Only reachable while the person is
      // signing in - the wait above is the only caller - which is why nothing here is reading the page.
      // Named by its file, the same way launch() names it in the log: a picker entry carries an internal
      // label ("config" for a hand-written path), which means nothing to the person reading the log.
      log("browser: switching to " + path.basename(curPath) + " - opening it now, sign in there instead");
      // Forced on purpose: nothing in that window is worth saving - the person is signing in for the
      // first time, which is exactly why they are changing browsers - and a polite close would make
      // them wait through a shutdown they did not ask for. The profile on disk is untouched, so the
      // new window finds whatever the old one had already written and nothing else is lost.
      killBrowser(current.proc);
      // The profile is the one thing the next launch needs free: a launch while the old process still
      // holds it hands its arguments to that process instead of opening a window, and the run then
      // dies with no port at all. The kill above is enough on a normal machine; this is the belt for
      // the one time it is not.
      if (!(await waitExit(current.proc, 5000))) await clearLeftovers(prof, log);
      current = await startWindow();
      if (!current.port) return { error: "no-port" };
      continue;
    }
    if (why === "stopped") return { error: "stopped", cdp: null, browser: current };
    // The click is the starting gun, not a pause: the check below starts right now, and the button on
    // the page stays busy for this long, so a second press cannot race the check it just started.
    if (why === "done" && opts.onSettle) {
      opts.onSettle(true, opts.settleMs == null ? SETTLE_AFTER_CLICK_MS : Number(opts.settleMs));
    }
    if (why === "closed") {
      // The window went away instead of being used, so there is nothing left to read. This is the only
      // path that starts a browser again, and it is the person's own doing - the sign-in that was in
      // that window is gone with it, which is exactly why the window is asked to stay open above.
      log("browser: that window was closed - opening a fresh one");
      await waitExit(current.proc, 5000);
      current = await startWindow();
      if (!current.port) return { error: "no-port" };
      continue;
    }
    const got = await use(current, authMs);
    if (got.error) return got;
    if (got.auth) {
      // The session turned out to be in the window after all, so the waiting is over and a pick that
      // arrived late has nothing left to swap for. Closing a signed-in window would throw that sign-in
      // away, so the pick is simply dropped - the run has what it came for.
      if (opts.pickBrowser && opts.pickBrowser.clear) opts.pickBrowser.clear();
      return { cdp: got.cdp, browser: got.browser };
    }
    // Signed out. Nothing is closed, so the session cookies are still where the browser keeps them:
    // the person signs in again in the same window and the same check runs on the same browser. The
    // socket is dropped first, because a password is about to be typed in there and a sign-in provider
    // refuses a window that is being driven over DevTools.
    log("browser: still no session in that window. It stays open: accept Weverse's cookie banner in it"
      + " (a session that never accepted one does not last), sign in there, then press the button again");
    try { got.cdp.close(); } catch (e) {}
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
