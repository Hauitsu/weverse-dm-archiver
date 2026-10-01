// src/thumbs.mjs -- the small pictures the page and the media gallery show instead of the originals.
//
// One webp per photo and one poster webp per video, named after the file they came from and written
// under media/thumbs/<same subfolder>/<same name>.webp: a thumb of photos/x.jpg is thumbs/photos/x.webp,
// so the renderer only swaps folder and extension.
//
// The work is local cpu only, it is cached (a thumb newer than its original is left alone), and the
// download loop hands every saved file over while the next one is still on the wire - which is the
// whole point: a fresh export pays no extra wait for it. Measured on one room of 1444 photos:
// 111 ms per photo (median 93; 3 ffmpeg at once measured 112 ms, so they were not faster), 2.7
// minutes of cpu in total and 29 MB on disk, 2% of the 2.18 GB it replaces.
//
// Nothing here can fail a run. A missing original, a missing ffmpeg, a file ffmpeg refuses: counted,
// logged, skipped.
import fs from "node:fs";
import path from "node:path";
import { findFfmpeg, pool, run } from "./quality.mjs";

export const THUMB_SUB = "thumbs";
export const THUMB_EXT = ".webp";
export const THUMB_WIDTH = 400;   // longest side; a smaller original is never blown up
export const THUMB_QUALITY = 78;  // libwebp -quality
// Photos and video keep their own subfolder: src/render.mjs takes one prefix for photos
// (DM_THUMB_DIR) and one for video posters (DM_VIDEO_POSTER).
export const PHOTO_SUB = "photos";
export const VIDEO_SUB = "video";

const SCALE = "scale=w='min(" + THUMB_WIDTH + ",iw)':h=-2";
const statOf = (f) => { try { return fs.statSync(f); } catch (e) { return null; } };
const slash = (s) => String(s || "").split("\\").join("/");

export const isVideoRel = (rel) => slash(rel).indexOf(VIDEO_SUB + "/") === 0;

// "off" keeps the page exactly as it was before thumbnails existed. "on" insists. Anything else is
// the default "auto": build them when ffmpeg is around, because nothing else can.
export function modeOf(cfg, ffmpeg) {
  const m = String((cfg && cfg.thumbs) || process.env.DM_THUMBS || "auto").toLowerCase();
  if (m === "off" || m === "no" || m === "false") return "off";
  return ffmpeg ? "on" : "off";
}
export const enabledFor = (cfg, ffmpeg) => modeOf(cfg, ffmpeg) === "on";

// "photos/x.jpg" -> "thumbs/photos/x.webp" (the subfolder is kept, only folder and extension move)
export function thumbRel(rel) {
  const r = slash(rel).replace(/^\/+/, "");
  const dot = r.lastIndexOf(".");
  const bare = dot > r.lastIndexOf("/") ? r.slice(0, dot) : r;
  const cut = bare.indexOf("/");
  return cut < 0
    ? THUMB_SUB + "/" + bare + THUMB_EXT
    : THUMB_SUB + "/" + bare.slice(0, cut) + "/" + bare.slice(cut + 1) + THUMB_EXT;
}
export const thumbAbs = (mediaDir, rel) => path.join(mediaDir, thumbRel(rel).split("/").join(path.sep));

// se extraSeconds: a video shorter than a second has no frame at 00:01, so the caller retries at 0.
export function argsFor(src, dest, video, atSecond) {
  const at = atSecond == null ? 1 : Number(atSecond);
  const head = ["-y", "-nostdin", "-loglevel", "error"];
  if (video) head.push("-ss", String(at));
  head.push("-i", src);
  // -map_metadata -1 drops exif and gps; ffmpeg still autorotates, so a portrait photo stays upright.
  return head.concat(["-map_metadata", "-1", "-frames:v", "1", "-vf", SCALE,
    "-c:v", "libwebp", "-quality", String(THUMB_QUALITY), dest]);
}

// One file in, one small file out. force rebuilds even when the thumb is already fresh.
export async function ensureOne(o) {
  const rel = o.rel;
  const src = path.join(o.mediaDir, slash(rel).split("/").join(path.sep));
  const dest = thumbAbs(o.mediaDir, rel);
  const video = isVideoRel(rel);
  const s = statOf(src);
  if (!s || !s.isFile() || !s.size) return { rel: rel, ok: false, why: "no original" };
  if (!o.force) {
    const d = statOf(dest);
    if (d && d.size > 0 && d.mtimeMs >= s.mtimeMs) return { rel: rel, ok: true, cached: true, bytes: d.size };
  }
  if (!o.ffmpeg) return { rel: rel, ok: false, why: "no ffmpeg" };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const timeout = Number(o.timeoutMs || 120000);
  let r = await run(o.ffmpeg, argsFor(src, dest, video), timeout, o.shouldStop);
  if (!r.ok && video) r = await run(o.ffmpeg, argsFor(src, dest, true, 0), timeout, o.shouldStop);
  const out = statOf(dest);
  if (!r.ok || !out || !out.size) {
    try { fs.rmSync(dest, { force: true }); } catch (e) {}
    return { rel: rel, ok: false, why: r.why || "no output" };
  }
  return { rel: rel, ok: true, bytes: out.size };
}

