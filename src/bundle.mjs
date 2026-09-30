// src/bundle.mjs -- pack one finished room into a single zip that a friend can just open.
//
// Layout inside the zip, arranged so the chat still finds its own media:
//
//   weverse-dm-<slug>/
//     README.txt          what this is, in English, Korean and Indonesian
//     index.html          double-click entry point, forwards to chat/<slug>.html
//     manifest.json       what was packed, and the checksum of the zip
//     chat/               the export itself: html, markdown, messages.jsonl, fonts
//     media/              photos and video, at the quality they were saved in
//
// Files are hard-linked into a staging folder, so packing a 2.5 GB room costs no extra disk
// space and the original archive is never modified.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeZip, collect } from "./zip.mjs";
import { loadConfig } from "./config.mjs";
import { findFfmpeg, supports, shrinkOne, pool, MAX_SIDE } from "./quality.mjs";

const NL = String.fromCharCode(10);

export function sha256File(file) {
  const h = createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.allocUnsafe(1 << 20);
  try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (n <= 0) break; h.update(buf.subarray(0, n)); } }
  finally { fs.closeSync(fd); }
  return h.digest("hex");
}

// Never overwrite a package the user may already have sent to someone.
export // The engine reports where its input and output live, so summary.json carries absolute paths. In a
// zip that is at best noise and at worst the sender folder layout, so the packaged copy gets
// relative paths instead. The copy on disk is left exactly as the renderer wrote it.
function packageSummary(src, dest, slug) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(src, "utf8")); } catch (e) { j = null; }
  if (!j || typeof j !== "object") { try { fs.copyFileSync(src, dest); } catch (e) {} return; }
  const rel = { sumber: "downloads/" + slug, out: "chat", mediaDir: "../media", media: "../media" };
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (typeof v !== "string") continue;
    if (/^[A-Za-z]:[\\/]/.test(v) || /^[\\/]{1,2}/.test(v) || v.indexOf(":\\") >= 0) j[k] = rel[k] || "";
  }
  fs.writeFileSync(dest, JSON.stringify(j, null, 2) + NL, "utf8");
}

function freeName(dir, base) {
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? base + ".zip" : base + "-v" + n + ".zip";
    if (!fs.existsSync(path.join(dir, name))) return name;
  }
  return base + "-" + Date.now() + ".zip";
}

function link(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.linkSync(src, dest); return; } catch (e) { fs.copyFileSync(src, dest); }
}

function readme(o, generatedAt) {
  const L = [];
  L.push("Weverse DM archive - " + o.roomName);
  L.push("packed " + generatedAt + " with weverse-dm-archiver");
  L.push("");
  L.push("English");
  L.push("  index.html          double-click this one; it opens the chat");
  L.push("  chat/" + o.slug + ".html   every message, photo and video in one page");
  L.push("  chat/" + o.slug + ".md     the same messages as plain text");
  L.push("  media/              the photos and videos the chat shows" + (o.low ? ", re-compressed to keep the zip small" : ""));
  L.push("  The chat works offline. Keep the folder together: if you move the HTML file");
  L.push("  out on its own, its photos will not load.");
  L.push("");
  L.push("한국어");
  L.push("  index.html 을 두 번 클릭하면 채팅이 열립니다.");
  L.push("  chat/" + o.slug + ".html 안에 모든 메시지와 사진, 영상이 들어 있습니다.");
  if (o.low) L.push("  media/ 안의 사진과 영상은 공유용으로 다시 압축되었습니다.");
  L.push("  인터넷 없이 열립니다. 폴더 전체를 그대로 두세요. HTML 파일만 따로 옮기면");
  L.push("  사진이 보이지 않습니다.");
  L.push("");
  L.push("Bahasa Indonesia");
  L.push("  index.html          klik dua kali untuk membuka obrolannya");
  L.push("  chat/" + o.slug + ".html   semua pesan, foto, dan video dalam satu halaman");
  L.push("  chat/" + o.slug + ".md     isi pesan yang sama dalam bentuk teks");
  L.push("  media/              foto dan video yang ditampilkan obrolan" + (o.low ? ", dikompres ulang supaya zip-nya kecil" : ""));
  L.push("  Bisa dibuka tanpa internet. Simpan foldernya utuh: kalau file HTML-nya dipindah");
  L.push("  sendirian, fotonya tidak akan muncul.");
  L.push("");
  if (o.credit) { L.push(o.credit); L.push(""); }
  return L.join(NL);
}

