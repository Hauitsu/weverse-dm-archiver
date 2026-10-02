// src/cdp.mjs -- the smallest Chrome DevTools Protocol client that gets the job done.
//
// Everything the archiver sends to Weverse is sent from inside the page, with the page own
// credentials, after signing the path. This module only carries the expression over and brings
// the answer back.
import { AUTH_HOOK, NUDGE, AUTH_READY } from "./net.mjs";
import { targets } from "./browser.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until a page target shows up. The browser reports targets a moment after it starts.
export async function waitPage(port, match, ms) {
  const until = Date.now() + (ms || 20000);
  for (;;) {
    const list = await targets(port);
    const pages = list.filter((t) => t && t.type === "page" && t.webSocketDebuggerUrl);
    const hit = pages.filter((t) => String(t.url || "").indexOf(match || "weverse.io") >= 0);
    if (hit.length) return hit[0];
    // The fallback is for a target whose url is not filled in yet, not for one that simply does not
    // match: attaching to the wrong page only turns a clear "no-page" into a long, misleading wait.
    if (pages.length && !String(pages[0].url || "").trim() && Date.now() > until - (ms || 20000) / 2) return pages[0];
    if (Date.now() > until) return null;
    await sleep(400);
  }
}

// A promise per command id, with a timeout so a dead socket can never hang the run.
export async function attach(wsUrl, opts) {
  const o = opts || {};
  const ws = new WebSocket(wsUrl);
  const waiting = new Map();
  let id = 0;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("cdp: socket did not open")), 15000);
    ws.addEventListener("open", () => { clearTimeout(t); resolve(); });
    ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("cdp: socket error")); });
  });
  ws.addEventListener("message", (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (!m || !m.id || !waiting.has(m.id)) return;
    const slot = waiting.get(m.id);
    waiting.delete(m.id);
    if (m.error) slot.no(new Error(JSON.stringify(m.error))); else slot.ok(m.result);
  });
  ws.addEventListener("close", () => { for (const slot of waiting.values()) slot.no(new Error("cdp: socket closed")); waiting.clear(); });

  const send = (method, params, ms) => new Promise((ok, no) => {
    // ws.send() on a closing or closed socket is dropped without a word, so without this every request
    // would sit until its own timeout -- a minute each, and a harvest that looks frozen for a quarter of
    // an hour before it gives up with "no usable answer".
    if (ws.readyState !== 1) { no(new Error("cdp: socket is not open")); return; }
    const n = ++id;
    const t = setTimeout(() => { if (waiting.has(n)) { waiting.delete(n); no(new Error("cdp: timeout " + method)); } }, ms || 60000);
    const wrap = (f) => (x) => { clearTimeout(t); f(x); };
    waiting.set(n, { ok: wrap(ok), no: wrap(no) });
    try { ws.send(JSON.stringify({ id: n, method: method, params: params || {} })); }
    catch (e) { waiting.delete(n); no(e); }
  });

  // Evaluate an expression in the page. Returns the value, or throws with the page error text.
  const evaluate = async (expr, ms) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, ms || 60000);
    const res = (r && r.result) || {};
    if (res.subtype === "error") throw new Error(String(res.description || "page error").slice(0, 220));
    return res.value;
  };

  const close = () => { try { ws.close(); } catch (e) {} };
  return { send: send, evaluate: evaluate, close: close };
}

// The auth token itself never leaves the page: the hook keeps it in window.__wdmTok, every
// request is built and sent from inside that window (see fetchExpr in net.mjs), and nothing
// here reads it into this process. Keep it that way - it is a promise made in the README.

// Wait until the page can talk to the API on the user behalf. The hook has to be reinstalled
// after every navigation (logging in reloads the page), and a small scroll gives the site a
// reason to make the request whose Authorization header we are after.
export async function ensureAuth(cdp, opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  const stop = o.shouldStop || (() => false);
  const until = Date.now() + (o.timeoutMs || 120000);
  // The page shows an "I'm logged in" button while this waits. It cannot sign anyone in and cannot
  // skip the token check below - it only asks for the next look right now, so someone who just
  // finished signing in does not sit through the rest of a 2.5 s pause wondering if it noticed.
  // A caller whose window can disappear under it (the sign-in window: the person may close it) says so
  // here. Without this the loop below would keep probing a dead socket until its whole timeout ran out,
  // which for the GUI is ten minutes of nothing before a fresh window is opened.
  const gone = o.gone || (() => false);
  const hurry = o.hurry || (() => false);
  let round = 0;
  for (;;) {
    if (stop() || gone()) return false;
    try { if (await cdp.evaluate(AUTH_READY, 15000) === true) return true; } catch (e) {}
    try { await cdp.evaluate(AUTH_HOOK, 15000); } catch (e) {}
    round++;
    try {
      if (round % 2 === 1) await cdp.evaluate(NUDGE, 15000);
      else await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 420, deltaX: 0, deltaY: round % 4 === 0 ? -700 : 900, pointerType: "mouse" }, 10000);
    } catch (e) {}
    const asked = hurry() === true;
    if (asked && o.hurryLog) log(o.hurryLog);
    await sleep(asked ? 250 : (o.stepMs || 2500));
    try { if (await cdp.evaluate(AUTH_READY, 15000) === true) return true; } catch (e) {}
    if (round % 8 === 0) log("waiting for a Weverse login in the browser window... (" + Math.round((Date.now() - (until - (o.timeoutMs || 120000))) / 1000) + "s)");
    if (Date.now() > until) return false;
  }
}
