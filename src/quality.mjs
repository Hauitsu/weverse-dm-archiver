// src/quality.mjs -- re-compress the media copies that go inside a share zip.
//
// The archive itself is never touched: the caller stages the zip from a temp folder, and only those
// staged copies pass through here. Every file keeps its own name and extension, so the chat page in
// the zip still finds its own photos and video.
//
// ffmpeg does the work. When it is not installed nothing breaks: findFfmpeg() returns "" and the
// caller keeps the originals -- which is the honest thing to do, and to say out loud.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { ROOT } from "./rooms.mjs";

// 1280px on the long side is the size a phone or a laptop actually shows; anything above it is paid
// for twice (in the zip and in the download) and never seen.
export const MAX_SIDE = 1280;
export const VIDEO_CRF = 30;
export const AUDIO_KBPS = "64k";

// Photos stay in their own format so nothing in the html has to change. Value scale: ffmpeg's q:v
// runs 2 (best) to 31 (worst), so 6 sits around "high quality jpeg" for a photo the reader zooms in.
const IMAGE = { ".jpg": ["-q:v", "6"], ".jpeg": ["-q:v", "6"], ".png": ["-compression_level", "9"], ".webp": ["-quality", "70"] };
const VIDEO = { ".mp4": "h264", ".m4v": "h264", ".mov": "h264", ".webm": "vp9" };
// .wav keeps its container: aac inside a .wav file would be a lie with a working extension.
const AUDIO = { ".m4a": "aac", ".mp3": "mp3", ".ogg": "vorbis", ".opus": "opus" };

export function kindOf(file) {
  const e = path.extname(String(file)).toLowerCase();
  if (IMAGE[e]) return "image";
  if (VIDEO[e]) return "video";
  if (AUDIO[e]) return "audio";
  return "other";
}

export const supports = (file) => kindOf(file) !== "other";

// config wins, then the copy that ships with a portable download, then PATH. The probe is a real
// run, because on Windows a bare "ffmpeg" that is not installed throws ENOENT -- which is exactly
// the answer wanted here.
export function findFfmpeg(cfg) {
  const explicit = cfg && cfg.ffmpegPath ? String(cfg.ffmpegPath) : "";
  if (explicit) return fs.existsSync(explicit) ? explicit : "";
  // The portable download carries its own ffmpeg in runtime/ffmpeg, so a low quality zip works on a
  // machine with nothing installed. It is tried before PATH: that build is the one tested with.
  const bundled = path.join(ROOT, "runtime", "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fs.existsSync(bundled)) return bundled;
  try {
    const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 10000 });
    if (!r.error && r.status === 0) return "ffmpeg";
  } catch (e) {}
  return "";
}

// Only downscale: min(MAX_SIDE, iw) means a 600px photo is left at 600px instead of being blown up,
// and -2 keeps the height even (h264 needs that) with the aspect ratio intact.
const SCALE = "scale=w='min(" + MAX_SIDE + ",iw)':h=-2";

export function argsFor(src, dest, kind) {
  const ext = path.extname(src).toLowerCase();
  // -map_metadata -1 drops exif, gps and the like. ffmpeg autorotates by default, so the rotation
  // itself is baked into the pixels before the tag is thrown away -- photos still stand upright.
  const head = ["-y", "-nostdin", "-loglevel", "error", "-i", src, "-map_metadata", "-1"];
  if (kind === "image") return head.concat(["-vf", SCALE, "-frames:v", "1"], IMAGE[ext] || [], [dest]);
  if (kind === "video") {
    const v = ["-vf", SCALE, "-c:a", "aac", "-b:a", AUDIO_KBPS];
    if (VIDEO[ext] === "vp9") return head.concat(v, ["-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "5", dest]);
    return head.concat(v, ["-c:v", "libx264", "-crf", String(VIDEO_CRF), "-preset", "veryfast", "-movflags", "+faststart", dest]);
  }
  if (kind === "audio") {
    const a = AUDIO[ext];
    if (a === "mp3") return head.concat(["-vn", "-c:a", "libmp3lame", "-b:a", AUDIO_KBPS, "-ac", "1", dest]);
    if (a === "vorbis") return head.concat(["-vn", "-c:a", "libvorbis", "-q:a", "1", "-ac", "1", dest]);
    if (a === "opus") return head.concat(["-vn", "-c:a", "libopus", "-b:a", AUDIO_KBPS, "-ac", "1", dest]);
    return head.concat(["-vn", "-c:a", "aac", "-b:a", AUDIO_KBPS, "-ac", "1", dest]);
  }
  return null;
}

// shouldStop is polled while ffmpeg works: cancelling a zip kills the file being re-compressed
// within a moment instead of holding the cancel up until that file finishes on its own. Exported
// because src/thumbs.mjs runs ffmpeg the same way, one file at a time.
export function run(bin, args, timeoutMs, shouldStop) {
  return new Promise((resolve) => {
    let done = false;
    let watch = null;
    const finish = (r) => { if (watch) { clearInterval(watch); watch = null; } if (!done) { done = true; resolve(r); } };
    let p = null;
    try { p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true }); }
    catch (e) { return finish({ ok: false, why: String(e && e.message ? e.message : e) }); }
    let err = "";
    if (p.stderr) p.stderr.on("data", (b) => { if (err.length < 400) err += String(b); });
    const timer = setTimeout(() => { try { p.kill(); } catch (e) {} finish({ ok: false, why: "timed out" }); }, timeoutMs);
    if (shouldStop) watch = setInterval(() => { if (shouldStop()) { try { p.kill(); } catch (e) {} finish({ ok: false, why: "stopped" }); } }, 200);
    p.on("error", (e) => { clearTimeout(timer); finish({ ok: false, why: String(e && e.message ? e.message : e) }); });
    p.on("close", (code) => { clearTimeout(timer); finish(code === 0 ? { ok: true } : { ok: false, why: err.trim().split("\n").pop() || ("ffmpeg exit " + code) }); });
  });
}

const sizeOf = (f) => { try { return fs.statSync(f).size; } catch (e) { return 0; } };

// One file in, one smaller file out. A result that saves nothing is thrown away, so the zip never
// carries a "compressed" file that is bigger than the original.
export async function shrinkOne(o) {
  const ffmpeg = o.ffmpeg;
  const src = o.src;
  const dest = o.dest;
  const before = sizeOf(src);
  const kind = kindOf(src);
  if (!ffmpeg) return { ok: false, skipped: "no ffmpeg", kind, before };
  const args = argsFor(src, dest, kind);
  if (!args) return { ok: false, skipped: "kept as is", kind, before };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await run(ffmpeg, args, Number(o.timeoutMs || 600000), o.shouldStop);
  if (!r.ok) { try { fs.rmSync(dest, { force: true }); } catch (e) {} return { ok: false, skipped: r.why, kind, before }; }
  const after = sizeOf(dest);
  if (!after || (before && after >= before)) {
    try { fs.rmSync(dest, { force: true }); } catch (e) {}
    return { ok: false, skipped: "no gain", kind, before, after };
  }
  return { ok: true, kind, before, after };
}

// Small worker pool: transcoding is local cpu work, so a handful at a time keeps every core busy
// without starting 1500 ffmpeg processes at once.
export async function pool(items, limit, worker) {
  const list = items.slice();
  const n = Math.max(1, Number(limit) || 1);
  const runners = new Array(Math.min(n, list.length || 1)).fill(0).map(async () => {
    for (;;) {
      const item = list.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
