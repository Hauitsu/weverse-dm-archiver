// src/cli.mjs -- everything the window can do, for people who would rather type it.
//
//   node src/cli.mjs rooms                       list the rooms in rooms.unis.json
//   node src/cli.mjs harvest --room yunha        walk the history (starts the private browser)
//   node src/cli.mjs render  --room yunha        build html/md/jsonl from what is on disk
//   node src/cli.mjs media   --room yunha        download the photos and video
//   node src/cli.mjs share   --room yunha        one zip in dist/, ready to send
//   node src/cli.mjs all     --room yunha --share
//   node src/cli.mjs doctor                      check node, browser, rooms and folders
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.mjs";
import { REPO, dirs, rooms, runRoom, renderRoom, srcFor, openSession, tzFor } from "./pipeline.mjs";
import { downloadMedia } from "./media.mjs";
import { bundle } from "./bundle.mjs";
import { findBrowser } from "./browser.mjs";
import { readArchive } from "./harvest.mjs";

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
  harvest: async () => {
    const r = pick();
    await withSession(async (s) => {
      const res = await runRoom({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: r.nameKo || r.slug, tz: tzFor(cfg, r), lang: lang, only: "artist", cdp: s.cdp, onLog: log, shouldStop: stopSignal() });
      log(JSON.stringify(res.phases.harvest, null, 1));
    });
  },
  render: async () => {
    const r = pick();
    const code = await renderRoom({ slug: r.slug, srcDir: srcFor(r.slug), roomName: r.rowLabel || r.slug, artist: r.nameKo || r.slug, tz: tzFor(cfg, r), lang: lang, only: "artist", onLog: log, outDir: d.rooms });
    log("render exit " + code + " -> " + path.join(d.rooms, r.slug + ".html"));
    process.exit(code === 0 ? 0 : 1);
  },
  media: async () => {
    const r = pick();
    await withSession(async (s) => {
      const res = await downloadMedia({ jsonl: path.join(d.rooms, r.slug + ".jsonl"), mediaDir: d.media, roomId: r.roomId, cdp: s.cdp, kind: String(flag("kind", "all")), onLog: log, shouldStop: stopSignal() });
      log(JSON.stringify(res, null, 1));
    });
  },
  share: async () => {
    const r = pick();
    const b = await bundle({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: r.nameKo || r.slug, roomDir: d.rooms, mediaDir: d.media, distDir: d.dist, credit: cfg.credit || "", onLog: log });
    log(b.zip);
    log("sha256 " + b.sha256);
  },
  all: async () => {
    const r = pick();
    await withSession(async (s) => {
      const res = await runRoom({ slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: r.nameKo || r.slug, tz: tzFor(cfg, r), lang: lang, only: "artist", share: has("share"), cdp: s.cdp, onLog: log, shouldStop: stopSignal() });
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
    const list = rooms(cfg);
    log("rooms file " + list.length + " room(s): " + list.map((r) => r.slug).join(", "));
  },
  help: async () => {
    log("usage: node src/cli.mjs <rooms|harvest|render|media|share|all|doctor> [--room <slug>] [--share] [--lang en|ko|id]");
  },
};

const run = commands[cmd] || commands.help;
try { await run(); } catch (e) { console.error(String((e && e.message) || e)); process.exit(1); }
