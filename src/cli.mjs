// src/cli.mjs -- everything the window can do, for people who would rather type it.
//
//   node src/cli.mjs rooms                       list the rooms in rooms.unis.json
//   node src/cli.mjs harvest --room yunha        walk the history (starts the private browser)
//   node src/cli.mjs render  --room yunha        build both exports (private + public) from disk
//   node src/cli.mjs media   --room yunha        download the photos and video (no browser if complete)
//   node src/cli.mjs share   --room yunha        one zip in share/, ready to send
//   node src/cli.mjs labels                      read the room names off the DM list into rooms.unis.json
//   node src/cli.mjs all     --room yunha --share
//   node src/cli.mjs doctor                      check node, browser, rooms and folders
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { REPO, dirs, rooms, runRoom, renderBoth, publicDirFor, srcFor, openSession, tzFor, publicRenameFor } from "./pipeline.mjs";
import { downloadMedia, pendingItems } from "./media.mjs";
import { bundle } from "./bundle.mjs";
import { findFfmpeg } from "./quality.mjs";
import { findBrowser } from "./browser.mjs";
import { readArchive } from "./harvest.mjs";
import { artistLabel, loadRooms, saveRooms } from "./rooms.mjs";
import { readPanel, savePanel } from "./panel.mjs";
import { DM_URL, LABEL_PROBE, captureLabels, gotoDm, mergeLabels, readRows, saveAvatars } from "./labels.mjs";

const argv = process.argv.slice(2);
const cmd = (argv[0] || "help").toLowerCase();
function flag(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && v.indexOf("--") !== 0 ? v : true;
}
const has = (name) => argv.indexOf("--" + name) >= 0;
const log = (m) => console.log(String(m));
const cfg = loadConfig();
const lang = String(flag("lang", cfg.language === "auto" ? "en" : cfg.language));
const d = dirs(cfg);

function pick() {
  const want = String(flag("room", "") || "").toLowerCase();
  const list = rooms(cfg);
  if (!want) { log("which room? --room <slug>  (see: node src/cli.mjs rooms)"); process.exit(2); }
  const hit = list.filter((r) => r.slug.toLowerCase() === want || String(r.roomId).toLowerCase() === want)[0];
  if (!hit) { log("unknown room: " + want); process.exit(2); }
  return hit;
}

async function withSession(fn) {
  log("starting the private browser window (its own profile, not the one you browse with)");
  const s = await openSession({ cfg: cfg, onLog: log, authTimeoutMs: Number(flag("auth-timeout", 300000)) });
  if (s.error) {
    log(s.error === "no-browser" ? "no Chrome, Edge or Brave found; set browserPath in config.json" : "could not start a session (" + s.error + ")");
    process.exit(1);
  }
  return await fn(s);
}

function stopSignal() {
  let stop = false;
  process.on("SIGINT", () => { if (stop) process.exit(130); stop = true; log("stopping after the current page..."); });
  return () => stop;
}

