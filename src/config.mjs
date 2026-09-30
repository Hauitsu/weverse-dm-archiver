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
  output: "rooms",
  // Applied to the public export only: name=Someone|other=Other hides a nickname the artist typed.
  // It is deliberately never set as an environment variable, so the private export keeps the real text.
  publicRename: "",
  pacing: { minMs: 1500, maxMs: 3000 },
  textOnly: false,
};

// Missing file = all defaults. A file that exists but does not parse is a real error:
// silently falling back would hide a typo the user needs to see.
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
