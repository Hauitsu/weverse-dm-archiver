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
export function readArchive(dir) {
  const out = { seen: new Set(), ids: 0, deepest: null, newest: null, pages: 0, maxPart: 0, bytes: 0, files: [] };
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
      for (const msg of data) if (msg && msg.messageId && !out.seen.has(msg.messageId)) { out.seen.add(msg.messageId); out.ids++; }
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
  let pages = 0, written = 0, fails = 0, badStatus = 0, endReached = false, prevOldest = null;
  const t0 = Date.now();
  log("archive: " + before.files.length + " part file(s), " + before.seen.size + " message id(s), oldest " + (before.deepest == null ? "none" : new Date(before.deepest).toISOString()));
  if (before.pages > 0) log("resuming from cursor " + cursor + " (part " + partIdx + ")");

  while (pages < maxPages && (Date.now() - t0) < budgetMs) {
    if (stop()) { log("stopped by request"); break; }
    const req = requestFor("prev", roomId, cursor, Date.now());
    let res = null;
    try { res = JSON.parse(await cdp.evaluate(fetchExpr(req.url), 60000)); } catch (e) { res = { err: String(e.message || e) }; }
    if (!res || res.err) {
      fails++;
      log("page failed (" + fails + "/" + PACING.maxConsecutiveFailures + "): " + String((res && res.err) || "no answer").slice(0, 140));
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
    fails = 0; badStatus = 0;
    let page = null;
    try { page = parsePage(res.text); } catch (e) { log("could not parse the page: " + String(e.message || e).slice(0, 120)); await sleep(4000); continue; }

    // A stale or bogus cursor makes the server quietly answer with the newest page instead of an
    // error. Going backwards is the whole point, so if the page is not older than the last one we
    // stop rather than loop on the same data forever.
    if (!wentBack(page, prevOldest)) {
      log("stopping: page is not older than the previous one (oldest " + page.oldest + " vs " + prevOldest + ")");
      endReached = true;
      break;
    }

    let newIds = 0;
    for (const id of page.messageIds) if (!before.seen.has(id)) { before.seen.add(id); newIds++; }
    const rec = {
      roomId: roomId, dir: "prev", cursor: cursor, capturedAt: Date.now(),
      msgCount: page.data.length, oldest: page.oldest, newest: page.newest, newIds: newIds,
      url: req.url, body: res.text,
    };
    try { fs.appendFileSync(path.join(dir, partName(tag, partIdx)), JSON.stringify(rec) + NL); written++; } catch (e) { log("write failed: " + String(e.message || e)); }
    pages++; partPages++;
    prevOldest = page.oldest;
    progress({ pages: pages, part: partIdx, cursor: cursor, got: page.data.length, newIds: newIds, uniq: before.seen.size, oldest: page.oldest, newest: page.newest, bytes: before.bytes });
    if (partPages >= pagesPerPart) { partIdx++; partPages = 0; }

    const next = nextCursor(page, cursor);
    if (next == null) { endReached = true; log("reached the start of the room after " + pages + " page(s)"); break; }
    cursor = next;
    await sleep(gap());
  }

  const after = readArchive(dir);
  const summary = { roomId: roomId, pages: pages, written: written, ids: after.seen.size, newIds: after.seen.size - seenAtStart, deepest: after.deepest, newest: after.newest, endReached: endReached, partIdx: partIdx, elapsedMs: Date.now() - t0 };
  log("harvest done: " + summary.pages + " page(s), " + summary.newIds + " new message(s), " + (summary.endReached ? "start of room reached" : "stopped early"));
  return summary;
}
