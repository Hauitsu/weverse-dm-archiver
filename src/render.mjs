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

// Day headings read the way the app writes them: "Sat, Sep 26, 2026". The locale that owns the
// dictionary decides the wording, so Korean gets "2026년 9월 26일 (토)" and Indonesian "Sab, 26 Sep 2026".
// The date is built at noon UTC so the weekday never depends on the machine time zone.
const LOCALE_HARI = { en: "en-US", ko: "ko-KR", id: "id-ID" }[t.lang] || t.lang;
const fmtHari = new Intl.DateTimeFormat(LOCALE_HARI, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const labelHari = (day) => { try { return fmtHari.format(new Date(day + "T12:00:00Z")); } catch (e) { return day; } };

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

// ---- gift cover: a gift bubble is drawn as the real Weverse cover (box + ribbon + bow) ----
// The art lives in media/gift/: <variant>.png is the ribbon, <variant>-bow.png is the bow.
// Without those files the page falls back to the plain "[gift] CODE" caption.
const GIFT_DIR = path.join(MEDIA_ABS, 'gift');
const GIFT_VARIANT = { NORMAL: 'normal', CHRISTMAS: 'christmas', VALENTINE: 'valentine', CHILDRENSDAY: 'children' };
const GIFT_WARNA = { normal: ['#fc54af', '#ff7fc4'], christmas: ['#006d52', '#008e6b'], valentine: ['#d70645', '#fb3570'], children: ['#1dda6e', '#3aea86'] };
const bacaB64 = (f) => { try { return fs.readFileSync(path.join(GIFT_DIR, f)).toString('base64'); } catch (e) { return null; } };
const giftAset = {};
for (const kode of Object.keys(GIFT_VARIANT)) {
  const v = GIFT_VARIANT[kode];
  const pita = bacaB64(v + '.png'), bow = bacaB64(v + '-bow.png');
  if (pita && bow) giftAset[kode] = { pita: pita, bow: bow, warna: GIFT_WARNA[v] || GIFT_WARNA.normal };
}
const giftAda = Object.keys(giftAset).length > 0;

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
    // The same gift is often reported twice inside one message; keeping it once stops the caption
    // from reading "NORMAL, NORMAL".
    if (p.extension && p.extension.gift && p.extension.gift.giftCode && gifts.indexOf(p.extension.gift.giftCode) < 0) gifts.push(p.extension.gift.giftCode);
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

// A bookmark normally carries its message id, so nothing has to be guessed. An older file that only
// has a preview and a date (a panel scan, before bookmarks moved into the page) is resolved the honest
// way instead: the same day first, where the date alone is evidence enough for a short message like
// "ah", then up to three days around it with a prefix of the text to go on. Anything ambiguous is left
// out rather than guessed.
function geserHari(iso, delta) {
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function skorCocok(teks, preview) {
  const a = String(teks || '').replace(/\s+/g, ' ').trim();
  const b = String(preview || '').replace(/\s+/g, ' ').trim();
  if (!a || !b) return 0;
  if (a === b) return 100000 + a.length;
  if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return Math.min(a.length, b.length);
  let i = 0;
  while (i < a.length && i < b.length && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i >= 8 ? i : 0;   // a truncated preview still shares its opening words
}
function resolvePanel(items, msgs) {
  const perHari = new Map();
  for (const x of msgs) { const d = x.isoWib.slice(0, 10); if (!perHari.has(d)) perHari.set(d, []); perHari.get(d).push(x); }
  const pakai = new Set();
  return items.map((t) => {
    const kosong = { bookmarkNo: t.bookmarkNo || 0, preview: t.preview || '', tanggalTampil: t.tanggalTampil || '', messageId: null, mode: 'panel' };
    const angka = String(kosong.tanggalTampil).replace(/[^0-9]/g, '');
    if (!kosong.preview || angka.length !== 8) return kosong;
    const dasar = angka.slice(0, 4) + '-' + angka.slice(4, 6) + '-' + angka.slice(6, 8);
    for (let j = 0; j <= 3; j++) {
      for (const tanda of (j === 0 ? [0] : [j, -j])) {
        let juara = null, skor = 0, seri = 0;
        for (const x of (perHari.get(geserHari(dasar, tanda)) || [])) {
          if (pakai.has(x.messageId)) continue;
          const s = skorCocok(x.text, kosong.preview);
          if (s > skor) { skor = s; juara = x; seri = 1; } else if (s && s === skor) seri++;
        }
        const cukup = tanda === 0 ? skor > 0 : skor >= 8;
        if (juara && cukup && seri === 1) {
          pakai.add(juara.messageId);
          return Object.assign({}, kosong, { messageId: juara.messageId, isoWib: juara.isoWib, media: juara.media.length, gift: juara.gift ? juara.gift.length : 0, deltaHari: Math.abs(tanda), mode: skor >= 100000 ? 'tepat' : 'awalan' });
        }
      }
    }
    return kosong;
  });
}

// ---- Weverse bookmarks (optional; harvested read-only into export/bookmarks.json) ----
// Bookmarks are made in the browser (see src/bm.js) and exported next to the room, so the file the
// renderer bakes in is downloads/<room>/bookmarks.json; DM_BOOKMARKS can point somewhere else.
const BOOKMARK_JSON = process.env.DM_BOOKMARKS || path.join(SRC_DIR, 'bookmarks.json');
const BM_OFF = String(process.env.DM_BOOKMARKS || '').toLowerCase() === 'off'; // DM_BOOKMARKS=off -> no bookmark markers at all
let bmList = [], bmQuota = '', bmDariPanel = 0, bmNggak = 0;
try {
  if (!BM_OFF) {
    const bj = JSON.parse(fs.readFileSync(BOOKMARK_JSON, 'utf8'));
    bmQuota = bj.quota || bj.kuota || '';
    const kasar = (bj.item || []).filter((t) => t && (t.messageId || t.preview));
    bmDariPanel = kasar.filter((t) => !t.messageId).length;
    bmList = bmDariPanel ? resolvePanel(kasar, norm) : kasar.filter((t) => t.messageId);
    bmNggak = bmList.filter((t) => !t.messageId).length;
    if (bmDariPanel) console.log("bookmarks: " + bmDariPanel + " dari panel, " + (bmDariPanel - bmNggak) + " ketemu, " + bmNggak + " tidak");
  }
} catch (e) { bmList = []; }

if (RENAME.length) bmList = bmList.map((t) => Object.assign({}, t, { preview: fix(t.preview) }));
const BM_ON = !BM_OFF;                 // the public export turns the whole feature off
const idAda = new Set(norm.map((x) => x.messageId));
// Whatever list the renderer was handed is only the starting point: it is baked into the page, and
// anything you add by hand in the browser is kept on top of it. src/bm.js is the whole client side.
const bmEmbed = bmList.filter((t) => t.messageId && idAda.has(t.messageId))
  .map((t) => ({ m: t.messageId, s: t.isoWib || '', p: String(t.preview || '').slice(0, 160) }));
const BMSKRIP = fs.readFileSync(new URL('./bm.js', import.meta.url), 'utf8');
// ---- Weverse bubble colours (the swatch behind the days-together chip) --------------------------
// Ten choices in the app's own order: the swatch row keeps the app's vivid chips, the dark bubble is
// the deep colour beside it (always white letters), the light bubble is the pastel (letters picked by
// contrast, so the grey comes out white and every pastel near-black - nothing hand-kept that could
// drift). [name, swatch in the picker, dark bubble, light bubble].
const WARNA = [
  ['cyan', '#07CBC9', '#016268', '#bbf3f6'], ['hijau', '#01DC3A', '#0b5b1e', '#DAFDDA'],
  ['biru', '#2EB3FE', '#00456e', '#D9EFFF'], ['ungu', '#7540FE', '#3f3494', '#E4E3FD'],
  ['pink', '#F75AFF', '#6b236f', '#FDE0FE'], ['kuning', '#FFB600', '#6c5301', '#FFEDC6'],
  ['oren', '#FF6E01', '#7e4323', '#FFE3D6'], ['merah muda', '#FF3C7E', '#79253c', '#FEDFE4'],
  ['merah', '#FE2222', '#7b241b', '#FFE0DB'], ['abu', '#53565D', '#44474e', '#45474F'],
];
const warnaRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const warnaCahaya = (h) => { const c = warnaRgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const warnaKontras = (a, b) => { const x = Math.max(a, b), y = Math.min(a, b); return (x + 0.05) / (y + 0.05); };
const warnaGeser = (h, d) => '#' + warnaRgb(h).map((v) => Math.max(0, Math.min(255, Math.round(d > 0 ? v + (255 - v) * d : v * (1 + d))))).map((v) => v.toString(16).padStart(2, '0')).join('');
const warnaTeks = (bg) => { const L = warnaCahaya(bg); return warnaKontras(L, warnaCahaya('#101418')) >= warnaKontras(L, 1) ? '#101418' : '#ffffff'; };
// How visible the artist bubble's edge is: the smallest nudge that puts the outline exactly this far
// from the fill - toward white on a dark bubble, toward black on a pastel. One number to tune, and it
// lands the same on all ten colours instead of getting lost on the darker pastels.
const OUTLINE_KONTRAS = 1.25;
const pinggir = (bg, naik) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (warnaKontras(warnaCahaya(bg), warnaCahaya(warnaGeser(bg, naik ? mid : -mid))) < OUTLINE_KONTRAS) lo = mid; else hi = mid;
  }
  return warnaGeser(bg, naik ? hi : -hi);
};
const WARNA_PALET = WARNA.map(([nama, swatch, gelap, terang]) => {
  const lT = warnaTeks(terang);
  return {
    n: nama,
    sw: swatch,
    // Each dark bubble is white-on-deep by design, so there is nothing to calculate there; the light
    // pastels still pick their letter colour by contrast (the grey #45474F comes out white).
    dk: [gelap, pinggir(gelap, true), '#ffffff', '#dbe9fb'],
    lt: [terang, pinggir(terang, false), lT, lT === '#ffffff' ? '#dbe9fb' : '#0b4a8f'],
  };
});
const UISKRIP = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const uiData = {
  room: BASE,
  mulai: first.createDate,
  hari: t('html.chipHari'),
  P: WARNA_PALET,
  T: { warna: t('html.bubTitle'), edit: t('html.chipEdit') },
};
const bkData = {
  room: BASE, nama: ROOM_NAME, slug: BASE, k0: bmEmbed,
  S: {
    more: t("html.bmMore"), tandai: t("html.bmAdd"), buang: t("html.bmDel"), hapus: t("html.bmRemove"),
    salin: t("html.bmCopy"), waktu: t("html.bmTime"), tersalin: t("html.bmCopied"),
    kosong: t("html.bmEmpty"), ringkas: t("html.bookmarkSummary"), ringkas0: t("html.bmSum0"),
    tajuk: t("html.bookmarkTitle", { n: '{n}' }), bubble: t("html.bookmarkBubbleTitle"),
    tanggal: t("html.bookmarkDateTitle"),
    photo: t("html.bmPhoto"), video: t("html.bmVideo"), voice: t("html.bmVoice"), gift: t("html.bmGift"),
    ekspor: t("html.bmExported"), impor: t("html.bmImported"), gagal: t("html.bmBad"),
  }
};
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
  if (day !== lastDay) { md.push(''); md.push('## ' + labelHari(day)); md.push(''); lastDay = day; }
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
// The tab keeps the room so several archives stay apart; the visible header (below) does not.
  h.push('<title>' + esc(t("html.title")) + ' - ' + esc(ROOM_NAME) + ' (' + esc([...roomIds].join(', ')) + ')</title>');
// Runs before the first paint: a remembered theme is on the page before anything is drawn, so
// nobody sees a dark flash on the way to light.
h.push('<script>var WD=' + JSON.stringify(uiData) + ';(function(){var d=document.documentElement;try{var m=localStorage.getItem("wdm-tema");if(m==="light"||m==="dark")d.setAttribute("data-tema",m);var b=((JSON.parse(localStorage.getItem("wdm-bub")||"{}")||{})[WD.room])||{},c=(typeof b.c==="number"&&WD.P[b.c])?b.c:0,p=WD.P[c],v=(d.getAttribute("data-tema")==="light")?p.lt:p.dk;d.setAttribute("data-bub",p.n);d.style.setProperty("--ab",v[0]);d.style.setProperty("--abd",v[1]);d.style.setProperty("--at",v[2]);d.style.setProperty("--atl",v[3]);}catch(e){}})();</script>');
h.push('<style>');
if (extApple) h.push('@font-face{font-family:NotoEmojiWeb;font-style:normal;font-weight:400;font-display:swap;src:url(' + FONT_REL + '/apple-emoji.' + extApple + ')' + ';unicode-range:' + rangeApple + '}');
if (fontSiap && !extApple) { h.push(cssFont.trim()); h.push(t("html.fontComment", { file: FONT_REL + '/LICENSE-NotoColorEmoji.txt' })); }
h.push('body{font-family:-apple-system,Segoe UI,Roboto,sans-serif,NotoEmojiWeb;background:#000;color:#e6e6e6;margin:0;padding:24px;line-height:1.55}');
h.push('.wrap{max-width:860px;margin:0 auto}h1{font-size:20px;margin-bottom:6px}');
// The header names the backup, not the room: the room moves down under the bookmark box as a
// profile picture with its name (see .kepala). "by Hauitsu" rides along in grey.
h.push('.oleh{color:#8b93a1;font-weight:400}');
h.push('.meta{color:#8b93a1;font-size:13px;margin-bottom:14px}');
// One knob for how big the room picture is: the file is 256x256, so --pf:256px shows it 1:1.
h.push(':root{--pf:96px}');
h.push('.kepala{display:flex;align-items:center;gap:14px;margin:0 0 18px}');
h.push('.pf{display:block;flex:0 0 auto;width:var(--pf);height:var(--pf);border-radius:50%;object-fit:cover;background:#232833}');
h.push('.pf.pfi{display:flex;align-items:center;justify-content:center;font-size:calc(var(--pf) / 2.6);font-weight:600}');
h.push('.kepala .rn{font-size:17px;font-weight:600;line-height:1.25}');
h.push('.kepala .rid{color:#8b93a1;font-size:12px;margin-top:2px}');
h.push('.nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}');
h.push('.nav a{color:#9ecbff;background:#161b24;border:1px solid #232833;border-radius:6px;padding:3px 8px;font-size:12px;text-decoration:none}');
h.push('.nav a:hover{background:#1d2531}');
// The day band is sticky, so it has to wear the page colour exactly - otherwise the message
// scrolling underneath shows through as a grey seam under the date.
h.push('.day{position:sticky;top:0;z-index:30;background:#000;padding:10px 0 6px;font-size:13px;color:#8b93a1;border-bottom:1px solid #232833;margin-top:6px}');
  // In the page but out of sight: the ISO date stays reachable for find-on-page and screen readers.
  h.push('.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}');
h.push('.m{display:flex;gap:8px;align-items:flex-start;margin-top:8px}');
h.push('.m.cont{align-items:flex-start}');
h.push('.m.me{flex-direction:row-reverse}');
h.push('.m.cont{margin-top:2px}');
h.push('.day+.m{margin-top:4px}');
h.push('.col{display:flex;flex-direction:column;max-width:74%;min-width:0}');
h.push('.m.me .col{align-items:flex-end}');
h.push('.who{font-weight:600;font-size:11px;line-height:1.3;color:#666666;margin:0 4px 2px;word-break:break-word}');
h.push('.bub{background:#171c25;border:1px solid #232833;border-radius:14px;padding:6px 12px;word-break:break-word}');
h.push('.tx{white-space:pre-wrap}');
h.push('.m.artist .bub{background:var(--ab,#016268);border-color:var(--abd,#1a7277);border-bottom-left-radius:4px}');
h.push('/* Only when a colour is picked: letters, translation, links and the deleted note follow it. */');
h.push('html[data-bub] .m.artist .bub:not(.gift):not(.bare){color:var(--at)}');
h.push('html[data-bub] .m.artist .bub .en{color:var(--at);opacity:.85}');
h.push('html[data-bub] .m.artist .bub .im a{color:var(--atl)}');
h.push('html[data-bub] .m.artist .bub .del{color:var(--at);opacity:.9}');
// No outline on your own bubble: the 1px is kept but drawn transparent, so the box stays the same
// size as the artist's and nothing shifts when a colour is picked on the other side.
h.push('.m.me .bub{background:#1f1f1f;border-color:transparent;border-bottom-right-radius:4px}');
h.push('.m.cont .bub{border-radius:14px}');
h.push('.m.cont.artist .bub{border-top-left-radius:4px}');
h.push('.m.cont.me .bub{border-top-right-radius:4px}');
h.push('.tm{font-size:11px;color:#5f6875;flex:0 0 auto;padding-bottom:2px;align-self:flex-end}');
h.push('.en{color:#cfe0f2;opacity:.72;font-size:13px;font-style:italic;margin-top:4px}');
h.push('.im{margin-top:5px;font-size:12px}.im a{color:#9ecbff}');
h.push('.av{width:32px;height:32px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#232833}');
h.push('.media{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-start;max-width:100%}');
h.push('.m.me .media{justify-content:flex-end}');
h.push('a.ph{display:block;line-height:0}');
h.push('.media img{display:block;border-radius:14px;background:#232833;max-width:min(272px,64vw);max-height:360px;width:auto;height:auto;cursor:zoom-in}');
// Media without a bubble behind it, the way the app shows a photo or a video. The four-class
// selector is deliberate: it has to outrank .m.artist .bub and .m.cont.artist .bub, which set
// their own background and corner.
h.push('.m .col .bub.bare{background:none;border:0;padding:0;border-radius:0}');
h.push('.bub.bare .media:first-child{margin-top:0}');
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
if (giftAda) {
  const dasar = giftAset.NORMAL || Object.values(giftAset)[0];
  const giftPakai = new Set();
  for (const x of norm) for (const g of (x.gift || [])) giftPakai.add(String(g).toUpperCase());
  h.push('.bub.gift{position:relative}');
  h.push('.bub.gift.txt-only{min-width:150px;min-height:76px}');
  h.push('.m .bub.gift{background:#fc54af;border-color:#ff7fc4}');
  // The cover says it better than words: while it is there the caption stays in the page for a
  // screen reader and for find-on-page, but out of sight. It used to sit under the cover, one
  // layout change away from showing up again.
  h.push('.bub.gift .gf{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}');
  h.push('.gfc{position:absolute;inset:0;z-index:5;margin:0;padding:0;border:0;cursor:pointer;border-radius:inherit;background-color:#fc54af;box-shadow:inset 0 0 0 4px #ff7fc4;transition:opacity .35s ease,visibility 0s linear 0s}');
  h.push('.gfc::before{content:"";position:absolute;top:50%;left:4px;right:4px;height:14px;margin-top:-7px;background-repeat:no-repeat;background-size:100% 100%;background-image:url(data:image/png;base64,' + dasar.pita + ')}');
  h.push('.gfc::after{content:"";position:absolute;top:50%;left:50%;width:60px;height:52px;transform:translate(-50%,-50%);background-repeat:no-repeat;background-size:contain;background-image:url(data:image/png;base64,' + dasar.bow + ')}');
  h.push('.gfc:hover{filter:brightness(1.07)}');
  h.push('.gfc:focus-visible{outline:2px solid #fff;outline-offset:-6px}');
  h.push('.bub.gift.open .gfc{opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}');
  for (const kode of giftPakai) {
    const a = giftAset[kode] || dasar;
    h.push('.bub.gift[data-gift="' + kode + '"]{background:' + a.warna[0] + ';border-color:' + a.warna[1] + '}');
    h.push('.bub.gift[data-gift="' + kode + '"] .gfc{background-color:' + a.warna[0] + ';box-shadow:inset 0 0 0 4px ' + a.warna[1] + '}');
    h.push('.bub.gift[data-gift="' + kode + '"] .gfc::before{background-image:url(data:image/png;base64,' + a.pita + ')}');
    h.push('.bub.gift[data-gift="' + kode + '"] .gfc::after{background-image:url(data:image/png;base64,' + a.bow + ')}');
  }
}
h.push('.m.bm{scroll-margin-top:44px}');
// (the bookmark ring lives with the theme rules further down, after the bubble colours - see there)
h.push('.bmk{color:#e0b341;font-size:12px;line-height:1;font-weight:700}');
h.push('.bml{margin:0 0 16px;font-size:12px;border:1px solid #232833;border-radius:8px;background:#141922;padding:6px 10px}');
h.push('.bml summary{cursor:pointer;color:#e0b341;font-weight:600;outline:none}');
h.push('.bml .br{display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid #1b212b}');
h.push('.bml a{flex:1 1 auto;min-width:0;color:#9ecbff;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
h.push('.bml a:hover{background:#1a212c}');
h.push('.bml a.bd{flex:0 0 auto;color:#8b93a1;font-size:11px}');
h.push('.bml a.bd:hover{text-decoration:underline}');
h.push('.bml .bx{flex:1 1 auto;min-width:0;color:#8b93a1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
h.push('.bml .bn{color:#8b93a1}');
if (BM_ON) {
  h.push('.bml .bb{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:5px 0 3px}');
  h.push('.bml .bb button{font:inherit;font-size:11px;background:#1b212b;color:#9ecbff;border:1px solid #29313d;border-radius:6px;padding:3px 8px;cursor:pointer}');
  h.push('.bml .bb button:hover{background:#222a36}');
  h.push('.bnota{color:#8b93a1;font-size:11px}');
  h.push('.bml .bkosong{color:#8b93a1;padding:4px 0}');
  h.push('.bml .bx2{flex:0 0 auto;background:none;border:0;color:#8b93a1;cursor:pointer;font-size:14px;line-height:1;padding:0 2px}');
  h.push('.bml .bx2:hover{color:#ff9c9c}');
  h.push('.tm .bmk{margin-right:4px}');
  h.push('.dot{border:0;background:none;color:#5f6875;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;margin-left:5px;opacity:0;transition:opacity .12s}');
  h.push('.dot:hover{color:#cfd6e0}');
  // The three dots belong to the row they sit on: they fade in with the pointer, and stay put for
  // keyboards (focus) and for touch screens, which have no hover to give.
  h.push('.m:hover .dot,.m:focus-within .dot,.dot:focus-visible{opacity:1}');
  h.push('@media (hover:none){.dot{opacity:1}}');
  h.push('.mx{position:fixed;z-index:30;min-width:170px;background:#1b222d;border:1px solid #2b3441;border-radius:10px;padding:4px;box-shadow:0 10px 28px rgba(0,0,0,.5)}');
  h.push('.mx button{display:block;width:100%;text-align:left;font:inherit;font-size:13px;background:none;border:0;color:#e8ecf2;padding:7px 9px;border-radius:7px;cursor:pointer}');
  h.push('.mx button:hover{background:#262f3d}');
}
h.push('.del{color:#8b93a1;font-style:italic}');
h.push('/* Light theme. Nothing above is touched: dark stays exactly as it was, light overrides it.');
h.push('   The :not(.gift):not(.bare) guards matter - a gift keeps its pink cover and a photo keeps no');
h.push('   bubble at all, in either theme. */');
h.push('html[data-tema="light"]{color-scheme:light}');
h.push('html[data-tema="light"] body{background:#f7f8fa;color:#17181c}');
h.push('html[data-tema="light"] .meta{color:#6b7280}');
h.push('html[data-tema="light"] .oleh{color:#6b7280}');
h.push('html[data-tema="light"] .pf{background:#dfe3e8}');
h.push('html[data-tema="light"] .pf.pfi{color:#17181c}');
h.push('html[data-tema="light"] .kepala .rid{color:#6b7280}');
h.push('html[data-tema="light"] .nav a{color:#1f6feb;background:#fff;border-color:#dde3ea}');
h.push('html[data-tema="light"] .nav a:hover{background:#eef3fb}');
h.push('html[data-tema="light"] .day{background:#f7f8fa;color:#6b7280;border-bottom-color:#e3e7ec}');
h.push('html[data-tema="light"] .who{color:#666666}');
h.push('html[data-tema="light"] .bub:not(.gift):not(.bare){background:#fff;border-color:#e2e6eb}');
h.push('html[data-tema="light"] .m.artist .bub:not(.gift):not(.bare){background:var(--ab,#bbf3f6);border-color:var(--abd,#a8dbdd)}');
h.push('html[data-tema="light"] .m.me .bub:not(.gift):not(.bare){background:#f2f3f7;border-color:transparent}');
// The bookmark ring has to outrank the bubble colour above, in both themes - before this it lost on
// specificity in light mode, so bookmarked bubbles showed no ring there at all. Gift covers and bare
// media keep their own edges.
h.push('html .m.bm .bub:not(.gift):not(.bare){border-color:#6a5722}');
h.push('html[data-tema="light"] .m.bm .bub:not(.gift):not(.bare){border-color:#e0c063}');
h.push('html[data-tema="light"] .tm{color:#98a1ad}');
h.push('html[data-tema="light"] .en{color:#3f5568;opacity:1}');
h.push('html[data-tema="light"] .im a{color:#1f6feb}');
h.push('html[data-tema="light"] .av{background:#dfe3e8}');
h.push('html[data-tema="light"] .media img{background:#e8ebef}');
h.push('html[data-tema="light"] .media video{background:#e8ebef}');
h.push('html[data-tema="light"] .vwrap video{background:#e8ebef}');
h.push('html[data-tema="light"] .vfull2{color:#2f6fb3}');
h.push('html[data-tema="light"] .aud{background:#fff;border-color:#dde3ea}');
h.push('html[data-tema="light"] .adur{color:#6b7280}');
h.push('html[data-tema="light"] .gf{color:#9a6b00}');
h.push('html[data-tema="light"] .bmk{color:#9a6b00}');
h.push('html[data-tema="light"] .bml{background:#f1f3f6;border-color:#e2e6eb}');
h.push('html[data-tema="light"] .bml summary{color:#9a6b00}');
h.push('html[data-tema="light"] .bml .br{border-top-color:#e6e9ee}');
h.push('html[data-tema="light"] .bml a{color:#1f6feb}');
h.push('html[data-tema="light"] .bml a.bd{color:#6b7280}');
h.push('html[data-tema="light"] .bml a:hover{background:#e9eef6}');
h.push('html[data-tema="light"] .bml .bn{color:#6b7280}');
if (BM_ON) {
  h.push('html[data-tema="light"] .bml .bb button{background:#fff;border-color:#dde3ea;color:#1f6feb}');
  h.push('html[data-tema="light"] .bml .bb button:hover{background:#e9eef6}');
  h.push('html[data-tema="light"] .bnota,html[data-tema="light"] .bml .bkosong{color:#6b7280}');
  h.push('html[data-tema="light"] .bml .bx2{color:#98a1ad}');
  h.push('html[data-tema="light"] .dot{color:#98a1ad}');
  h.push('html[data-tema="light"] .dot:hover{color:#3c4657}');
  h.push('html[data-tema="light"] .mx{background:#fff;border-color:#dde3ea;box-shadow:0 10px 28px rgba(15,20,30,.2)}');
  h.push('html[data-tema="light"] .mx button{color:#17181c}');
  h.push('html[data-tema="light"] .mx button:hover{background:#e9eef6}');
}
h.push('html[data-tema="light"] .del{color:#8b93a1}');
h.push('/* The theme switch itself: fixed in the corner, above the page, below the lightbox. */');
h.push('.tt{position:fixed;right:14px;bottom:14px;z-index:40;display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12px;font-weight:600;line-height:1;padding:9px 13px;border-radius:999px;border:1px solid #2b3542;background:#171c25;color:#e6e6e6;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}');
h.push('.tt:hover{filter:brightness(1.08)}');
h.push('.tt:focus-visible{outline:2px solid #4da3ff;outline-offset:2px}');
h.push('html[data-tema="light"] .tt{border-color:#d8dee6;background:#fff;color:#17181c;box-shadow:0 4px 14px rgba(15,20,30,.16)}');
/* The days-together chip and its swatch row: pinned to the top-right of the conversation like the
   day header is pinned to the top-left, so the two read as one HUD while the page scrolls. Built by
   src/ui.js so the export stays lean; the colours themselves are inline styles. The row is
   transparent to the mouse - only the pill itself takes clicks - so it never blocks a message. */
h.push('.chip{position:sticky;top:var(--chip-atas,34px);z-index:31;display:flex;justify-content:flex-end;padding-top:6px;margin:0 0 6px;pointer-events:none}');
h.push('.chip .cp{pointer-events:auto;display:inline-flex;align-items:center;gap:7px;background:#171c25;border:1px solid #2b3542;border-radius:999px;padding:5px 12px 5px 6px;box-shadow:0 2px 10px rgba(0,0,0,.3)}');
// The heart button wears the colour that is picked, so the bar shows the live choice even while the
// palette is closed; the icon flips with it (white on the deep set and on the grey, near-black on a
// pastel), using the same --at the bubbles use.
h.push('.chip .hrt{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:9px;background:var(--ab,#2f9bff);cursor:pointer}');
h.push('.chip .hrt:hover{filter:brightness(1.12)}');
h.push('.chip .hrt:focus-visible{outline:2px solid #4da3ff;outline-offset:2px}');
h.push('.chip .hrt svg{display:block;width:13px;height:13px;fill:var(--at,#fff)}');
h.push('.chip .angka{font-size:13px;font-weight:700;letter-spacing:.2px;color:#e6e6e6;cursor:pointer;border-radius:4px}');
h.push('.chip .angka:focus-visible{outline:2px solid #4da3ff;outline-offset:2px}');
h.push('.chip .hari{font-size:12px;font-weight:600;color:#e6e6e6;cursor:pointer;white-space:nowrap}');
h.push('.chip .hari:focus-visible{outline:2px solid #4da3ff;outline-offset:2px;border-radius:4px}');
h.push('.chip input.hari{width:15ch;font:inherit;font-size:12px;font-weight:600;color:#e6e6e6;background:#0f1115;border:1px solid #3a4552;border-radius:7px;padding:2px 5px;outline:none}');
h.push('.chip input.hari:focus{border-color:#4da3ff}');
h.push('#wpal{position:absolute;right:0;top:calc(100% + 7px);z-index:36;display:flex;flex-wrap:wrap;align-items:center;gap:7px;max-width:min(92vw,330px);padding:9px 10px;pointer-events:auto;background:#171c25;border:1px solid #2b3542;border-radius:14px;box-shadow:0 14px 32px rgba(0,0,0,.45)}');
h.push('#wpal[hidden]{display:none}');
h.push('#wpal button.w{width:22px;height:22px;padding:0;border:0;border-radius:50%;cursor:pointer;transition:transform .08s}');
h.push('#wpal button.w:hover{transform:scale(1.1)}');
h.push('#wpal button.w[aria-pressed="true"]{box-shadow:0 0 0 2px #171c25,0 0 0 4px #4da3ff}');
h.push('html[data-tema="light"] .chip .cp{background:#fff;border-color:#e6e9ee;box-shadow:0 2px 8px rgba(15,20,30,.08)}');
h.push('html[data-tema="light"] .chip .hari{color:#17181c}');
h.push('html[data-tema="light"] .chip .angka{color:#17181c}');
h.push('html[data-tema="light"] .chip input.hari{color:#17181c;background:#fff;border-color:#bcd0ea}');
h.push('html[data-tema="light"] #wpal{background:#fff;border-color:#e2e6eb;box-shadow:0 14px 32px rgba(15,20,30,.22)}');
h.push('html[data-tema="light"] #wpal button.w[aria-pressed="true"]{box-shadow:0 0 0 2px #fff,0 0 0 4px #2f9bff}');
h.push('html{color-scheme:dark}');
h.push('</style></head><body><div class="wrap">');
h.push('<button class="tt" id="tema" type="button" aria-label="' + esc(t("html.themeLight")) + '">&#9728;&#65039; ' + esc(t("html.themeLight")) + '</button>');
// Sits next to the button so the right label is there before the message list is parsed.
h.push('<script>var TE=' + JSON.stringify({ light: t("html.themeLight"), dark: t("html.themeDark") }) + ';(function(){var d=document.documentElement,b=document.getElementById("tema");if(!b)return;function p(){var l=d.getAttribute("data-tema")==="light";var s=l?TE.dark:TE.light;b.textContent=(l?"\uD83C\uDF19 ":"\u2600\uFE0F ")+s;b.setAttribute("aria-label",s);b.title=s;}b.addEventListener("click",function(){var l=d.getAttribute("data-tema")==="light";d.setAttribute("data-tema",l?"dark":"light");try{localStorage.setItem("wdm-tema",l?"dark":"light");}catch(e){}p();});p();})();</script>');
h.push('<h1>' + esc(t("html.title")) + ' <span class="oleh">' + esc(t("html.titleBy")) + '</span></h1>');
h.push('<div class="meta">' + t("html.meta", { ids: esc([...roomIds].join(', ')), who: esc(ARTIST_NAME) + ' ' + artist + ((norm.length - artist) ? t("html.metaWhoMe", { n: norm.length - artist }) : ''), n: norm.length, a: esc(wib(first.createDate).slice(0, 16)), b: esc(wib(last.createDate).slice(0, 16)), tz: TZ_LABEL, pages: rows.length, files: files.length, lok: lok, tot: mediaTot }) + '</div>');
h.push('<div class="nav">' + months.map((mo) => '<a href="#mo-' + mo + '">' + mo + ' (' + byMonth.get(mo) + ')</a>').join('') + '</div>');
if (BM_ON) {
  // Empty until you fill it: the three dots next to a message add one, and this box lists, exports
  // and imports them. Nothing is fetched and nothing on disk is rewritten (see src/bm.js).
  h.push('<details class="bml" id="bml"><summary>' + t("html.bmSum0", { n: 0 }) + '</summary>');
  h.push('<div class="bb"><button type="button" id="bmex">' + t("html.bmExport") + '</button><button type="button" id="bmim">' + t("html.bmImport") + '</button><span class="bnota" id="bmnota"></span><input type="file" id="bmfi" accept=".json,application/json" hidden></div>');
  h.push('<div id="bmlist"><div class="bkosong">' + t("html.bmEmpty") + '</div></div></details>');
}
// The room, under the bookmark box: the artist's own picture (the file the messages use) with the
// room name beside it. With bookmarks off - the public export - it lands under the month links.
{
  const pfRoom = avWeb('artist');
  const awal = Array.from(ROOM_NAME)[0] || '?';
  h.push('<div class="kepala">' + (pfRoom
    ? '<img class="pf" src="' + esc(pfRoom) + '" alt="' + esc(ROOM_NAME) + '">'
    : '<div class="pf pfi"><span>' + esc(awal) + '</span></div>')
    + '<div class="kt"><div class="rn">' + esc(ROOM_NAME) + '</div>'
    + '<div class="rid">' + t("html.roomIds", { ids: esc([...roomIds].join(', ')) }) + '</div></div></div>');
}
lastDay = '';
let lastMonth = '';
let prevType = null;
for (const x of norm) {
  const day = x.isoWib.slice(0, 10);
  const mo = x.isoWib.slice(0, 7);
  if (mo !== lastMonth) { h.push('<div id="mo-' + mo + '"></div>'); lastMonth = mo; }
  // The day divider carries the date only: the zone is stated once, in the header at the top.
  if (day !== lastDay) { h.push('<div class="day" id="d-' + day + '"><span class="sr">' + day + '</span>' + esc(labelHari(day)) + '</div>'); lastDay = day; prevType = null; }
  const me = x.userType !== 'ARTIST';
  const cont = prevType === x.userType;
  prevType = x.userType;
  h.push('<div class="' + (me ? 'm me' : 'm artist') + (cont ? ' cont' : '') + '"' + (BM_ON ? ' data-m="' + esc(x.messageId) + '"' : '') + '>');
  const av = avWeb(me ? 'me' : 'artist');
  h.push(av && !cont ? '<img class="av" src="' + esc(av) + '" alt="">' : '<div class="av" style="background:transparent"></div>');
  h.push('<div class="col">');
  if (!cont) h.push('<div class="who">' + esc(me ? (x.nickname || t("html.whoMe")) : ARTIST_NAME) + '</div>');
  const gKode = (giftAda && x.gift && x.gift.length) ? String(x.gift[0]).toUpperCase() : '';
  // A photo or a video is the message itself, so the bubble would only be an empty frame around
  // it: those get no chrome at all and the rounded media is the whole thing. Voice notes keep
  // their bubble (the player needs a body) and so do gifts (the cover is the bubble).
  const bare = !gKode && !x.text && !x.textEn && !x.deleted && x.media.length > 0 && x.media.every((im) => im.kind !== 'audio');
  h.push('<div class="bub' + (gKode ? ' gift' + (x.media.length ? '' : ' txt-only') : '') + (bare ? ' bare' : '') + '"' + (gKode ? ' data-gift="' + esc(gKode) + '"' : '') + '>');
  if (x.deleted) h.push('<span class="del tx">' + esc(x.text || t("html.deleted")) + '</span>');
  else if (x.text) h.push('<span class="tx">' + esc(x.text) + '</span>');
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
  // No title on purpose: the cover is the message, and the same gift code arrives twice inside one
  // message, so a tooltip would read "NORMAL, NORMAL".
  if (gKode) h.push('<button class="gfc" type="button" aria-label="' + esc(t("html.giftOpen")) + '"></button>');
  h.push('</div></div>');
  const jamTeks = esc(x.isoWib.slice(11, 16));
  h.push('<div class="tm">' + (BM_ON ? '<span class="bmk"></span><span class="jam">' + jamTeks + '</span>' : jamTeks) + '</div>');
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
if (giftAda) h.push('var gfc=[].slice.call(document.querySelectorAll(".bub.gift .gfc"));gfc.forEach(function(c){c.addEventListener("click",function(){c.parentNode.classList.add("open");c.setAttribute("aria-expanded","true");});});if(location.hash==="#gift-open")gfc.forEach(function(c){c.parentNode.classList.add("open");});');
h.push('</script>');
if (BM_ON) h.push('<div class="mx" id="mx" role="menu" hidden></div>');
if (BM_ON) h.push('<script>' + BMSKRIP.split('{{BK}}').join(JSON.stringify(bkData)) + '</script>');
// Always on, in both exports: the chip is a reader-side preference, not personal chat data.
h.push('<script>' + UISKRIP + '</script>');
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