// Voice notes are saved under video/ as mp4, but they carry no picture at all, so ffmpeg would run
// and fail on every single one. media/media-manifest.json records what each file really is.
export function audioSet(mediaDir) {
  const out = new Set();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(mediaDir, "media-manifest.json"), "utf8"));
    for (const k of Object.keys(m)) {
      const e = m[k];
      if (e && e.kind === "audio" && e.file) out.add(slash(e.file));
    }
  } catch (e) {}
  return out;
}

// Every photo and video the room has on disk that can have a small copy, in folder order.
export function listMedia(mediaDir) {
  const out = [];
  const audio = audioSet(mediaDir);
  for (const sub of [PHOTO_SUB, VIDEO_SUB]) {
    let names = [];
    try { names = fs.readdirSync(path.join(mediaDir, sub)); } catch (e) { continue; }
    for (const n of names.sort()) {
      const rel = sub + "/" + n;
      if (audio.has(rel)) continue;
      const s = statOf(path.join(mediaDir, sub, n));
      if (s && s.isFile() && s.size > 0) out.push({ rel: rel, mtimeMs: s.mtimeMs });
    }
  }
  return out;
}

// What is on disk right now - for the log line, the doctor and the picker's estimate.
export function summary(mediaDir) {
  const items = listMedia(mediaDir);
  let thumbs = 0;
  let bytes = 0;
  for (const it of items) {
    const d = statOf(thumbAbs(mediaDir, it.rel));
    if (d && d.size > 0) { thumbs++; bytes += d.size; }
  }
  return { files: items.length, thumbs: thumbs, bytes: bytes };
}

// Fill in whatever is missing. One at a time on purpose: 3 ffmpeg at once measured no faster than 1,
// so extra processes would only take the cpu away from the download.
export async function buildThumbs(o) {
  const opts = o || {};
  const ffmpeg = opts.ffmpeg || findFfmpeg(opts.cfg);
  const enabled = opts.enabled == null ? enabledFor(opts.cfg, ffmpeg) : !!opts.enabled;
  const stats = { total: 0, made: 0, cached: 0, failed: 0, bytes: 0, skipped: false, ffmpeg: ffmpeg };
  if (!enabled || !ffmpeg) { stats.skipped = true; return stats; }
  let items = opts.items || listMedia(opts.mediaDir);
  if (!opts.force) {
    // A room that is already done reports "nothing to build" instead of 1478 cached hits.
    items = items.filter((it) => {
      const d = statOf(thumbAbs(opts.mediaDir, it.rel));
      return !(d && d.size > 0 && d.mtimeMs >= it.mtimeMs);
    });
  }
  stats.total = items.length;
  if (!items.length) return stats;
  const progress = opts.onProgress || (() => {});
  let done = 0;
  await pool(items, Math.max(1, Number(opts.conc || 1)), async (it) => {
    if (opts.shouldStop && opts.shouldStop()) return;
    const r = await ensureOne({ mediaDir: opts.mediaDir, rel: it.rel, ffmpeg: ffmpeg, shouldStop: opts.shouldStop, timeoutMs: opts.timeoutMs, force: opts.force });
    if (r.ok) { if (r.cached) stats.cached++; else { stats.made++; stats.bytes += r.bytes || 0; } }
    else { stats.failed++; if (opts.onLog && stats.failed <= 5) opts.onLog("thumb skipped: " + it.rel + " (" + r.why + ")"); }
    done++;
    if (done % 25 === 0 || done === items.length) progress({ done: done, total: items.length, made: stats.made, failed: stats.failed });
  });
  return stats;
}

// The download loop hands every file it saves to this queue, so the cpu work happens while the next
// file is still coming down the wire. push() never blocks; drain() waits for the last one.
export function makeQueue(o) {
  const opts = o || {};
  const stats = { queued: 0, made: 0, cached: 0, failed: 0, bytes: 0, last: "" };
  const enabled = !!opts.enabled && !!opts.ffmpeg;
  const pending = [];
  let closed = false;
  let wake = null;
  const worker = (async () => {
    for (;;) {
      if (!pending.length) {
        if (closed) return;
        await new Promise((r) => { wake = r; });
        wake = null;
        continue;
      }
      const it = pending.shift();
      let r = { ok: false, why: "skipped" };
      try {
        r = await ensureOne({ mediaDir: opts.mediaDir, rel: it.rel, ffmpeg: opts.ffmpeg, shouldStop: opts.shouldStop, timeoutMs: opts.timeoutMs });
      } catch (e) { r = { ok: false, why: String((e && e.message) || e) }; }
      if (r.ok) { if (r.cached) stats.cached++; else { stats.made++; stats.bytes += r.bytes || 0; } }
      else { stats.failed++; stats.last = it.rel + ": " + r.why; }
    }
  })();
  return {
    stats: stats,
    enabled: enabled,
    push(rel) {
      if (!enabled || !rel) return;
      stats.queued++;
      pending.push({ rel: rel });
      if (wake) { const r = wake; wake = null; r(); }
    },
    async drain() {
      closed = true;
      if (wake) { const r = wake; wake = null; r(); }
      try { await worker; } catch (e) {}
      return stats;
    },
  };
}
