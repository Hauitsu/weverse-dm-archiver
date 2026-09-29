// src/i18n.mjs -- language picker and every user-facing string.
//
// Dictionaries live in src/lang/<code>.json so translators do not have to touch code.
// To add a language: drop src/lang/xx.json next to the others and add "xx" to LANGS.
//
// Precedence: explicit argument > WDM_LANG > DM_LANG > config "language" > OS locale > "en".
// The value "auto" means "follow the OS locale". Missing keys fall back to English and are
// collected in t.missing so --check can report them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LANGS = ["en", "ko", "id"];
export const FALLBACK = "en";
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "lang");

// Language implied by the operating system locale, if we ship it; English otherwise.
export function osLang() {
  let tag = "";
  try { tag = String(Intl.DateTimeFormat().resolvedOptions().locale || ""); } catch (e) { tag = ""; }
  const two = tag.split("-")[0].toLowerCase();
  return LANGS.includes(two) ? two : FALLBACK;
}

// Resolve the language code. An unknown value warns once and falls back to English.
export function pickLang(explicit) {
  const arg = String(explicit == null ? "" : explicit).trim().toLowerCase();
  const env = String(process.env.WDM_LANG || process.env.DM_LANG || "").trim().toLowerCase();
  const want = arg || env;
  if (!want || want === "auto") return osLang();
  if (LANGS.includes(want)) return want;
  console.log('WARNING: language "' + want + '" is not available; using ' + FALLBACK + " (options: " + LANGS.join(", ") + ").");
  return FALLBACK;
}

const CACHE = new Map();
export function dict(lang) {
  const code = LANGS.includes(lang) ? lang : FALLBACK;
  if (CACHE.has(code)) return CACHE.get(code);
  let obj = {};
  try { obj = JSON.parse(fs.readFileSync(path.join(DIR, code + ".json"), "utf8")); } catch (e) { obj = {}; }
  CACHE.set(code, obj);
  return obj;
}

// makeT("ko") returns t(key, vars). Vars replace {name} placeholders literally.
export function makeT(lang) {
  const code = pickLang(lang);
  const main = dict(code), base = dict(FALLBACK);
  const missing = new Set();
  const t = (key, vars) => {
    let s = main[key];
    if (s == null) { s = base[key]; if (s == null) { missing.add(key); s = "[" + key + "]"; } }
    if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };
  t.lang = code;
  t.missing = missing;
  return t;
}

export function allKeys(lang) { return Object.keys(dict(lang)).sort(); }

// node src/i18n.mjs --check : every dictionary must define exactly the same keys.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/i18n.mjs") && process.argv.includes("--check")) {
  const base = allKeys(FALLBACK);
  let bad = 0;
  for (const code of LANGS) {
    const k = allKeys(code);
    const kurang = base.filter((x) => !k.includes(x));
    const lebih = k.filter((x) => !base.includes(x));
    if (kurang.length || lebih.length) {
      bad++;
      console.log(code + ": " + kurang.length + " missing, " + lebih.length + " extra");
      for (const x of kurang) console.log("  missing " + x);
      for (const x of lebih) console.log("  extra   " + x);
    } else console.log(code + ": OK (" + k.length + " keys)");
  }
  console.log(bad ? "FAIL: dictionaries do not match" : "OK: " + LANGS.length + " languages x " + base.length + " keys");
  process.exit(bad ? 1 : 0);
}
