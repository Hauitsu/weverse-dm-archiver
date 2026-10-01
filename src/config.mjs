// config.mjs -- read config.json and expose it as the internal DM_* variables.
//
// config.json is the friendly file a user edits (see config.example.json). Every value can also
// be given as an environment variable, and a variable that is already set always wins, so a
// one-off run never needs an edit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const CONFIG_FILE = process.env.WDM_CONFIG || path.join(ROOT, "config.json");

export const DEFAULTS = {
  language: "auto",
  tz: "auto",
  roomsFile: "rooms.unis.json",
  // Ceiling the picker quotes for a room it has never seen: one room of this group measured 2.5 GB
  // over 18 months, so a whole conversation is at most about this. Only affects the estimate.
  estimateGb: 3,
  output: "rooms",
  // Extra find=replace pairs for the public export: name=Someone|other=Other. The fan nickname itself
  // needs no entry - it is read from the archive and always becomes EverAfter - so this is only for
  // other strings. Deliberately never set as an environment variable: the private export keeps the
  // harvested text untouched.
  publicRename: "",
  pacing: { minMs: 1500, maxMs: 3000 },
  textOnly: false,
  // What the picker keeps for the share zip: "yes", "low" or "no". Low re-compresses the copies
  // that go inside the zip; the archive itself always keeps the originals.
  shareMode: "yes",
  // Empty means the copy that ships in runtime/ffmpeg, then the ffmpeg on PATH. Set this when
  // ffmpeg lives somewhere unusual.
  ffmpegPath: "",
  // "Share to <name>": where a zip can be handed over - a chat invite, a cloud folder. The build
  // ships one, hidden from a search box but not from a reader (see src/collect.mjs); setting this
  // replaces it. Only this one value is ever opened (never anything the page itself sends).
  // collectOwned lists rooms never worth asking about (empty by default); collectSeen
  // remembers that the once-per-install popup has been shown. collectDebug is for looking at that
  // popup: it offers every room, whatever its archive looks like, and shows the message after every
  // finished run without using up the once-per-install moment.
  collectName: "Hauitsu",
  collectOwned: "",
  collectSeen: false,
  collectDebug: false,
  collectUrl: "",
};

// Missing file = all defaults. A file that exists but does not parse is a real error:
// silently falling back would hide a typo the user needs to see.
export const SHARE_MODES = ["yes", "low", "no"];

export function readConfig(file) {
  const f = file || CONFIG_FILE;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    if (e && e.code === "ENOENT") return Object.assign({}, DEFAULTS);
    throw new Error(f + " is not valid JSON: " + e.message);
  }
  const cfg = Object.assign({}, DEFAULTS, raw);
  cfg.pacing = Object.assign({}, DEFAULTS.pacing, raw.pacing || {});
  if (SHARE_MODES.indexOf(String(cfg.shareMode)) < 0) cfg.shareMode = DEFAULTS.shareMode;
  if (typeof cfg.collectUrl !== "string") cfg.collectUrl = DEFAULTS.collectUrl;
  cfg.collectUrl = cfg.collectUrl.trim();
  if (typeof cfg.collectOwned !== "string") cfg.collectOwned = DEFAULTS.collectOwned;
  cfg.collectOwned = cfg.collectOwned.trim();
  cfg.collectSeen = !!cfg.collectSeen;
  cfg.collectDebug = !!cfg.collectDebug;
  if (typeof cfg.collectName !== "string" || !cfg.collectName.trim()) cfg.collectName = DEFAULTS.collectName;
  cfg.collectName = cfg.collectName.trim();
  return cfg;
}

function put(name, value) {
  if (value === undefined || value === null || value === "") return;
  if (String(process.env[name] || "").trim()) return;
  process.env[name] = String(value);
}

// Write settings back to config.json. The page uses this when the user switches language or picks
// a time zone; an environment variable still wins, so a one-off run is never overridden.
export function saveConfig(patch, file) {
  const f = file || CONFIG_FILE;
  const cfg = readConfig(f);
  for (const k of Object.keys(patch || {})) if (patch[k] !== undefined) cfg[k] = patch[k];
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  return cfg;
}

// Called once, before anything else reads a setting.
export function loadConfig(file) {
  const cfg = readConfig(file);
  put("DM_LANG", cfg.language);
  put("DM_TZ", cfg.tz);
  put("DM_EXPORT", cfg.output ? path.resolve(ROOT, cfg.output) : "");
  put("DM_GAP_MIN", cfg.pacing.minMs);
  put("DM_GAP_MAX", cfg.pacing.maxMs);
  return cfg;
}