function indexHtml(o) {
  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<title>" + String(o.roomName).replace(/[<>&]/g, "") + "</title>",
    "<meta http-equiv=\"refresh\" content=\"0; url=chat/" + o.slug + ".html\">",
    "<style>body{font-family:system-ui,Segoe UI,sans-serif;margin:48px;line-height:1.6}</style>",
    "</head><body>",
    "<h1>" + String(o.roomName).replace(/[<>&]/g, "") + "</h1>",
    "<p>Opening the archive: <a href=\"chat/" + o.slug + ".html\">chat/" + o.slug + ".html</a></p>",
    "</body></html>",
  ].join(NL);
}

// The relative paths a rendered page points at, read from the page itself, so it works for whatever
// the media folder holds: photos/, video/, avatars/, or anything added later.
function mediaRefs(roomDir, slug) {
  const out = new Set();
  for (const f of [slug + ".html", slug + ".md"]) {
    let text = "";
    try { text = fs.readFileSync(path.join(roomDir, f), "utf8"); } catch (e) { continue; }
    for (const hit of text.match(/\.\.\/media\/[^"'\s)\\<>]+/g) || []) out.add(hit.slice("../media/".length));
  }
  return out;
}

// Pack one room. Returns the paths it wrote, or throws with a readable reason.
export async function bundle(opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  const slug = o.slug;
  const roomDir = o.roomDir;
  const mediaDir = o.mediaDir;
  const shareDir = o.shareDir;
  const low = !!o.lowQuality;
  const cfg = o.cfg || loadConfig();
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  const rootName = "weverse-dm-" + slug;
  const stageParent = path.join(os.tmpdir(), "wdm-share-" + slug + "-" + process.pid);
  const root = path.join(stageParent, rootName);
  fs.rmSync(stageParent, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "chat"), { recursive: true });

  const want = [slug + ".html", slug + ".md", slug + ".jsonl", "summary.json"];
  let chatFiles = 0;
  for (const name of want) {
    // The per-room copy wins: summary.json on its own is whatever room was rendered last.
    const own = name === "summary.json" && fs.existsSync(path.join(roomDir, slug + ".summary.json")) ? slug + ".summary.json" : name;
    const abs = path.join(roomDir, own);
    if (name === "summary.json" && fs.existsSync(abs)) { packageSummary(abs, path.join(root, "chat", name), slug); chatFiles++; continue; }
    if (!fs.existsSync(abs)) { if (name === slug + ".html") throw new Error("bundle: " + abs + " is missing; run a render first (the public export is built next to the private one)"); continue; }
    link(abs, path.join(root, "chat", name));
    chatFiles++;
  }
  const fontsDir = path.join(roomDir, "fonts");
  const hasFonts = fs.existsSync(fontsDir);
  if (hasFonts) for (const e of collect(fontsDir, "")) if (!e.dir) { link(e.abs, path.join(root, "chat", "fonts", path.relative(fontsDir, e.abs))); chatFiles++; }

  // Only the media this page really points at travels with it. The private export holds the other side
  // of the conversation, so media/ can hold files that have no business in a package meant for someone
  // else - unreferenced files would be invisible in the page and still shipped.
  const refs = mediaRefs(roomDir, slug);
  let mediaFiles = 0;
  let mediaBytes = 0;
  let mediaOriginal = 0;
  let refMissing = 0;
  let shrunk = 0;
  let kept = 0;
  // Low quality re-compresses the staged copy instead of hard-linking it. The archive on disk keeps
  // every original byte; only what travels inside the zip is smaller.
  const ffmpeg = low ? findFfmpeg(cfg) : "";
  const compress = low && ffmpeg !== "";
  const jobs = [];
  for (const rel of refs) {
    const abs = path.join(mediaDir, rel);
    if (!fs.existsSync(abs)) { refMissing++; continue; }
    jobs.push({ rel: rel, abs: abs });
  }
  if (low && !ffmpeg) log("warning: low quality needs ffmpeg (set ffmpegPath in config.json if it is not on PATH); the zip keeps the original media");
  else if (compress) log("quality: re-compressing up to " + jobs.length + " media file(s) to " + MAX_SIDE + "px on the long side - this is the slow part");
  let done = 0;
  await pool(jobs, compress ? 4 : 1, async (j) => {
    let size = 0;
    try { size = fs.statSync(j.abs).size; } catch (err) {}
    mediaOriginal += size;
    done++;
    if (compress && supports(j.rel)) {
      const r = await shrinkOne({ ffmpeg: ffmpeg, src: j.abs, dest: path.join(root, "media", j.rel) });
      if (r.ok) { shrunk++; mediaFiles++; mediaBytes += r.after; if (done % 250 === 0) log("quality: " + done + "/" + jobs.length + " file(s)"); return; }
      kept++;
    }
    link(j.abs, path.join(root, "media", j.rel));
    mediaFiles++;
    mediaBytes += size;
  });
  if (shrunk) log("quality: re-compressed " + shrunk + " of " + mediaFiles + " media file(s): " + (mediaOriginal / 1048576).toFixed(1) + " MB -> " + (mediaBytes / 1048576).toFixed(1) + " MB" + (kept ? " (" + kept + " would not get smaller, kept as they were)" : ""));
  if (!refs.size && fs.existsSync(mediaDir) && collect(mediaDir, "").some((e) => !e.dir && e.name !== "media-manifest.json")) {
    log("warning: the page does not point at any local media, so the package has no photos or video");
  }
  log("bundle: " + chatFiles + " archive file(s) and " + mediaFiles + " of " + refs.size + " referenced media file(s), " + (mediaBytes / 1048576).toFixed(1) + " MB" + (refMissing ? ", " + refMissing + " not on disk" : ""));

  fs.writeFileSync(path.join(root, "README.txt"), readme({ slug: slug, roomName: o.roomName || slug, credit: o.credit || "", low: low }, generatedAt), "utf8");
  fs.writeFileSync(path.join(root, "index.html"), indexHtml({ slug: slug, roomName: o.roomName || slug }), "utf8");

  fs.mkdirSync(shareDir, { recursive: true });
  const zipName = freeName(shareDir, rootName);
  const zipPath = path.join(shareDir, zipName);

  // A manifest travels inside the zip too, so whoever receives it can see what it is without
  // unpacking anything. The checksum cannot be in there (it is taken of the finished file), so it
  // lives in the .sha256 and .manifest.json alongside the zip.
  const inside = {
    archive: rootName, slug: slug, roomId: o.roomId || "", roomName: o.roomName || "", artist: o.artist || "",
    generatedAt: generatedAt, chatFiles: chatFiles, mediaFiles: mediaFiles, mediaBytes: mediaBytes,
    mediaBytesOriginal: mediaOriginal, quality: low ? "low" : "full", recompressed: shrunk, keptOriginal: kept,
    checksum: "see " + zipName + ".sha256 next to this archive",
  };
  const manifestPath = path.join(root, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(inside, null, 2) + NL, "utf8");
  const top = [rootName + "/manifest.json", rootName + "/README.txt", rootName + "/index.html"];
  const entries = [{ name: rootName + "/", abs: root, dir: true },
    { name: top[0], abs: manifestPath, dir: false },
    { name: top[1], abs: path.join(root, "README.txt"), dir: false },
    { name: top[2], abs: path.join(root, "index.html"), dir: false }]
    .concat(collect(root, rootName + "/").filter((e) => e.dir || top.indexOf(e.name) < 0));
  const zip = writeZip(zipPath, entries, { onLog: log });
  const sum = sha256File(zipPath);
  fs.writeFileSync(zipPath + ".sha256", sum + "  " + zipName + NL, "utf8");

  const manifest = Object.assign({}, inside, { entries: zip.entries, zipBytes: zip.zipBytes, zip: zipName, sha256: sum });
  delete manifest.checksum;
  fs.writeFileSync(zipPath + ".manifest.json", JSON.stringify(manifest, null, 2) + NL, "utf8");
  fs.rmSync(stageParent, { recursive: true, force: true });
  log("bundle: " + zipName + " (" + (zip.zipBytes / 1048576).toFixed(1) + " MB) sha256 " + sum.slice(0, 16) + "...");
  return { zip: zipPath, sha256: sum, bytes: zip.zipBytes, entries: zip.entries, mediaFiles: mediaFiles, mediaBytes: mediaBytes, mediaOriginal: mediaOriginal, quality: low ? "low" : "full", recompressed: shrunk, manifest: manifest };
}
