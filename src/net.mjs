// src/net.mjs -- the Weverse web protocol: request signing, request shapes and status policy.
//
// Everything here is read-only. The only request this tool ever makes to Weverse is
// GET /dm/v2.0/messages, plus GET /dm/v2.0/video/<id>/download-info for media URLs.
//
// Two facts worth knowing before you change anything:
//
//  1. The web client signs every request. The signature is a base64 HMAC-SHA1 over
//     (path truncated to 255 chars) + timestamp, with a key that ships in the public web
//     bundle. It is not a user secret and it cannot read anything the logged-in browser
//     could not already read; the request still relies on the session cookie and the
//     Authorization header the app itself sends. We never read, store or log that header --
//     we only keep the last one the page produced, in memory, to replay our own GET.
//
//  2. `prev` is an opaque cursor, not a date. If you hand the server a `prev` that is not
//     a real message boundary, it silently answers with the NEWEST page instead of an
//     error. That is why the harvester must check that each page actually moved backwards
//     (see wentBack) instead of trusting the cursor alone.
import { createHmac } from "node:crypto";

export const HOST = "https://global.apis.naver.com/weverse/wevweb";
export const APP_ID = "be4d79eb8fc7bd008ee82c8ec4ff6fd4";
// Public web-client signing key: the same value is in the app bundle in every browser.
const SIGN_KEY = "1b9cb6378d959b45714bec49971ade22e6e24e42";
// Start from the largest possible cursor to walk from the newest message backwards.
export const SENTINEL = "9223372036854775807";

// Pacing and stop policy. The gap is jittered so the traffic does not look like a metronome.
export const PACING = {
  gapMinMs: 1500,
  gapMaxMs: 3000,
  pagesPerPart: 200,
  maxConsecutiveFailures: 3,
  maxBadStatus: 8,
};

// --- signing ---------------------------------------------------------------

export function sign(p, ts) {
  const payload = p.substring(0, Math.min(255, p.length)) + String(ts);
  const b64 = createHmac("sha1", SIGN_KEY).update(payload, "utf8").digest("base64");
  return { wmd: encodeURIComponent(b64), wmsgpad: String(ts) };
}

// --- request shapes --------------------------------------------------------

// Walk backwards through history, 100 messages at a time.
export function messagesPath(roomId, prev) {
  return "/dm/v2.0/messages?appId=" + APP_ID + "&language=en&os=WEB&platform=WEB&prev=" + prev +
    "&roomId=" + roomId + "&transLang=en&wpf=pc";
}

// Walk forwards, for picking up messages newer than the newest one already archived.
export function afterPath(roomId, after) {
  return "/dm/v2.0/messages?after=" + after + "&appId=" + APP_ID + "&language=en&os=WEB&platform=WEB" +
    "&roomId=" + roomId + "&transLang=en&wpf=pc";
}

// The newest page: no cursor at all. This is what the app requests when a room is opened.
export function newestPath(roomId) {
  return "/dm/v2.0/messages?appId=" + APP_ID + "&language=en&os=WEB&platform=WEB" +
    "&roomId=" + roomId + "&transLang=en&wpf=pc";
}

// Media URLs for one video or voice note. The answer is a JSON array of candidates.
export function videoInfoPath(roomId, videoId, messageId) {
  return "/dm/v2.0/video/" + videoId + "/download-info?appId=" + APP_ID + "&language=en&os=WEB" +
    "&platform=WEB&roomId=" + roomId + "&messageId=" + messageId + "&download=true&https=true&wpf=pc";
}

// Attach the signature. `mode` is "prev", "after" or "newest".
export function signedUrl(p, ts) {
  const s = sign(p, ts);
  return { url: HOST + p + "&wmd=" + s.wmd + "&wmsgpad=" + s.wmsgpad, path: p, sig: s };
}

export function requestFor(mode, roomId, cursor, ts) {
  const p = mode === "after" ? afterPath(roomId, cursor)
    : mode === "newest" ? newestPath(roomId)
      : messagesPath(roomId, cursor);
  return signedUrl(p, ts);
}

// --- in-page fetch ---------------------------------------------------------

// Capture the Authorization header the app itself sends. The page keeps exactly one
// header in memory; nothing is written to disk and nothing is logged.
export const AUTH_HOOK = [
  "(function(){",
  "  if (window.__wdmAuthHook) return 'already';",
  "  window.__wdmAuthHook = 1;",
  "  if (typeof window.__wdmTok !== 'string') window.__wdmTok = null;",
  "  var take = function (h) { try {",
  "    if (!h) return;",
  "    if (h.get) { var a = h.get('Authorization') || h.get('authorization'); if (a) window.__wdmTok = a; return; }",
  "    for (var k in h) { if (String(k).toLowerCase() === 'authorization') window.__wdmTok = h[k]; }",
  "  } catch (e) {} };",
  "  var of = window.fetch;",
  "  window.fetch = function (i, init) { try { take((init && init.headers) || (i && i.headers)); } catch (e) {} return of.apply(this, arguments); };",
  "  var os = XMLHttpRequest.prototype.setRequestHeader;",
  "  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (String(k).toLowerCase() === 'authorization') window.__wdmTok = v; } catch (e) {} return os.apply(this, arguments); };",
  "  return 'ok';",
  "})()",
].join("");

// A tiny scroll inside the message list makes the app issue a request, which is how the
// hook above gets to see a header at all. It scrolls up by 900px and never touches focus.
export const NUDGE = [
  "(function(){",
  "  var all = document.querySelectorAll('div');",
  "  for (var i = 0; i < all.length; i++) {",
  "    var c = String(all[i].className || '');",
  "    if (c.indexOf('WdmPageView') >= 0 && all[i].scrollHeight > all[i].clientHeight + 50) {",
  "      all[i].scrollTop = Math.max(0, all[i].scrollTop - 900);",
  "      return 'nudge ' + all[i].scrollTop;",
  "    }",
  "  }",
  "  return 'no-el';",
  "})()",
].join("");

