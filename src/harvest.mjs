// src/harvest.mjs -- walk one room history backwards, one signed GET per page.
//
// Shape of the archive on disk: append-only JSONL parts in downloads/, one line per page. Every
// line keeps the raw response body, so the renderer never has to ask the network again and a
// finished harvest stays the single source of truth.
import fs from "node:fs";
import path from "node:path";
import { SENTINEL, PACING, requestFor, fetchExpr, parsePage, nextCursor, wentBack, statusAction, gap } from "./net.mjs";
import { ensureAuth } from "./cdp.mjs";

const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const partName = (tag, i) => tag + "-part" + String(i).padStart(3, "0") + ".jsonl";

// What is already on disk: every message id we have seen, the oldest and newest createDate, and
// the highest part number. Any room-name tag counts, so a folder harvested by an older build
// keeps working and the walk continues where it stopped instead of starting over.

// Every message carries the fan's nickname, so the artist's own name is not in the payload - but the
// picture is: profileImageUrl on the ARTIST side is the artist. Saving it right after a harvest means a
// room is ready to render with a face, without a separate step.
export async function saveArtistPhoto(o) {
  const opts = o || {};
  const log = opts.onLog || (() => {});
  const dir = opts.dir, mediaDir = opts.mediaDir, slug = opts.slug;
  if (!dir || !mediaDir || !slug) return null;
  const dest = path.join(mediaDir, "avatars");
  for (const ext of ["png", "jpg", "jpeg", "webp"]) if (fs.existsSync(path.join(dest, slug + "-artist." + ext))) return null;
  let files = [];
  try { files = fs.readdirSync(dir).filter((n) => /-part\d+\.jsonl$/.test(n)).sort(); } catch (e) { return null; }
  let url = null;
  for (const f of files) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) { continue; }
    for (const line of text.split(NL)) {
      if (!line) continue;
      let rec = null;
      try { rec = JSON.parse(line); } catch (e) { continue; }
      let page = null;
      try { page = parsePage(rec.body); } catch (e) { continue; }
      for (const m of page.data || []) {
        if (String(m.userType || "").toUpperCase() === "ARTIST" && m.profileImageUrl) { url = String(m.profileImageUrl); break; }
      }
      if (url) break;
    }
    if (url) break;
  }
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { Referer: "https://weverse.io/", "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) { log("artist photo: http " + res.status); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    const kind = String(res.headers.get("content-type") || "").toLowerCase();
    const ext = kind.indexOf("png") >= 0 ? "png" : kind.indexOf("webp") >= 0 ? "webp" : "jpg";
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, slug + "-artist." + ext), buf);
    log("artist photo saved: avatars/" + slug + "-artist." + ext + " (" + Math.round(buf.length / 1024) + " KB)");
    return slug + "-artist." + ext;
  } catch (e) { log("artist photo failed: " + String(e.message || e)); return null; }
}
export function readArchive(dir) {
  const out = { seen: new Set(), nicks: new Set(), ids: 0, deepest: null, newest: null, pages: 0, maxPart: 0, bytes: 0, files: [] };
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl")); } catch (e) { return out; }
  for (const n of names.sort()) {
    const m = n.match(/part(\d+)\.jsonl$/);
    if (m) { const idx = Number(m[1]); if (idx > out.maxPart) out.maxPart = idx; }
    let text = "";
    try { text = fs.readFileSync(path.join(dir, n), "utf8"); } catch (e) { continue; }
    out.bytes += Buffer.byteLength(text, "utf8");
    out.files.push(n);
    for (const line of text.split(NL)) {
      if (!line.trim()) continue;
      let rec = null;
      try { rec = JSON.parse(line); } catch (e) { continue; }
      out.pages++;
      if (rec.oldest != null && (out.deepest == null || rec.oldest < out.deepest)) out.deepest = rec.oldest;
      if (rec.newest != null && (out.newest == null || rec.newest > out.newest)) out.newest = rec.newest;
      let body = null;
      try { body = JSON.parse(rec.body || "null"); } catch (e) { body = null; }
      const data = body && Array.isArray(body.data) ? body.data : [];
      for (const msg of data) {
        // The messages the fan sent carry their own nickname; that is how the public export knows
        // which name to hide without the user typing it.
        if (msg && msg.nickname && String(msg.userType || "").toUpperCase() !== "ARTIST") out.nicks.add(String(msg.nickname));
        if (msg && msg.messageId && !out.seen.has(msg.messageId)) { out.seen.add(msg.messageId); out.ids++; }
      }
    }
  }
  return out;
}

