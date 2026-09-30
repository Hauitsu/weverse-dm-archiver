// render -- turn raw archived pages into normalized messages + Markdown + HTML + summary
// Default source : ./downloads/*-partNNN.jsonl     Default output : ./export/
// Optional env   : DM_SRC, DM_EXPORT, DM_TZ (IANA zone, e.g. Asia/Seoul, Europe/Berlin, America/New_York; "auto" = machine zone),
//                  DM_TZ_OFFSET (minutes, default 420 = WIB/UTC+7), DM_TZ_LABEL (display label, e.g. WIB, KST)
//                  DM_ONLY=artist|fan (keep one side), DM_RENAME="old=new|old2=new2" (applied to text/textEn/nickname/raw),
//                  DM_BASE (html+md basename, default is 'backup'), DM_JSONL (default is 'messages.jsonl'),
//                  DM_ARTIST, DM_ROOM_NAME, DM_MEDIA, DM_MEDIA_REL, DM_FONT, DM_FONT_REL, DM_BOOKMARKS
//                  DM_PHOTO_REL / DM_VIDEO_REL (media URL bases, default = DM_MEDIA_REL),
//                  DM_THUMB_DIR + DM_THUMB_EXT (show thumbnails; clicking still opens the original), DM_AVATAR_FILE,
//                  DM_VIDEO_POSTER + DM_VIDEO_POSTER_EXT (poster for <video>, e.g. thumbs/video), DM_VIDEO_ASLI_REL (link to the original)
//                  WDM_LANG / DM_LANG (en, ko, id; default: config.json, else the OS locale)
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { makeT } from './i18n.mjs';

// config.json is optional; an environment variable that is already set always wins over it.
loadConfig();
const t = makeT();

const ROOT = process.cwd();
const SRC_DIR = process.env.DM_SRC || path.join(ROOT, 'downloads');
const OUT = process.env.DM_EXPORT || path.join(ROOT, 'export');
// ---- time zone: DM_TZ (IANA zone, e.g. Asia/Seoul; "auto" = machine zone) [default: auto] > DM_TZ_OFFSET (explicit minutes) > 420 = WIB/UTC+7 (fallback) ----
// The old Yunha archive (label WIB) is reproduced byte-identically with DM_TZ=Asia/Jakarta.
// The offset is computed per message, so DST changes stay correct. The ISO field in messages.jsonl (isoWib) is this local time.
const TZ_ALIAS = {
  "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT",
  "Asia/Bangkok": "ICT", "Asia/Ho_Chi_Minh": "ICT", "Asia/Seoul": "KST", "Asia/Pyongyang": "KST",
  "Asia/Tokyo": "JST", "Asia/Shanghai": "CST", "Asia/Taipei": "CST", "Asia/Hong_Kong": "HKT",
  "Asia/Singapore": "SGT", "Asia/Kuala_Lumpur": "MYT", "Asia/Manila": "PHT", "Asia/Kolkata": "IST",
  "Australia/Sydney": "AET", "Europe/London": "GMT/BST", "Europe/Berlin": "CET", "Europe/Paris": "CET",
  "Europe/Madrid": "CET", "Europe/Moscow": "MSK", "America/New_York": "ET", "America/Chicago": "CT",
  "America/Denver": "MT", "America/Los_Angeles": "PT", "America/Sao_Paulo": "BRT", "UTC": "UTC", "Etc/UTC": "UTC",
};
const tzAda = (zone) => { try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch (e) { return false; } };
const TZ_ZONA = (() => {
  // With no env set we use the machine zone ("auto"). An explicitly set DM_TZ_OFFSET still wins,
  // so the older fixed-offset way keeps its meaning.
  let isi = String(process.env.DM_TZ || process.env.WDM_TZ || "").trim();  // WDM_TZ is kept as an alias for the launcher
  if (!isi && String(process.env.DM_TZ_OFFSET || "").trim()) return "";
  if (isi && /^auto$/i.test(isi)) isi = "";
  if (isi && !tzAda(isi)) { console.log(t("warn.tzUnknown", { v: isi })); isi = ""; }
  if (isi) return isi;
  const zMesin = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zMesin && tzAda(zMesin)) return zMesin;
  console.log(t("warn.tzNoMachine", { v: process.env.DM_TZ_OFFSET || 420 }));
  return "";
})();
const TZ_OFFSET_TETAP = Number(process.env.DM_TZ_OFFSET || 420);
const TZ_DTF = new Map();
const tzOffsetMenit = (ms) => {
  let dtf = TZ_DTF.get(TZ_ZONA);
  if (!dtf) { dtf = new Intl.DateTimeFormat("en-US", { timeZone: TZ_ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); TZ_DTF.set(TZ_ZONA, dtf); }
  const p = {};
  for (const x of dtf.formatToParts(new Date(ms))) p[x.type] = x.value;
  return Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second)) - ms) / 60000);
};
const TZ_MIN = (ms) => (TZ_ZONA ? tzOffsetMenit(ms) : TZ_OFFSET_TETAP);
const tzLabelOffset = (min) => "UTC" + (min < 0 ? "-" : "+") + Math.floor(Math.abs(min) / 60) + (Math.abs(min) % 60 ? ":" + String(Math.abs(min) % 60).padStart(2, "0") : "");
const TZ_LABEL = String(process.env.DM_TZ_LABEL || "").trim()
  || (TZ_ZONA ? (TZ_ALIAS[TZ_ZONA] || TZ_ZONA) : (TZ_OFFSET_TETAP === 420 ? "WIB" : tzLabelOffset(TZ_OFFSET_TETAP)));
