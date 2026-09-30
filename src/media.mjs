// src/media.mjs -- download the photos, videos and audio an export points at.
//
// The renderer decides the file name of every item and the HTML links to that exact name, so this
// module spells the names the same way. Photos come straight from the CDN. Videos need a one-off
// "download-info" call, and that call is made from inside the page, so no token ever leaves the
// browser and nothing here has to know how to authenticate.
import fs from "node:fs";
import path from "node:path";
import { PACING, videoInfoPath, signedUrl, fetchExpr } from "./net.mjs";
import { ensureAuth } from "./cdp.mjs";

const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const extOf = (u) => {
  const x = String(u || "").split("?")[0].split(".").pop();
  return /^[A-Za-z0-9]{2,5}$/.test(x) ? x.toLowerCase() : "bin";
};

// Keep this identical to mediaFile() in src/render.mjs: a mismatch means the HTML links to a file
// that does not exist.
export function mediaRel(iso, mid, idx, kind, url) {
  const isPhoto = kind === "photo";
  return (isPhoto ? "photos/" : "video/") + String(iso).slice(0, 10) + "-" + mid + (idx ? "-" + idx : "") + "." + (isPhoto ? extOf(url) : "mp4");
}

// Every media item the rendered messages file mentions, in the order the renderer saw them.
export function readItems(jsonlPath) {
  const out = [];
  let text = "";
  try { text = fs.readFileSync(jsonlPath, "utf8"); } catch (e) { return out; }
  for (const line of text.split(NL)) {
    if (!line.trim()) continue;
    let m = null;
    try { m = JSON.parse(line); } catch (e) { continue; }
    const iso = m.isoWib || m.iso || "";
    const mid = m.messageId || m.id || "";
    const list = Array.isArray(m.media) ? m.media : [];
    for (let i = 0; i < list.length; i++) {
      const im = list[i];
      if (!im || !im.url) continue;
      out.push({ kind: im.kind === "photo" ? "photo" : "video", url: im.url, attrs: im.attrs || {}, iso: iso, mid: mid, idx: i });
    }
  }
  return out;
}

// Where a referenced file would land, and whether it is already there.
const onDiskAt = (dir, x) => { try { return fs.statSync(path.join(dir, mediaRel(x.iso, x.mid, x.idx, x.kind, x.url))).size > 0; } catch (e) { return false; } };

// The files a run would actually fetch: referenced by the export, of the requested kind, and not
// on disk yet. Exported so the command line can skip opening a browser when the answer is "none".
export function pendingItems(o) {
  const opts = o || {};
  let items = readItems(opts.jsonl);
  if (opts.kind && opts.kind !== "all") items = items.filter((x) => x.kind === opts.kind);
  if (opts.limit > 0) items = items.slice(0, opts.limit);
  return items.filter((x) => !onDiskAt(opts.mediaDir, x));
}

async function withRetry(url, headers, tries) {
  let wait = 1500;
  for (let a = 0; a < (tries || 4); a++) {
    let r = null;
    try { r = await fetch(url, { headers: headers || {} }); } catch (e) { r = null; }
    if (r && r.status === 200) return r;
    const s = r ? r.status : 0;
    if (s === 0 || s === 429 || s === 403 || s >= 500) { await sleep(wait); wait *= 2; continue; }
    return r;
  }
  return null;
}