// Walk backwards until the history runs out. Returns a plain summary; every interesting event is
// reported through onProgress as it happens, so the GUI can show it immediately.
export async function harvest(opts) {
  const o = opts || {};
  const roomId = o.roomId;
  const tag = o.tag || ("weverse-dm-" + roomId);
  const dir = o.outDir;
  const cdp = o.cdp;
  const log = o.onLog || (() => {});
  const progress = o.onProgress || (() => {});
  const stop = o.shouldStop || (() => false);
  const maxPages = o.maxPages || 5000;
  const maxPagesGiven = o.maxPages != null;
  const pagesPerPart = o.pagesPerPart || PACING.pagesPerPart;
  const budgetMs = o.budgetMs || 9 * 3600 * 1000;
  fs.mkdirSync(dir, { recursive: true });

  const before = readArchive(dir);
  // The starting count has to be taken now: before.seen is the dedup set and grows during the walk,
  // so comparing it with the re-read archive at the end would always report zero new messages.
  const seenAtStart = before.seen.size;
  let cursor = before.deepest != null ? String(before.deepest) : SENTINEL;
  let partIdx = before.maxPart + 1;
  let partPages = 0;
  let pages = 0, written = 0, fails = 0, badStatus = 0, hardFails = 0, writeFails = 0, endReached = false, prevOldest = null;
  const t0 = Date.now();
  log("archive: " + before.files.length + " part file(s), " + before.seen.size + " message id(s), oldest " + (before.deepest == null ? "none" : new Date(before.deepest).toISOString()));
  if (before.pages > 0) log("resuming from cursor " + cursor + " (part " + partIdx + ")");

  // Messages that arrived since the last run sit above the newest line on disk, and the walk below
  // only ever asks for pages older than the oldest one. On its own that means a room which has been
  // walked back to its first message can never pick up a new DM again: prev at the oldest message
  // answers with an empty page and the run writes nothing. So catch up forwards first, from the
  // newest message on disk, and only then carry on into the past.
  let caught = 0, caughtIds = 0;
  if (before.newest != null && PACING.catchUpPages > 0) {
    let forward = String(before.newest);
    log("catching up from " + new Date(before.newest).toISOString() + " (newest on disk)");
    for (let i = 0; i < PACING.catchUpPages && pages < maxPages; i++) {
      if (stop()) break;
      if ((Date.now() - t0) > budgetMs) { log("catch-up stopped: out of time"); break; }
      const req = requestFor("after", roomId, forward, Date.now());
      let res = null;
      try { res = JSON.parse(await cdp.evaluate(fetchExpr(req.url), 60000)); } catch (e) { res = { err: String(e.message || e) }; }
      if (!res || res.err) { log("catch-up stopped: " + String((res && res.err) || "no answer").slice(0, 140)); break; }
      if (res.s !== 200) { log("catch-up stopped: http " + res.s); break; }
      let page = null;
      try { page = parsePage(res.text); } catch (e) { log("catch-up stopped: unreadable page (" + String(e.message || e).slice(0, 120) + ")"); break; }
      if (!page.data.length) { log("catch-up: nothing newer in the room"); break; }
      // The walk runs forwards from a message already on disk, so the first page that carries
      // nothing new is the seam: everything above it is archived already.
      const fresh = page.messageIds.filter((id) => !before.seen.has(id));
      if (!fresh.length) { log("catch-up: nothing newer than the archive"); break; }
      const rec = {
        roomId: roomId, dir: "after", cursor: forward, capturedAt: Date.now(),
        msgCount: page.data.length, oldest: page.oldest, newest: page.newest, newIds: fresh.length,
        url: req.url, body: res.text,
      };
      try {
        fs.appendFileSync(path.join(dir, partName(tag, partIdx)), JSON.stringify(rec) + NL);
      } catch (e) { log("catch-up stopped: the archive folder cannot be written to (" + String(e.message || e) + ")"); break; }
      for (const id of fresh) before.seen.add(id);
      written++; pages++; partPages++; caught++; caughtIds += fresh.length;
      if (partPages >= pagesPerPart) { partIdx++; partPages = 0; }
      progress({ pages: pages, maxPages: maxPagesGiven ? maxPages : null, part: partIdx, cursor: forward, got: page.data.length, newIds: fresh.length, uniq: before.seen.size, oldest: page.oldest, newest: page.newest, bytes: before.bytes, catchUp: true });
      if (page.after == null) { log("catch-up: the newest message is on disk"); break; }
      forward = page.after;
      await sleep(gap());
    }
    if (caught) log("catch-up: " + caughtIds + " new message(s) in " + caught + " page(s)");
  }

  progress({ maxPages: maxPagesGiven ? maxPages : null, pages: 0, uniq: before.seen.size });
  while (pages < maxPages && (Date.now() - t0) < budgetMs) {
    if (stop()) { log("stopped by request"); break; }
    const req = requestFor("prev", roomId, cursor, Date.now());
    let res = null;
    try { res = JSON.parse(await cdp.evaluate(fetchExpr(req.url), 60000)); } catch (e) { res = { err: String(e.message || e) }; }
    if (!res || res.err) {
      fails++; hardFails++;
      log("page failed (" + fails + "/" + PACING.maxConsecutiveFailures + "): " + String((res && res.err) || "no answer").slice(0, 140));
      // Re-authing clears the short counter above, so a second one that never clears keeps a broken
      // session from spending the whole time budget on requests that cannot answer.
      if (hardFails >= PACING.maxConsecutiveFailures * 4) { log("stopping: " + hardFails + " page requests in a row got no usable answer"); break; }
      if (fails >= PACING.maxConsecutiveFailures) { fails = 0; await ensureAuth(cdp, { onLog: log, shouldStop: stop, timeoutMs: 60000 }); }
      await sleep(5000);
      continue;
    }
    if (res.s !== 200) {
      const action = statusAction(res.s);
      log("http " + res.s + " -> " + action);
      if (action === "stop") { log("stopping: the API said no (" + res.s + "); nothing else is sent"); break; }
      if (action === "reauth") await ensureAuth(cdp, { onLog: log, shouldStop: stop, timeoutMs: 90000 });
      badStatus++;
      await sleep(3500);
      if (badStatus > PACING.maxBadStatus) { log("stopping: too many failed responses"); break; }
      continue;
    }
    fails = 0; badStatus = 0; hardFails = 0;
    let page = null;
    try { page = parsePage(res.text); } catch (e) {
      hardFails++;
      log("could not parse the page (" + hardFails + "/" + (PACING.maxConsecutiveFailures * 4) + "): " + String(e.message || e).slice(0, 120));
      if (hardFails >= PACING.maxConsecutiveFailures * 4) { log("stopping: pages kept failing to parse"); break; }
      await sleep(4000);
      continue;
    }

    // A stale or bogus cursor makes the server quietly answer with the newest page instead of an
    // error. Going backwards is the whole point, so if the page is not older than the last one we
    // stop rather than loop on the same data forever.
    if (!wentBack(page, prevOldest)) {
      log("stopping: page is not older than the previous one (oldest " + page.oldest + " vs " + prevOldest + ")");
      endReached = true;
      break;
    }

    let newIds = 0;
    const freshIds = [];
    for (const id of page.messageIds) if (!before.seen.has(id)) { freshIds.push(id); newIds++; }
    const rec = {
      roomId: roomId, dir: "prev", cursor: cursor, capturedAt: Date.now(),
      msgCount: page.data.length, oldest: page.oldest, newest: page.newest, newIds: newIds,
      url: req.url, body: res.text,
    };
    // The page only counts once it is on disk: a failed write leaves the cursor where it is, so the
    // same page is asked for again instead of being skipped for good.
    try {
      fs.appendFileSync(path.join(dir, partName(tag, partIdx)), JSON.stringify(rec) + NL);
      written++; writeFails = 0;
    } catch (e) {
      writeFails++;
      log("write failed (" + writeFails + "/" + PACING.maxConsecutiveFailures + "): " + String(e.message || e));
      if (writeFails >= PACING.maxConsecutiveFailures) { log("stopping: the archive folder cannot be written to"); break; }
      await sleep(5000);
      continue;
    }
    for (const id of freshIds) before.seen.add(id);
    pages++; partPages++;
    prevOldest = page.oldest;
    progress({ pages: pages, maxPages: maxPagesGiven ? maxPages : null, part: partIdx, cursor: cursor, got: page.data.length, newIds: newIds, uniq: before.seen.size, oldest: page.oldest, newest: page.newest, bytes: before.bytes });
    if (partPages >= pagesPerPart) { partIdx++; partPages = 0; }

    const next = nextCursor(page, cursor);
    if (next == null) { endReached = true; log("reached the start of the room after " + pages + " page(s)"); break; }
    cursor = next;
    await sleep(gap());
  }

  const after = readArchive(dir);
  const summary = { roomId: roomId, pages: pages, written: written, ids: after.seen.size, newIds: after.seen.size - seenAtStart, caughtUp: caught, caughtUpIds: caughtIds, deepest: after.deepest, newest: after.newest, endReached: endReached, partIdx: partIdx, elapsedMs: Date.now() - t0 };
  log("harvest done: " + summary.pages + " page(s), " + summary.newIds + " new message(s), " + (summary.endReached ? "start of room reached" : "stopped early"));
  return summary;
}