const ARTIST_NAME = process.env.DM_ARTIST || '';
const ROOM_NAME = process.env.DM_ROOM_NAME || '';
const NL = String.fromCharCode(10);
const BASE = process.env.DM_BASE || 'backup';
const JSONL_NAME = process.env.DM_JSONL || 'messages.jsonl';
const ONLY = String(process.env.DM_ONLY || '').toLowerCase();
const RENAME = String(process.env.DM_RENAME || '').split('|').filter((p) => p.indexOf('=') > 0).map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]);
const fix = (s) => { if (s == null || !RENAME.length) return s; let t = String(s); for (const pr of RENAME) t = t.split(pr[0]).join(pr[1]); return t; };
const fixRaw = (o) => { if (o == null || !RENAME.length) return o; try { return JSON.parse(fix(JSON.stringify(o))); } catch (e) { return o; } };
if (!ARTIST_NAME || !ROOM_NAME) { console.error(t("err.noRoom")); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// ---- local media files (written by fetch-media.mjs) ----
const MEDIA_ABS = process.env.DM_MEDIA || path.join(ROOT, 'media');
const MEDIA_REL = process.env.DM_MEDIA_REL || '../media';
const PHOTO_REL = process.env.DM_PHOTO_REL || MEDIA_REL;
const VIDEO_REL = process.env.DM_VIDEO_REL || MEDIA_REL;
const THUMB_DIR = String(process.env.DM_THUMB_DIR || '').replace(/\/+$/, '');
const THUMB_EXT = process.env.DM_THUMB_EXT || '.webp';
const AVATAR_FILE = process.env.DM_AVATAR_FILE || '';
const VIDEO_POSTER = String(process.env.DM_VIDEO_POSTER || '').replace(/\/+$/, '');
const VIDEO_POSTER_EXT = process.env.DM_VIDEO_POSTER_EXT || THUMB_EXT;
const VIDEO_ASLI_REL = String(process.env.DM_VIDEO_ASLI_REL || '').replace(/\/+$/, '');
const extOf = (u) => { const x = String(u || '').split('?')[0].split('.').pop(); return /^[A-Za-z0-9]{2,5}$/.test(x) ? x.toLowerCase() : 'bin'; };
const mediaFile = (x, im, i) => { const isP = im.kind === 'photo'; const rel = (isP ? 'photos/' : 'video/') + x.isoWib.slice(0, 10) + '-' + x.messageId + (i ? '-' + i : '') + '.' + (isP ? extOf(im.url) : 'mp4'); return { rel: rel, web: (isP ? PHOTO_REL : VIDEO_REL) + '/' + rel, ada: fs.existsSync(path.join(MEDIA_ABS, rel)) }; };
const thumbWeb = (o) => THUMB_DIR ? THUMB_DIR + '/' + path.basename(o.f.rel).replace(/\.[A-Za-z0-9]+$/, '') + THUMB_EXT : null;
const namaMedia = (o) => path.basename(o.f.rel).replace(/\.[A-Za-z0-9]+$/, '');
const videoPoster = (o) => { if (!VIDEO_POSTER || (o.im && o.im.kind === 'audio')) return null; const w = VIDEO_POSTER + '/' + namaMedia(o) + VIDEO_POSTER_EXT; return fs.existsSync(path.join(OUT, w)) ? w : null; };
const videoAsli = (o) => { if (!VIDEO_ASLI_REL || !o.f.ada) return null; const w = VIDEO_ASLI_REL + '/' + path.basename(o.f.rel); return o.f.web === w ? null : w; };
const AVATAR_EXT = ['png', 'jpg', 'jpeg', 'webp'];
// A room-level pair (avatars/<slug>-artist.png) wins over the shared one, so each room can show its
// own artist - and the fan's own picture in the private export.
const avWeb = (side) => {
  if (AVATAR_FILE) return side === 'artist' ? AVATAR_FILE : null;
  for (const n of [BASE + '-' + side, side]) for (const e of AVATAR_EXT) {
    const p = 'avatars/' + n + '.' + e;
    if (fs.existsSync(path.join(MEDIA_ABS, p))) return MEDIA_REL + '/' + p;
  }
  return null;
};

// ---- font emoji lokal (Noto Color Emoji, lisensi OFL-1.1) ----
// Put the files in media/fonts/. If apple-emoji.{woff2,ttf,otf} exists (your own Apple font), that one is used
// and Noto is not copied along (saves ~2 MB); the curated unicode-range is still applied so digits and punctuation do not change.
const FONT_ABS = process.env.DM_FONT || path.join(ROOT, 'media', 'fonts');
const FONT_REL = process.env.DM_FONT_REL || 'fonts';
const FONT_CSS_NAMA = 'noto-emoji-curated.css';
const cssFontPath = path.join(FONT_ABS, FONT_CSS_NAMA);
const cssFont = fs.existsSync(cssFontPath) ? fs.readFileSync(cssFontPath, 'utf8') : '';
const berkasFont = [...new Set((cssFont.match(new RegExp(FONT_REL + '/[A-Za-z0-9._-]+', 'g')) || []))].map((x) => path.basename(x));
const fontSiap = !!cssFont && berkasFont.length > 0 && berkasFont.every((f) => fs.existsSync(path.join(FONT_ABS, f)));
// The Apple font we ship is cut to the emoji shapes this archive uses, so it is offered for the
// emoji blocks only: digits and punctuation stay in the text font.
const rangeApple = "U+200D,U+20E3,U+FE0F,U+2190-21FF,U+2300-23FF,U+2460-24FF,U+25A0-27BF,U+2900-297F,U+2B00-2BFF,U+1F000-1FAFF";
const extApple = ['woff2', 'ttf', 'otf'].find((e) => fs.existsSync(path.join(FONT_ABS, 'apple-emoji.' + e))) || null;
const fontDir = path.join(OUT, FONT_REL);
if (fontSiap || extApple) {
  fs.mkdirSync(fontDir, { recursive: true });
  // This step only copies, so a build made with the other emoji font would leave its files behind
  // and every export would carry both (~5 MB). Keep only what this build really uses.
  const lis = path.join(FONT_ABS, 'LICENSE-NotoColorEmoji.txt');
  const pakai = extApple ? ['apple-emoji.' + extApple] : berkasFont.slice();
  if (!extApple && fs.existsSync(lis)) pakai.push('LICENSE-NotoColorEmoji.txt');
  for (const f of fs.readdirSync(fontDir)) if (pakai.indexOf(f) < 0) { try { fs.rmSync(path.join(fontDir, f)); } catch (e) {} }
  if (!extApple) {
    for (const f of berkasFont) fs.copyFileSync(path.join(FONT_ABS, f), path.join(fontDir, f));
    if (fs.existsSync(lis)) fs.copyFileSync(lis, path.join(fontDir, 'LICENSE-NotoColorEmoji.txt'));
  } else {
    fs.copyFileSync(path.join(FONT_ABS, 'apple-emoji.' + extApple), path.join(fontDir, 'apple-emoji.' + extApple));
  }
}

const stamp = (ms, offMin) => new Date(ms + offMin * 60000).toISOString().replace('T', ' ').slice(0, 19);
const wib = (ms) => stamp(ms, TZ_MIN(ms));  // local time according to DM_TZ / DM_TZ_OFFSET
const utc = (ms) => stamp(ms, 0);
const esc = (s) => String(s == null ? '' : s).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');

// ---- parser markup media: <dm:photo imageUrl="..." width="960" height="1280" /> ----
const parseTag = (tag) => {
  if (tag.indexOf('<dm:') !== 0) return null;
  let inner = tag.slice(4);
  if (inner.slice(-1) === '>') inner = inner.slice(0, -1);
  if (inner.slice(-1) === '/') inner = inner.slice(0, -1);
  const toks = inner.split(' ').filter(Boolean);
  const kind = toks.shift() || 'media';
  const attrs = {};
  for (const t of toks) {
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    let v = t.slice(eq + 1);
    if (v.charAt(0) === '"' && v.slice(-1) === '"') v = v.slice(1, -1);
    attrs[t.slice(0, eq)] = v;
  }
  const url = attrs.imageUrl || attrs.videoUrl || attrs.audioUrl || attrs.thumbnailUrl || attrs.url || '';
  return { kind: kind, url: url, width: attrs.width || null, height: attrs.height || null, attrs: attrs };
};

const flat = (m) => {
  const parts = Array.isArray(m.body) ? m.body : [{ value: String(m.body || '') }];
  const keepAll = [], media = [], trans = [], gifts = [];
  for (const p of parts) {
    const v = String(p.value || '');
    let keep = '', i = 0;
    for (;;) {
      const s = v.indexOf('<dm:', i);
      if (s < 0) { keep += v.slice(i); break; }
      keep += v.slice(i, s);
      const gt = v.indexOf('>', s);
      if (gt < 0) { keep += v.slice(s); break; }
      const rec = parseTag(v.slice(s, gt + 1));
      if (rec) media.push(rec);
      i = gt + 1;
    }
    const clean = keep.split(NL).map((x) => x.trim()).filter(Boolean).join(NL);
    if (clean) keepAll.push(clean);
    if (p.translatedValues && p.translatedValues.en) trans.push(p.translatedValues.en);
    if (p.extension && p.extension.gift && p.extension.gift.giftCode) gifts.push(p.extension.gift.giftCode);
  }
  return { text: keepAll.join(NL), media: media, trans: trans.join(NL), gifts: gifts };
};

// ---- read every part ----
const files = fs.readdirSync(SRC_DIR).filter((n) => n.indexOf('weverse-dm-') === 0 && n.indexOf('-part') > 0 && n.slice(-6) === '.jsonl').sort();
if (!files.length) { console.error(t("err.noParts", { dir: SRC_DIR })); process.exit(1); }
const rows = [];
const perFile = [];
for (const fn of files) {
  const lines = fs.readFileSync(path.join(SRC_DIR, fn), 'utf8').split(NL).filter((l) => l.trim());
  let n = 0, bad = 0;
  for (const l of lines) { try { rows.push(JSON.parse(l)); n++; } catch (e) { bad++; } }
  perFile.push({ file: fn, pages: n, rusak: bad });
}

// ---- collect unique messages ----
const msgs = new Map();
const roomIds = new Set();
let total = 0, dup = 0, recKosong = 0;
for (const r of rows) {
  let j = null; try { j = JSON.parse(r.body); } catch (e) { j = null; }
  const d = (j && j.data) || [];
  if (!d.length) { recKosong++; continue; }
  if (r.roomId) roomIds.add(r.roomId);
  for (const m of d) {
    if (!m || !m.messageId) continue;
    total++;
    if (msgs.has(m.messageId)) { dup++; continue; }
    msgs.set(m.messageId, m);
  }
}
const all = [...msgs.values()].sort((a, b) => (a.createDate || 0) - (b.createDate || 0));

// side filter (DM_ONLY) + text replacement (DM_RENAME); both are off by default, which keeps the old behaviour
const picked = ONLY === 'artist' ? all.filter((m) => (m.userType || '') === 'ARTIST')
  : ONLY === 'fan' ? all.filter((m) => (m.userType || '') !== 'ARTIST')
  : all;
const norm = picked.map((m) => {
  const f = flat(m);
  const c = m.createDate || 0;
  return {
    messageId: m.messageId, createDate: c, isoUtc: utc(c), isoWib: wib(c),
    userType: m.userType || null, nickname: m.nickname ? fix(m.nickname) : null, profileImageUrl: m.profileImageUrl || null,
    deleted: !!m.deleted, text: fix(f.text), textEn: f.trans ? fix(f.trans) : null, media: f.media,
    gift: f.gifts.length ? f.gifts : null, raw: fixRaw(m),
  };
});
fs.writeFileSync(path.join(OUT, JSONL_NAME), norm.map((x) => JSON.stringify(x)).join(NL) + NL, 'utf8');

const first = norm[0], last = norm[norm.length - 1];
const artist = norm.filter((x) => x.userType === 'ARTIST').length;
const withMedia = norm.filter((x) => x.media.length).length;
const deleted = norm.filter((x) => x.deleted).length;
const mediaKind = {};
for (const x of norm) for (const im of x.media) mediaKind[im.kind] = (mediaKind[im.kind] || 0) + 1;
const byMonth = new Map();
for (const x of norm) { const mo = x.isoWib.slice(0, 7); byMonth.set(mo, (byMonth.get(mo) || 0) + 1); }
const months = [...byMonth.keys()].sort();

// ---- Weverse bookmarks (optional; harvested read-only into export/bookmarks.json) ----
const BOOKMARK_JSON = process.env.DM_BOOKMARKS || path.join(OUT, 'bookmarks.json');
const BM_OFF = String(process.env.DM_BOOKMARKS || '').toLowerCase() === 'off'; // DM_BOOKMARKS=off -> no bookmark markers at all
let bmList = [], bmQuota = '';
try { if (!BM_OFF) { const bj = JSON.parse(fs.readFileSync(BOOKMARK_JSON, 'utf8')); bmList = (bj.item || []).filter((t) => t && t.messageId); bmQuota = bj.quota || bj.kuota || ''; } } catch (e) { bmList = []; }
if (RENAME.length) bmList = bmList.map((t) => Object.assign({}, t, { preview: fix(t.preview) }));
const bmAda = new Map(bmList.map((t) => [t.messageId, t]));

// ---- 2) Markdown ----
const md = [];
md.push(t("md.title", { room: ROOM_NAME, ids: [...roomIds].join(', ') }));
md.push('');
md.push(t("md.unique", { n: norm.length }));
const TZ_OFFSET_SEMUA = [...new Set(norm.map((x) => TZ_MIN(x.createDate)))].sort((a, b) => a - b);
md.push(t("md.spanLocal", { label: TZ_LABEL, offsets: TZ_OFFSET_SEMUA.length > 1 ? t("log.offsetRange", { a: tzLabelOffset(TZ_OFFSET_SEMUA[0]), b: tzLabelOffset(TZ_OFFSET_SEMUA[TZ_OFFSET_SEMUA.length - 1]) }) : tzLabelOffset(TZ_OFFSET_SEMUA[0]), a: wib(first.createDate), b: wib(last.createDate) }));
md.push(t("md.spanUtc", { a: utc(first.createDate), b: utc(last.createDate) }));
md.push(t("md.source", { files: files.length, pages: rows.length, raw: total, dup: dup }));
md.push((norm.length - artist) ? t("md.mixAll", { a: artist, f: norm.length - artist, media: withMedia, del: deleted }) : t("md.mixArtistOnly", { artist: ARTIST_NAME, a: artist, media: withMedia, del: deleted }));
if (bmList.length) md.push(t("md.bookmark", { n: bmList.length, quota: bmQuota ? t("md.bookmarkQuota", { q: bmQuota }) : "" }));
md.push('');
md.push('---');
let lastDay = '';
for (const x of norm) {
  const day = x.isoWib.slice(0, 10);
  if (day !== lastDay) { md.push(''); md.push('## ' + day); md.push(''); lastDay = day; }
  const who = x.userType === 'ARTIST' ? '**' + ARTIST_NAME + '**' : (x.nickname || t("md.fan"));
  const bm = bmAda.get(x.messageId) || null;
  let body = x.text.split(NL).join('  ' + NL);
  if (!body) body = x.media.length ? t("md.media") : (x.deleted ? t("md.deleted") : '');
  md.push('- ' + x.isoWib.slice(11, 16) + (bm ? ' ⭐' : '') + ' ' + who + ': ' + body);
  for (let i = 0; i < x.media.length; i++) {
    const im = x.media[i], f = mediaFile(x, im, i);
    if (f.ada && im.kind === 'photo') md.push(t("md.photo", { url: f.web }));
    else if (f.ada) md.push(t("md.local", { kind: im.kind, url: f.web }));
    else md.push(t("md.remote", { kind: im.kind, url: im.url }));
  }
  if (x.gift) md.push(t("md.gift", { list: x.gift.join(', ') }));
}
if (bmList.length) {
  const petaPesan = new Map(norm.map((x) => [x.messageId, x]));
  md.push('');
  md.push('---');
  md.push('');
  md.push(t("md.sectionBookmark", { n: bmList.length, quota: bmQuota ? t("md.bookmarkQuotaFrom", { q: bmQuota }) : "" }));
  md.push('');
  md.push(t("md.bookmarkNote"));
  md.push('');
  for (const bk of bmList) {
    const x = petaPesan.get(bk.messageId);
    const time = x ? x.isoWib : (bk.isoWib || '');
    const tags = [];
    if (bk.media) tags.push(t("md.bookmarkMedia", { n: bk.media }));
    if (bk.gift) tags.push(t("md.bookmarkGift"));
    if (bk.deltaHari) tags.push(t("md.bookmarkDelta", { n: bk.deltaHari }));
    md.push('- **#' + bk.bookmarkNo + '** ' + time + (tags.length ? ' (' + tags.join(', ') + ')' : '') + ' - `' + bk.messageId + '` - ' + (x ? x.text.split(NL).join(' ') : bk.preview));
  }
}
fs.writeFileSync(path.join(OUT, BASE + '.md'), md.join(NL) + NL, 'utf8');

let lok = 0, mediaTot = 0;
for (const x of norm) x.media.forEach((im, i) => { mediaTot++; if (mediaFile(x, im, i).ada) lok++; });

// ---- 3) HTML ----
const h = [];
h.push('<!doctype html><html lang="' + t.lang + '"><head><meta charset="utf-8">');
h.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
h.push('<title>' + esc(t("html.title", { room: ROOM_NAME })) + ' (' + esc([...roomIds].join(', ')) + ')</title><style>');
if (extApple) h.push('@font-face{font-family:NotoEmojiWeb;font-style:normal;font-weight:400;font-display:swap;src:url(' + FONT_REL + '/apple-emoji.' + extApple + ')' + ';unicode-range:' + rangeApple + '}');
if (fontSiap && !extApple) { h.push(cssFont.trim()); h.push(t("html.fontComment", { file: FONT_REL + '/LICENSE-NotoColorEmoji.txt' })); }
h.push('body{font-family:NotoEmojiWeb,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1115;color:#e6e6e6;margin:0;padding:24px;line-height:1.55}');
h.push('.wrap{max-width:860px;margin:0 auto}h1{font-size:20px;margin-bottom:6px}');
h.push('.meta{color:#8b93a1;font-size:13px;margin-bottom:14px}');
h.push('.nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}');
h.push('.nav a{color:#9ecbff;background:#161b24;border:1px solid #232833;border-radius:6px;padding:3px 8px;font-size:12px;text-decoration:none}');
h.push('.nav a:hover{background:#1d2531}');
h.push('.day{position:sticky;top:0;z-index:30;background:#0f1115;padding:10px 0 6px;font-size:13px;color:#8b93a1;border-bottom:1px solid #232833;margin-top:6px}');
h.push('.m{display:flex;gap:8px;align-items:flex-start;margin-top:8px}');
h.push('.m.cont{align-items:flex-start}');
h.push('.m.me{flex-direction:row-reverse}');
h.push('.m.cont{margin-top:2px}');
h.push('.day+.m{margin-top:4px}');
h.push('.col{display:flex;flex-direction:column;max-width:74%;min-width:0}');
h.push('.m.me .col{align-items:flex-end}');
h.push('.who{font-weight:600;font-size:11px;line-height:1.3;color:#9aa4b2;margin:0 4px 2px;word-break:break-word}');
h.push('.m.artist .who{color:#4da3ff}');
h.push('.m.me .who{color:#8fb8e0}');
h.push('.bub{background:#171c25;border:1px solid #232833;border-radius:14px;padding:8px 12px;white-space:pre-wrap;word-break:break-word}');
h.push('.m.artist .bub{background:#141b2b;border-color:#26374f;border-bottom-left-radius:4px}');
h.push('.m.me .bub{background:#1c3b5e;border-color:#2b5480;border-bottom-right-radius:4px}');
h.push('.m.cont .bub{border-radius:14px}');
h.push('.m.cont.artist .bub{border-top-left-radius:4px}');
h.push('.m.cont.me .bub{border-top-right-radius:4px}');
h.push('.tm{font-size:11px;color:#5f6875;flex:0 0 auto;padding-bottom:2px}');
h.push('.en{color:#cfe0f2;opacity:.72;font-size:13px;font-style:italic;margin-top:4px}');
h.push('.im{margin-top:5px;font-size:12px}.im a{color:#9ecbff}');
h.push('.av{width:32px;height:32px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#232833}');
h.push('.media{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-start;max-width:100%}');
h.push('.m.me .media{justify-content:flex-end}');
h.push('a.ph{display:block;line-height:0}');
h.push('.media img{display:block;border-radius:14px;background:#232833;max-width:min(272px,64vw);max-height:360px;width:auto;height:auto;cursor:zoom-in}');
h.push('.media.two img{max-width:min(178px,42vw)}');
h.push('.media video{display:block;border-radius:14px;background:#000;max-width:min(272px,64vw);max-height:360px;width:auto;height:auto}');
h.push('.vwrap{position:relative;display:inline-block;line-height:0}');
h.push('.vdur{position:absolute;right:8px;top:8px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;padding:1px 6px;border-radius:9px;pointer-events:none}');
h.push('.vfull{position:absolute;left:8px;bottom:9px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;padding:1px 7px;border-radius:9px;text-decoration:none}');
h.push('.vfull:hover{background:rgba(0,0,0,.85)}');
h.push('.vfull2{color:#8fb7e0;font-size:12px;text-decoration:none;white-space:nowrap;margin-left:2px}');
h.push('.vwrap video{background:#0b1219}');
h.push('.aud{display:flex;align-items:center;gap:8px;background:#0e1620;border:1px solid #22303f;border-radius:14px;padding:6px 8px}');
h.push('.media audio{width:min(240px,58vw);height:36px}');
h.push('.adur{font-size:11px;color:#8b93a1;white-space:nowrap}');
h.push('.miss{font-size:12px}');
h.push('.lb{position:fixed;inset:0;background:rgba(6,8,11,.94);display:none;align-items:center;justify-content:center;z-index:50}');
h.push('.lb.on{display:flex}');
h.push('.lb img{max-width:94vw;max-height:88vh;border-radius:10px}');
h.push('.lb button{position:absolute;background:rgba(255,255,255,.08);border:0;color:#fff;font-size:22px;width:44px;height:44px;border-radius:50%;cursor:pointer}');
h.push('.lb .x{top:16px;right:16px}.lb .pv{left:16px;top:48%}.lb .nx{right:16px;top:48%}');
h.push('.lb .ct{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);color:#98a2b3;font-size:12px}');
h.push('.gf{color:#e0b341;font-size:12px;margin-top:3px}');
h.push('.m.bm{scroll-margin-top:44px}');
h.push('.m.bm .bub{border-color:#6a5722}');
h.push('.bmk{color:#e0b341;font-size:12px;line-height:1;font-weight:700}');
h.push('.bml{margin:0 0 16px;font-size:12px;border:1px solid #232833;border-radius:8px;background:#141922;padding:6px 10px}');
h.push('.bml summary{cursor:pointer;color:#e0b341;font-weight:600;outline:none}');
h.push('.bml a{display:block;color:#9ecbff;text-decoration:none;padding:3px 0;border-top:1px solid #1b212b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
h.push('.bml a:hover{background:#1a212c}');
h.push('.bml .bn{color:#8b93a1}');
h.push('.del{color:#8b93a1;font-style:italic}');
h.push('</style></head><body><div class="wrap">');
h.push('<h1>' + esc(t("html.title", { room: ROOM_NAME })) + '</h1>');
h.push('<div class="meta">' + t("html.meta", { ids: esc([...roomIds].join(', ')), room: esc(ROOM_NAME), who: esc(ARTIST_NAME) + ' ' + artist + ((norm.length - artist) ? t("html.metaWhoMe", { n: norm.length - artist }) : ''), n: norm.length, a: esc(wib(first.createDate).slice(0, 16)), b: esc(wib(last.createDate).slice(0, 16)), tz: TZ_LABEL, pages: rows.length, files: files.length, lok: lok, tot: mediaTot }) + '</div>');
h.push('<div class="nav">' + (bmList.length ? '<a href="#bmk-1" title="' + t("html.navBookmarkTitle") + '">' + t("html.navBookmark", { n: bmList.length }) + '</a>' : '') + months.map((mo) => '<a href="#mo-' + mo + '">' + mo + ' (' + byMonth.get(mo) + ')</a>').join('') + '</div>');
if (bmList.length) {
  h.push('<details class="bml"><summary>' + t("html.bookmarkSummary", { n: bmList.length }) + '</summary>');
  for (const bk of bmList) h.push('<a href="#bmk-' + bk.bookmarkNo + '"><span class="bn">#' + bk.bookmarkNo + '</span> ' + esc(String(bk.isoWib || '').slice(0, 16)) + ' &middot; ' + esc(String(bk.preview || '')) + '</a>');
  h.push('</details>');
}
lastDay = '';
let lastMonth = '';
let prevType = null;
for (const x of norm) {
  const day = x.isoWib.slice(0, 10);
  const mo = x.isoWib.slice(0, 7);
  if (mo !== lastMonth) { h.push('<div id="mo-' + mo + '"></div>'); lastMonth = mo; }
  if (day !== lastDay) { h.push('<div class="day">' + day + ' (' + TZ_LABEL + ')</div>'); lastDay = day; prevType = null; }
  const me = x.userType !== 'ARTIST';
  const cont = prevType === x.userType;
  prevType = x.userType;
  const bm = bmAda.get(x.messageId) || null;
  h.push('<div class="' + (me ? 'm me' : 'm artist') + (cont ? ' cont' : '') + (bm ? ' bm' : '') + '"' + (bm ? ' id="bmk-' + bm.bookmarkNo + '"' : '') + '>');
  const av = avWeb(me ? 'me' : 'artist');
  h.push(av && !cont ? '<img class="av" src="' + esc(av) + '" alt="">' : '<div class="av" style="background:transparent"></div>');
  h.push('<div class="col">');
  if (!cont) h.push('<div class="who">' + esc(me ? (x.nickname || t("html.whoMe")) : ARTIST_NAME) + '</div>');
  h.push('<div class="bub">');
  if (x.deleted) h.push('<span class="del">' + esc(x.text || t("html.deleted")) + '</span>');
  else if (x.text) h.push(esc(x.text));
  if (x.textEn) h.push('<div class="en">' + esc(x.textEn) + '</div>');
  if (x.media.length) {
    const ph = [], vd = [], au = [];
    x.media.forEach((im, i) => { const o = { im: im, f: mediaFile(x, im, i) }; if (im.kind === 'photo') ph.push(o); else if (im.kind === 'audio') au.push(o); else vd.push(o); });
    if (ph.length) {
      h.push('<div class="media' + (ph.length > 1 ? ' two' : '') + '">');
      for (const o of ph) {
        if (o.f.ada) { const tb = thumbWeb(o); h.push('<a class="ph" href="' + esc(o.f.web) + '" target="_blank"' + (tb ? ' title="' + t("html.photoOpen") + '"' : '') + '><img src="' + esc(tb || o.f.web) + '" loading="lazy" decoding="async" alt="' + t("html.photoAlt") + '"></a>'); }
        else h.push('<span class="miss">[<a href="' + esc(o.im.url) + '" target="_blank" rel="noreferrer">' + t("html.photoMissing", { w: esc(o.im.width || '?'), h: esc(o.im.height || '?') }) + '</a>]</span>');
      }
      h.push('</div>');
    }
    for (const o of vd) {
      const d = o.im.attrs && o.im.attrs.duration ? String(o.im.attrs.duration) : '';
      const badge = d ? '<span class="vdur">0:' + (d.length < 2 ? '0' + d : d) + '</span>' : '';
      if (o.f.ada) { const po = videoPoster(o); const as = videoAsli(o); h.push('<div class="media"><span class="vwrap"><video src="' + esc(o.f.web) + '"' + (po ? ' poster="' + esc(po) + '"' : '') + ' controls preload="metadata" playsinline></video>' + badge + (as ? '<a class="vfull" href="' + esc(as) + '" target="_blank" rel="noreferrer">' + t("html.original") + '</a>' : '') + '</span></div>'); }
      else h.push('<span class="miss">[<a href="' + esc(o.im.url) + '" target="_blank" rel="noreferrer">' + t("html.videoMissing") + '</a>]</span>');
    }
    for (const o of au) {
      const d = o.im.attrs && o.im.attrs.duration ? String(o.im.attrs.duration) + 's' : 'voice note';
      if (o.f.ada) { const as = videoAsli(o); h.push('<div class="media"><span class="aud"><span class="ic">&#127908;</span><audio src="' + esc(o.f.web) + '" controls preload="metadata"></audio>' + (as ? '<a class="vfull2" href="' + esc(as) + '" target="_blank" rel="noreferrer">' + t("html.original") + '</a>' : '') + '</span></div>'); }
      else h.push('<span class="miss">[<a href="' + esc(o.im.url) + '" target="_blank" rel="noreferrer">' + t("html.voiceMissing") + '</a>]</span>');
    }
  }
  if (x.gift) h.push('<div class="gf">' + t("html.gift") + esc(x.gift.join(', ')) + '</div>');
  h.push('</div></div>');
  h.push('<div class="tm">' + (bm ? '<span class="bmk" title="' + t("html.bookmarkTitle", { n: bm.bookmarkNo }) + '">&#9733;</span> ' : '') + esc(x.isoWib.slice(11, 16)) + '</div>');
  h.push('</div>');
}
h.push('<div class="lb" id="lb"><img id="lbi" alt=""><button class="x" id="lbx">&times;</button><button class="pv" id="lbp">&#8249;</button><button class="nx" id="lbn">&#8250;</button><div class="ct" id="lbc"></div></div>');
h.push('<script>');
h.push('var G=[].slice.call(document.querySelectorAll("a.ph")),i=0,lb=document.getElementById("lb"),img=document.getElementById("lbi"),ct=document.getElementById("lbc");');
h.push('function tutup(){lb.classList.remove("on");img.removeAttribute("src");}');
if (THUMB_DIR) {
  h.push('function show(n){if(!G.length)return;i=(n+G.length)%G.length;var k=G[i].querySelector("img"),kecil=k?k.getAttribute("src"):"";img.onerror=function(){img.onerror=null;if(kecil&&img.getAttribute("src")!==kecil){img.setAttribute("src",kecil);ct.textContent=(i+1)+" / "+G.length+" · kecil (tanpa asli)";}};img.src=G[i].getAttribute("href");ct.textContent=(i+1)+" / "+G.length+" · asli";lb.classList.add("on");}');
} else {
  h.push('function show(n){if(!G.length)return;i=(n+G.length)%G.length;img.src=G[i].getAttribute("href");ct.textContent=(i+1)+" / "+G.length;lb.classList.add("on");}');
}
h.push('G.forEach(function(a,n){a.addEventListener("click",function(e){e.preventDefault();show(n);});});');
h.push('document.getElementById("lbx").onclick=tutup;');
h.push('document.getElementById("lbp").onclick=function(e){e.stopPropagation();show(i-1);};');
h.push('document.getElementById("lbn").onclick=function(e){e.stopPropagation();show(i+1);};');
h.push('lb.addEventListener("click",function(e){if(e.target===lb)tutup();});');
h.push('document.addEventListener("keydown",function(e){if(!lb.classList.contains("on"))return;if(e.key==="Escape")tutup();if(e.key==="ArrowLeft")show(i-1);if(e.key==="ArrowRight")show(i+1);});');
h.push('</script>');
h.push('</div></body></html>');
fs.writeFileSync(path.join(OUT, BASE + '.html'), h.join(NL), 'utf8');

// ---- 4) machine-readable summary ----
const summary = {
  generatedAt: new Date().toISOString(), sumber: SRC_DIR, out: OUT, roomIds: [...roomIds],
  part: files.length, halaman: rows.length, entriMentah: total, duplikat: dup, recordKosong: recKosong, mediaLokal: lok, mediaTotal: mediaTot, mediaDir: MEDIA_ABS,
  pesanUnik: norm.length, artist: artist, fan: norm.length - artist, denganMedia: withMedia, deleted: deleted,
  bookmark: BM_OFF ? { jumlah: 0, catatan: t("summary.bookmarkOff") } : { berkas: BOOKMARK_JSON, jumlah: bmList.length, ketemu: norm.filter((x) => bmAda.has(x.messageId)).length, kuota: bmQuota },
  mediaKind: mediaKind, bulan: months.length, perBulan: months.map((mo) => ({ bulan: mo, n: byMonth.get(mo) })),
  spanWib: [wib(first.createDate), wib(last.createDate)], spanLokal: [wib(first.createDate), wib(last.createDate)],
  tz: { zona: TZ_ZONA || null, label: TZ_LABEL, offsetMenit: TZ_MIN(last.createDate), offsetSemua: TZ_OFFSET_SEMUA },
  spanUtc: [utc(first.createDate), utc(last.createDate)],
  pesanPertama: { messageId: first.messageId, userType: first.userType, text: first.text.slice(0, 120) },
  perFile: perFile,
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2) + NL, 'utf8');

console.log(t("log.unique", { n: norm.length, raw: total, dup: dup }));
console.log(t("log.artistFan", { a: artist, f: norm.length - artist }));
console.log(t("log.withMedia", { n: withMedia, kinds: JSON.stringify(mediaKind) }));
console.log(t("log.deleted", { n: deleted, g: norm.filter((x) => x.gift).length }));
console.log(t("log.bookmark", { n: bmList.length, found: norm.filter((x) => bmAda.has(x.messageId)).length, quota: bmQuota ? t("log.bookmarkQuota", { q: bmQuota }) : "" }));
console.log((t("log.span") + TZ_LABEL).padEnd(14) + ": " + wib(first.createDate) + "  ..  " + wib(last.createDate));
console.log(t("log.tz", { label: TZ_LABEL, offsets: TZ_OFFSET_SEMUA.length > 1 ? t("log.offsetRange", { a: tzLabelOffset(TZ_OFFSET_SEMUA[0]), b: tzLabelOffset(TZ_OFFSET_SEMUA[TZ_OFFSET_SEMUA.length - 1]) }) : tzLabelOffset(TZ_OFFSET_SEMUA[0]), zone: TZ_ZONA ? t("log.zoneNamed", { z: TZ_ZONA }) : t("log.zoneFixed") }));
console.log(t("log.months", { n: months.length, a: months[0], b: months[months.length - 1] }));
console.log(t("log.output", { list: path.relative(ROOT, OUT) + '/' + JSONL_NAME + ', ' + path.relative(ROOT, OUT) + '/' + BASE + '.md, ' + path.relative(ROOT, OUT) + '/' + BASE + '.html, ' + path.relative(ROOT, OUT) + '/summary.json' }));