// Download everything the export still misses. Files already on disk are left alone, so this can
// be run again after an interruption and only the gaps are filled.
export async function downloadMedia(opts) {
  const o = opts || {};
  const dir = o.mediaDir;
  const log = o.onLog || (() => {});
  const progress = o.onProgress || (() => {});
  const stop = o.shouldStop || (() => false);
  const conc = Math.max(1, o.conc || Number(process.env.DM_CONC || 3));
  const pauseMs = Number(o.pauseMs == null ? (process.env.DM_PAUSE || 140) : o.pauseMs);
  fs.mkdirSync(path.join(dir, "photos"), { recursive: true });
  fs.mkdirSync(path.join(dir, "video"), { recursive: true });

  const manifestPath = path.join(dir, "media-manifest.json");
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (e) { manifest = {}; }
  const saveManifest = () => { try { fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1)); } catch (e) {} };

  let todo = readItems(o.jsonl);
  const found = todo.length;
  if (o.kind && o.kind !== "all") todo = todo.filter((x) => x.kind === o.kind);
  if (o.limit > 0) todo = todo.slice(0, o.limit);
  // Anything already on disk is not work. When nothing is missing this asks for no session at
  // all, which keeps "wdm media" usable as a spot check long after the first run.
  const already = todo.filter((x) => onDiskAt(dir, x)).length;
  todo = todo.filter((x) => !onDiskAt(dir, x));
  log("media: " + found + " item(s) referenced, " + already + " already on disk, " + todo.length + " to fetch");
  if (!todo.length) return { ok: 0, skip: already, failed: 0, bytes: 0, total: 0, referenced: found };

  if (todo.some((x) => x.kind !== "photo")) {
    const ok = o.cdp ? await ensureAuth(o.cdp, { onLog: log, shouldStop: stop, timeoutMs: o.authTimeoutMs || 120000 }) : false;
    if (!ok) { log("media: no live session, so videos and audio are skipped this round"); todo = todo.filter((x) => x.kind === "photo"); }
  }

  const stats = { ok: 0, skip: already, failed: 0, bytes: 0, total: todo.length, referenced: found };
  let streak = 0;
  let index = 0;
  let lastTick = Date.now();

  // The largest rendition on offer. The list has no documented order, so picking by size is the
  // only honest way to ask for the best quality.
  async function infoUrl(x) {
    if (!x.attrs.videoId) return null;
    const signed = signedUrl(videoInfoPath(o.roomId, x.attrs.videoId, x.mid), Date.now());
    let res = null;
    try { res = JSON.parse(await o.cdp.evaluate(fetchExpr(signed.url), 45000)); } catch (e) { return null; }
    if (!res || res.s !== 200) return null;
    let arr = null;
    try { arr = JSON.parse(JSON.parse(res.text).downloadInfo); } catch (e) { return null; }
    if (!Array.isArray(arr) || !arr.length) return null;
    if (arr.length > 1) log("media: " + arr.length + " renditions offered for " + x.mid + ", taking the largest");
    const best = arr.slice().sort((a, b) => (Number(b && b.size) || 0) - (Number(a && a.size) || 0))[0];
    return best && best.url ? best.url : null;
  }

  async function one(x) {
    const rel = mediaRel(x.iso, x.mid, x.idx, x.kind, x.url);
    const dest = path.join(dir, rel);
    const key = String(x.url).split("?")[0];
    try { if (fs.statSync(dest).size > 0) { stats.skip++; manifest[key] = { file: rel, bytes: fs.statSync(dest).size, kind: x.kind, status: "present" }; return; } } catch (e) {}
    let url = x.url;
    if (x.kind !== "photo") {
      url = await infoUrl(x);
      if (!url) { stats.failed++; streak++; manifest[key] = { status: "no-download-info" }; return; }
      await sleep(900);
    }
    const r = await withRetry(url, { Referer: "https://weverse.io/" });
    if (!r) { stats.failed++; streak++; manifest[key] = { status: "http-error" }; return; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    stats.ok++; stats.bytes += buf.length; streak = 0;
    manifest[key] = { file: rel, bytes: buf.length, kind: x.kind, status: "ok" };
  }

  const worker = async () => {
    while (index < todo.length) {
      if (stop()) return;
      if (streak >= 10) { log("media: stopping after 10 failures in a row"); return; }
      const x = todo[index++];
      try { await one(x); } catch (e) { stats.failed++; streak++; }
      if ((stats.ok + stats.skip) % 25 === 0) saveManifest();
      if (Date.now() - lastTick > 5000) { lastTick = Date.now(); progress({ done: stats.ok + stats.skip, total: todo.length, ok: stats.ok, skip: stats.skip, failed: stats.failed, bytes: stats.bytes }); }
      await sleep(pauseMs);
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  saveManifest();
  log("media done: " + stats.ok + " downloaded, " + stats.skip + " already there, " + stats.failed + " failed (" + fmtSize(stats.bytes) + ")");
  return stats;
}