// --- self-test -------------------------------------------------------------
// node src/harvest.mjs --check   Runs the catch-up against a stubbed page source: no browser, no
// network, no sign-in. This is the regression test for a room that stopped picking up new messages
// because the walk only ever looked into the past.

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/harvest.mjs");
if (isMain && process.argv.includes("--check")) {
  const os = await import("node:os");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wdm-harvest-"));
  const TAG = "weverse-dm-test";
  let bad = 0;
  const cek = (ok, label) => { if (!ok) bad++; console.log((ok ? "ok   " : "FAIL ") + label); };
  const halaman = (msgs, prev, after) => JSON.stringify({
    data: msgs.map((m) => ({ messageId: m[0], createDate: m[1], userType: "ARTIST", text: "x" })),
    paging: {
      previousParams: prev == null ? null : { prev: String(prev) },
      nextParams: after == null ? null : { after: String(after) },
    },
  });
  const rec = (body, n) => JSON.stringify({ roomId: "WRAAAAA", dir: "prev", cursor: SENTINEL, msgCount: 2, oldest: 1000, newest: 2000, body: body }) + NL;
  fs.writeFileSync(path.join(root, TAG + "-part001.jsonl"), rec(halaman([["A", 1000], ["B", 2000]], 1000, 2000)));

  // The stub answers from the cursor in the URL the way the API does: after walks forwards in
  // hundred-message pages, prev walks backwards, and a page with nothing left comes back empty.
  const stub = {
    evaluate: async (expr) => {
      const a = Number((expr.match(/after=(\d+)/) || [])[1]);
      let body = halaman([], null, null);          // prev: past the first message of the room
      if (a === 2000) body = halaman([["C", 3000], ["D", 4000]], 3000, 4000);
      if (a === 4000) body = halaman([["B", 2000], ["C", 3000], ["D", 4000]], 2000, 4000);
      return JSON.stringify({ s: 200, len: body.length, text: body });
    },
  };

  const run1 = await harvest({ roomId: "WRAAAAA", tag: TAG, outDir: root, cdp: stub, onLog: () => {}, maxPages: 10 });
  cek(run1.caughtUp === 1 && run1.caughtUpIds === 2, "run 1 writes the 2 new messages in 1 page (" + run1.caughtUp + "/" + run1.caughtUpIds + ")");
  cek(fs.readdirSync(root).filter((n) => n.endsWith(".jsonl")).length === 2, "run 1 adds one part file");

  const run2 = await harvest({ roomId: "WRAAAAA", tag: TAG, outDir: root, cdp: stub, onLog: () => {}, maxPages: 10 });
  cek(run2.caughtUp === 0 && run2.caughtUpIds === 0, "run 2 with nothing new writes nothing (" + run2.caughtUp + "/" + run2.caughtUpIds + ")");
  cek(fs.readdirSync(root).filter((n) => n.endsWith(".jsonl")).length === 2, "run 2 adds no part file");
  cek(readArchive(root).seen.size === 4, "the archive holds 4 unique ids (" + readArchive(root).seen.size + ")");

  fs.rmSync(root, { recursive: true, force: true });
  console.log(bad ? "FAIL: " + bad + " problem(s)" : "OK: catch-up walks forwards and stops at what is already on disk");
  process.exit(bad ? 1 : 0);
}