const commands = {
  rooms: async () => {
    const list = rooms(cfg);
    for (const r of list) {
      const a = readArchive(srcFor(r.slug));
      log(r.slug.padEnd(10) + r.roomId + "  " + String(r.nameEn || "").padEnd(9) + String(r.nameKo || "").padEnd(6) +
        "  " + a.files.length + " part(s), " + a.seen.size + " message(s)" + (a.deepest == null ? "" : ", oldest " + new Date(a.deepest).toISOString().slice(0, 10)));
    }
  },
  labels: async () => {
    // The DM list is the only place the real room names live, emoji and all. Without --from the
    // tool opens its own window, goes to the DM list and reads them there; the probe never sends
    // a request of its own.
    const file = path.resolve(REPO, cfg.roomsFile || "rooms.unis.json");
    if (has("snippet")) {
      log("Paste this in the DevTools console of the DM list page (" + DM_URL + "), save what it prints as a .json file, then run:");
      log("  node src/cli.mjs labels --from <that file>");
      log("");
      log(LABEL_PROBE);
      return;
    }
    const obj = loadRooms(file);
    const from = String(flag("from", ""));
    let rows = [];
    let src = "the DM list";
    if (from) {
      rows = readRows(path.resolve(from));
      src = "file " + from;
    } else {
      await withSession(async (s) => {
        await gotoDm(s.cdp, { onLog: log });
        const got = await captureLabels(s.cdp, { onLog: log, timeoutMs: Number(flag("wait", 90000)) });
        rows = got.rows || [];
        if (!rows.length) log("the page showed no room rows; open the DM list in that window and run it again");
      });
    }
    const avatars = has("no-avatars") ? [] : await saveAvatars(cfg, obj, rows, { onLog: log, mediaDir: d.media });
    if (avatars.length) log("avatars: " + avatars.join(", "));
    const res = mergeLabels(obj, rows);
    for (const c of res.changed) log("label: " + c.slug.padEnd(10) + JSON.stringify(c.from) + " -> " + JSON.stringify(c.to));
    if (res.kept.length) log("already right: " + res.kept.join(", "));
    if (res.missing.length) log("no name captured for: " + res.missing.join(", "));
    if (res.unmatched.length) log("on the page but not in the registry: " + res.unmatched.join(", "));
    if (!res.changed.length) { log("nothing to write (" + rows.length + " row(s) read from " + src + ")"); return; }
    if (has("dry")) { log("--dry: " + file + " left untouched"); return; }
    saveRooms(file, obj);
    log("wrote " + res.changed.length + " label(s) to " + file + " (source: " + src + ")");
    log("next: node src/cli.mjs render --room <slug>");
  },
  harvest: async () => {
    const r = pick();
    await withSession(async (s) => {
      const res = await runRoom({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: artistLabel(r), tz: tzFor(cfg, r), lang: lang, rename: publicRenameFor(cfg, r.slug), cdp: s.cdp, onLog: log, shouldStop: stopSignal() });
      log(JSON.stringify(res.phases.harvest, null, 1));
    });
  },
  bookmarks: async () => {
    const r = pick();
    const port = Number(flag("port", 7000));
    // The panel only exists in the window the reader already has open, so this reads that page and
    // never opens a session of its own: nothing is clicked and nothing is sent.
    log("looking for the bookmark panel in the browser on port " + port);
    let res = null;
    try { res = await readPanel(port, { onLog: log }); }
    catch (e) { log("could not read the panel: " + String(e.message || e)); process.exit(1); }
    if (!res.items.length) {
      log("the panel is not open: in that browser, open the room's DM, press the bookmark list and run this again");
      process.exit(1);
    }
    const dir = srcFor(r.slug);
    const file = savePanel(dir, { room: r.slug, roomId: r.roomId, items: res.items, page: res.page });
    log(res.items.length + " bookmark(s) read from the panel -> " + file);
    log("newest: " + String(res.items[0].tanggalTampil || "") + " - " + String(res.items[0].preview || "").slice(0, 50));
    log("oldest: " + String(res.items[res.items.length - 1].tanggalTampil || "") + " - " + String(res.items[res.items.length - 1].preview || "").slice(0, 50));
    log("next: node src/cli.mjs render --room " + r.slug + "   (the private export picks the panel up on its own)");
  },
  render: async () => {
    const r = pick();
    const res = await renderBoth({ slug: r.slug, srcDir: srcFor(r.slug), roomName: r.rowLabel || r.slug, artist: artistLabel(r), tz: tzFor(cfg, r), lang: lang, rename: publicRenameFor(cfg, r.slug), onLog: log });
    // Only claim an output path when the renderer really produced one.
    if (res.private !== 0) { log("render failed (exit " + res.private + "); nothing was written"); process.exit(1); }
    log("private export -> " + path.join(d.rooms, r.slug + ".html"));
    log("public export  -> " + path.join(publicDirFor(), r.slug + ".html") + (res.public === 0 ? "" : "  (FAILED, exit " + res.public + ")"));
    process.exit(res.public === 0 ? 0 : 1);
  },
  media: async () => {
    const r = pick();
    const jsonl = path.join(d.rooms, r.slug + ".jsonl");
    const kind = String(flag("kind", "all"));
    const fetchAll = (cdp) => downloadMedia({ jsonl: jsonl, mediaDir: d.media, roomId: r.roomId, cdp: cdp, kind: kind, onLog: log, shouldStop: stopSignal() });
    // A room whose files are all on disk needs no login, and no window should open for it.
    if (!pendingItems({ jsonl: jsonl, mediaDir: d.media, kind: kind }).length) { log(JSON.stringify(await fetchAll(undefined), null, 1)); return; }
    await withSession(async (s) => { log(JSON.stringify(await fetchAll(s.cdp), null, 1)); });
  },
  share: async () => {
    const r = pick();
    const b = await bundle({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: artistLabel(r), roomDir: publicDirFor(), mediaDir: d.media, shareDir: d.share, verifyDir: d.verify, credit: cfg.credit || "", lowQuality: has("low"), onLog: log });
    log(b.zip);
    log("sha256 " + b.sha256);
  },
  all: async () => {
    const r = pick();
    await withSession(async (s) => {
      const res = await runRoom({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: artistLabel(r), tz: tzFor(cfg, r), lang: lang, rename: publicRenameFor(cfg, r.slug), share: has("share"), shareLow: has("low"), cdp: s.cdp, onLog: log, shouldStop: stopSignal() });
      log(JSON.stringify(res, null, 1));
    });
  },
  doctor: async () => {
    log("node       " + process.version + (Number(process.versions.node.split(".")[0]) >= 20 ? "  ok" : "  too old, need 20 or newer"));
    const b = findBrowser(cfg);
    log("browser    " + (b ? b.name + " at " + b.path : "none found - install Chrome or Edge, or set browserPath"));
    log("repo       " + REPO);
    log("rooms      " + d.rooms + (fs.existsSync(d.rooms) ? "" : "  (will be created)"));
    log("media      " + d.media + (fs.existsSync(d.media) ? "" : "  (will be created)"));
    log("downloads  " + d.downloads);
    log("config     " + (process.env.WDM_CONFIG || path.join(REPO, "config.json")));
    log("ffmpeg     " + (findFfmpeg(cfg) || "none found - a low quality zip needs it, or set ffmpegPath"));
    const list = rooms(cfg);
    log("rooms file " + list.length + " room(s): " + list.map((r) => r.slug).join(", "));
  },
  help: async () => {
    log("usage: node src/cli.mjs <rooms|harvest|render|media|share|all|doctor> [--room <slug>] [--share] [--low] [--lang en|ko|id]");
  },
};

const run = commands[cmd] || commands.help;
try { await run(); } catch (e) { console.error(String((e && e.message) || e)); process.exit(1); }
