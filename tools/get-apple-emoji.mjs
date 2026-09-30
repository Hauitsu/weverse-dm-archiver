#!/usr/bin/env node
// Install Apple Color Emoji for the generated pages.
//
// The renderer looks for media/fonts/apple-emoji.<woff2|ttf|otf> and, when it finds one, links that
// font instead of the bundled Noto one (the Noto files stay in the repo as the fallback). This
// script downloads a release of github.com/samuelngs/apple-emoji-ttf, cuts it down to the emoji
// that really appear in your archives, and writes it to media/fonts/apple-emoji.woff2.
//
//   node tools/get-apple-emoji.mjs                  download, subset, install
//   node tools/get-apple-emoji.mjs --from X.ttf     use a font file you already have
//   node tools/get-apple-emoji.mjs --remove         delete it and go back to Noto
//
// The result stays on this machine: .gitignore keeps media/fonts/apple-emoji.* out of the repo,
// because Apple does not license redistribution of its emoji font, while Noto is OFL and ships.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../src/rooms.mjs";
import { loadConfig } from "../src/config.mjs";
import { dirs } from "../src/pipeline.mjs";

const REPO = "samuelngs/apple-emoji-ttf";
const FONT_DIR = path.join(ROOT, "media", "fonts");
const OUT = path.join(FONT_DIR, "apple-emoji.woff2");
const CACHE = path.join(ROOT, "downloads", "apple-emoji-source.ttf");
const argv = process.argv.slice(2);
const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const log = (s) => console.log(s);

function sumberDari(flag) {
  if (flag) {
    if (!fs.existsSync(flag)) throw new Error("font tidak ada: " + flag);
    return flag;
  }
  if (fs.existsSync(CACHE)) { log("pakai salinan unduhan: " + path.relative(ROOT, CACHE)); return CACHE; }
  return null;
}

async function unduh() {
  const rel = await (await fetch("https://api.github.com/repos/" + REPO + "/releases", { headers: { "user-agent": "weverse-dm-archiver" } })).json();
  // Newest release first, but skip the ones whose font is huge (macOS 26 ships 110-240 MB): pulling
  // that just to cut it down is slow, and the release one step back still has current shapes.
  const BATAS = 60 * 1024 * 1024;
  let pilih = null, terkecil = null;
  for (const r of rel) for (const a of r.assets || []) {
    if (!/\.ttf$/i.test(a.name)) continue;
    if (!terkecil || a.size < terkecil.size) terkecil = { url: a.browser_download_url, size: a.size, name: a.name, tag: r.tag_name };
    if (!pilih && a.size <= BATAS) pilih = { url: a.browser_download_url, size: a.size, name: a.name, tag: r.tag_name };
  }
  if (!pilih) pilih = terkecil;
  if (!pilih) throw new Error("tidak ada aset .ttf di release " + REPO);
  log("unduh " + pilih.name + " (" + (pilih.size / 1048576).toFixed(1) + " MB, " + pilih.tag + ")");
  const res = await fetch(pilih.url);
  if (!res.ok) throw new Error("unduhan gagal: HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, buf);
  log("disimpan: " + path.relative(ROOT, CACHE) + " (" + (buf.length / 1048576).toFixed(1) + " MB)");
  return CACHE;
}

const EMOJI = (cp) =>
  (cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff) ||
  (cp >= 0x2190 && cp <= 0x21ff) || (cp >= 0x2300 && cp <= 0x23ff) || (cp >= 0x2460 && cp <= 0x24ff) ||
  (cp >= 0x25a0 && cp <= 0x25ff) || (cp >= 0x2900 && cp <= 0x297f) ||
  [0x00a9, 0x00ae, 0x2122, 0x2139, 0x20e3, 0x200d, 0xfe0f, 0x3030, 0x303d, 0x3297, 0x3299].indexOf(cp) >= 0;

// Every codepoint the pages may show: harvested messages, the summaries and the registry names.
function codepoint(cfg) {
  const set = new Set([0x200d, 0x20e3, 0xfe0f]);
  const ambil = (s) => { for (const ch of String(s)) { const cp = ch.codePointAt(0); if (EMOJI(cp)) set.add(cp); } };
  const d = dirs(cfg);
  const daftar = [path.join(ROOT, "rooms.unis.json")].concat(fs.existsSync(d.rooms) ? fs.readdirSync(d.rooms).filter((f) => /\.jsonl$|\.summary\.json$/.test(f)).map((f) => path.join(d.rooms, f)) : []);
  for (const f of daftar) if (fs.existsSync(f)) ambil(fs.readFileSync(f, "utf8"));
  return [...set].sort((a, b) => a - b);
}

function subset(src, cps) {
  const unicodes = cps.map((c) => "U+" + c.toString(16).toUpperCase()).join(",");
  const berkas = path.join(path.dirname(CACHE), "emoji-unicodes.txt");
  fs.mkdirSync(path.dirname(berkas), { recursive: true });
  fs.writeFileSync(berkas, unicodes);
  const cobaan = [
    ["pyftsubset", [src, "--unicodes-file=" + berkas, "--flavor=woff2", "--output-file=" + OUT]],
    ["python", ["-m", "fontTools.subset", src, "--unicodes-file=" + berkas, "--flavor=woff2", "--output-file=" + OUT]],
  ];
  const pesan = [];
  for (const [cmd, args] of cobaan) {
    const r = spawnSync(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    if (r.error) { pesan.push(cmd + ": " + r.error.code); continue; }
    if (r.status === 0 && fs.existsSync(OUT)) return cmd;
    pesan.push(cmd + ": exit " + r.status + " " + String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 120));
  }
  throw new Error("subset gagal -> " + pesan.join(" | ") + " (butuh fontTools + brotli: pip install fonttools brotli)");
}

if (argv.indexOf("--remove") >= 0) {
  if (fs.existsSync(OUT)) { fs.rmSync(OUT); log("dihapus: media/fonts/apple-emoji.woff2 -> render berikutnya memakai Noto lagi"); }
  else log("tidak ada media/fonts/apple-emoji.woff2");
  process.exit(0);
}

const cfg = loadConfig();
const cps = codepoint(cfg);
log("emoji ditemukan di arsip: " + cps.length + " codepoint");
const src = sumberDari(val("--from")) || (await unduh());
fs.mkdirSync(FONT_DIR, { recursive: true });
const pakai = subset(src, cps);
log("selesai via " + pakai + ": media/fonts/apple-emoji.woff2 " + (fs.statSync(OUT).size / 1048576).toFixed(2) + " MB");
log("render ulang agar halaman memakainya: node src/cli.mjs render --room <slug>");