export const AUTH_READY = "(typeof window.__wdmTok === 'string' && window.__wdmTok.length > 100)";

// Evaluate this inside the logged-in weverse.io tab with awaitPromise + returnByValue.
// It resolves to a JSON string so one round trip carries status, length and body.
export function fetchExpr(url) {
  return [
    "(async () => { try {",
    "  var h = {}; if (window.__wdmTok) h.Authorization = window.__wdmTok;",
    "  var r = await fetch(", JSON.stringify(url), ", { credentials: 'include', headers: h });",
    "  var t = await r.text();",
    "  return JSON.stringify({ s: r.status, len: t.length, text: t });",
    "} catch (e) { return JSON.stringify({ err: String(e).slice(0, 160) }); } })()",
  ].join("");
}

// --- responses -------------------------------------------------------------

// Parse one page. Throws on anything that is not the documented shape.
export function parsePage(text) {
  const j = JSON.parse(text);
  const data = Array.isArray(j.data) ? j.data : [];
  const pp = j.paging && j.paging.previousParams ? j.paging.previousParams.prev : null;
  const ap = j.paging && j.paging.nextParams ? j.paging.nextParams.after : null;
  return {
    data: data,
    prev: pp == null ? null : String(pp),
    after: ap == null ? null : String(ap),
    oldest: data.length ? data[data.length - 1].createDate : null,
    newest: data.length ? data[0].createDate : null,
    messageIds: data.map((m) => m && m.messageId).filter(Boolean),
  };
}

// The cursor for the next backwards page, or null when history is exhausted.
export function nextCursor(page, cursor) {
  if (!page || !page.data.length) return null;
  if (!page.prev || page.prev === cursor) return null;
  return page.prev;
}

// Did this page actually move further into the past? A `prev` the server does not
// recognise makes it answer with the newest page, so progress must be measured, not assumed.
export function wentBack(page, previousOldest) {
  if (!page || page.oldest == null) return false;
  if (previousOldest == null) return true;
  return page.oldest < previousOldest;
}

// --- status policy ---------------------------------------------------------
//
// "ok"    keep going.
// "reauth" the session went stale: re-run the hook and nudge, then retry the same page.
// "retry" transient; back off and retry the same page.
// "stop"  stop this room immediately and do not retry: 429 is rate limiting and 403 is a
//         refusal, and hammering either is exactly how an account gets flagged.
export function statusAction(status) {
  const s = Number(status);
  if (s === 200) return "ok";
  if (s === 401) return "reauth";
  if (s === 429 || s === 403) return "stop";
  if (s === 400 || s === 404 || s === 410) return "stop";
  return "retry";
}

// Jittered pause between pages. Pass a random function to keep tests deterministic.
export function gap(random) {
  const r = (random || Math.random)();
  return Math.round(PACING.gapMinMs + r * (PACING.gapMaxMs - PACING.gapMinMs));
}

// --- self test -------------------------------------------------------------
//
// Known-answer vectors captured from real, accepted requests. If sign() ever drifts,
// these fail instead of silently producing requests the server rejects.
const KAT = [
  { ts: "1790091824967", wmd: "gZl2%2FkyVIKAtjqCuAHiPsA3zkXA%3D",
    path: "/dm/v2.0/messages?appId=be4d79eb8fc7bd008ee82c8ec4ff6fd4&language=en&os=WEB&platform=WEB&prev=9223372036854775807&roomId=WRA2W0P&transLang=en&wpf=pc" },
  { ts: "1790091843052", wmd: "kBzhPrbPa2LqSnos%2Fh5%2B8AljSn4%3D",
    path: "/dm/v2.0/messages?appId=be4d79eb8fc7bd008ee82c8ec4ff6fd4&language=en&os=WEB&platform=WEB&prev=1789463057030&roomId=WRA2W0P&transLang=en&wpf=pc" },
];

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/net.mjs");
if (isMain && process.argv.includes("--check")) {
  let bad = 0;
  for (const v of KAT) {
    const got = sign(v.path, v.ts).wmd;
    const ok = got === v.wmd;
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + "ts=" + v.ts + " prev=" + (v.path.match(/prev=([^&]*)/) || [])[1]);
    if (!ok) console.log("      want " + v.wmd + "\n      got  " + got);
  }
  // Request shapes must stay byte-stable: the server is picky about parameter order.
  const shapes = [
    [messagesPath("WRAAAAA", SENTINEL), "prev=9223372036854775807"],
    [afterPath("WRAAAAA", "123"), "after=123&appId="],
    [newestPath("WRAAAAA"), "platform=WEB&roomId=WRAAAAA"],
    [videoInfoPath("WRAAAAA", "999", "111"), "/dm/v2.0/video/999/download-info?appId="],
  ];
  for (const [got, want] of shapes) {
    const ok = got.includes(want);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + "shape " + want);
  }
  console.log("status 429 -> " + statusAction(429) + " | 403 -> " + statusAction(403) + " | 401 -> " + statusAction(401) + " | 500 -> " + statusAction(500) + " | 200 -> " + statusAction(200));
  console.log("gap range -> " + gap(() => 0) + ".." + gap(() => 1));
  console.log(bad ? "FAIL: " + bad + " problem(s)" : "OK: " + KAT.length + " signature vectors, " + shapes.length + " request shapes");
  process.exit(bad ? 1 : 0);
}
