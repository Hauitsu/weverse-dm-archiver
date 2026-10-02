// src/browser.mjs -- find a Chromium browser, start it with a private profile, and read back the
// debugging port it chose.
//
// The archiver never reuses the profile the user browses with. It keeps its own profile under
// %LOCALAPPDATA%, so the user can stay logged in somewhere else without anything here touching
// that session, and the tool can never navigate or close a tab the user cares about.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Known install locations, best first: a brand's stable build, then that brand's side-by-side
// channels, then the next brand - and the bare executable names looked up in PATH last of all. This
// order is what "Automatic" means, so a machine that has Chrome installed still starts Chrome and
// nothing about an existing setup moves. Every entry costs one existence check, so listing channels of
// a browser nobody here installed is free: a path that is not there never shows up anywhere.
const CANDIDATES = [
  ["Chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe"],
  ["Chrome", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"],
  ["Chrome", "%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe"],
  ["Chrome Beta", "C:/Program Files/Google/Chrome Beta/Application/chrome.exe"],
  ["Chrome Dev", "%LOCALAPPDATA%/Google/Chrome Dev/Application/chrome.exe"],
  ["Chrome Canary", "%LOCALAPPDATA%/Google/Chrome SxS/Application/chrome.exe"],
  ["Edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"],
  ["Edge", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"],
  ["Edge Beta", "C:/Program Files (x86)/Microsoft/Edge Beta/Application/msedge.exe"],
  ["Edge Dev", "C:/Program Files (x86)/Microsoft/Edge Dev/Application/msedge.exe"],
  ["Edge Canary", "%LOCALAPPDATA%/Microsoft/Edge SxS/Application/msedge.exe"],
  ["Brave", "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"],
  ["Brave Beta", "C:/Program Files/BraveSoftware/Brave-Browser-Beta/Application/brave.exe"],
  ["Brave Nightly", "C:/Program Files/BraveSoftware/Brave-Browser-Nightly/Application/brave.exe"],
  ["Vivaldi", "%LOCALAPPDATA%/Vivaldi/Application/vivaldi.exe"],
  ["Chromium", "C:/Program Files/Chromium/Application/chrome.exe"],
  ["Opera", "%LOCALAPPDATA%/Programs/Opera/opera.exe"],
  ["Opera", "C:/Program Files/Opera/opera.exe"],
  ["Opera GX", "%LOCALAPPDATA%/Programs/Opera GX/opera.exe"],
  ["Opera GX", "C:/Program Files/Opera GX/opera.exe"],
  ["Opera Beta", "%LOCALAPPDATA%/Programs/Opera beta/opera.exe"],
  ["Whale", "C:/Program Files/Naver/Naver Whale/Application/whale.exe"],
  ["Whale", "%LOCALAPPDATA%/Naver/Naver Whale/Application/whale.exe"],
  ["Yandex", "%LOCALAPPDATA%/Yandex/YandexBrowser/Application/browser.exe"],
  ["Coc Coc", "%LOCALAPPDATA%/CocCoc/Browser/Application/browser.exe"],
  ["Chrome", "chrome.exe"],
  ["Edge", "msedge.exe"],
  ["Opera", "opera.exe"],
  ["Brave", "brave.exe"],
  ["Vivaldi", "vivaldi.exe"],
];

// Every process name the list above can launch, for the callers that have to recognise a window of
// one of these browsers later (a leftover process still holding the profile). It is derived from the
// CANDIDATES themselves, so adding a browser up there can never leave a caller with a stale list.
export const PROCESS_NAMES = [...new Set(CANDIDATES.map((x) => String(x[1]).split(/[\\/]/).pop().toLowerCase()))].sort();

const expand = (p) => String(p).replace(/%([A-Za-z_]+)%/g, (m, k) => process.env[k] || m);

// One spelling for one install: Windows treats "C:/x/y.exe" and "c:\x\y.exe" as the same file, so
// everything that compares paths - or counts them as one - goes through here first.
export const pathKey = (p) => String(p || "").replace(/\\/g, "/").toLowerCase();

// One separator style for one path, so the picker shows "C:\\...\\opera.exe" and not a mix of both.
const cleanPath = (p) => (process.platform === "win32" ? path.win32.normalize(p) : path.normalize(p));

// What the dropdown calls a browser. A path matching a known install is named after its brand, so the
// picker never has to show a bare "config"; anything else (a portable copy, a build nobody listed)
// keeps its own file name, which at least says which executable is about to start.
export function browserLabel(p) {
  const want = pathKey(p);
  for (const pair of CANDIDATES) {
    if (pair[1].indexOf("/") < 0) continue;
    if (pathKey(expand(pair[1])) === want) return pair[0];
  }
  let base = path.basename(String(p || ""));
  if (path.extname(base).toLowerCase() === ".exe") base = base.slice(0, -4);
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "custom";
}

// Look a bare executable name up in PATH without starting a subprocess.
function fromPath(name) {
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

// Every browser this machine could run, in the order they are tried: the path named in config first
// (so an unusual setup still wins), then the known install locations, then PATH. One list, so the
// picker in the window and findBrowser can never disagree about what is available.
function browserCandidates(cfg) {
  const out = [];
  const explicit = cfg && cfg.browserPath ? String(cfg.browserPath) : "";
  if (explicit) out.push({ name: browserLabel(explicit), path: path.resolve(expand(explicit)) });
  for (const pair of CANDIDATES) {
    const name = pair[0];
    const p = expand(pair[1]);
    if (p.indexOf("/") < 0 && p.indexOf(String.fromCharCode(92)) < 0) { const hit = fromPath(p); if (hit) out.push({ name: name, path: hit }); }
    else out.push({ name: name, path: cleanPath(p) });
  }
  return out;
}

// First browser that really exists. config.browserPath wins so unusual setups still work.
export function findBrowser(cfg) {
  for (const c of browserCandidates(cfg)) { try { if (fs.existsSync(c.path)) return c; } catch (e) {} }
  return null;
}

// Every browser that really exists here, each path once, for the Advanced picker in the window: when
// a sign-in page refuses this browser, the same page in another Chromium build is the quickest way
// around it. Order is the order they would be tried, so the first entry is what "Automatic" picks.
export function listBrowsers(cfg) {
  const seen = new Set();
  const found = [];
  for (const c of browserCandidates(cfg)) {
    const key = pathKey(c.path);
    if (seen.has(key)) continue;
    seen.add(key);
    try { if (fs.existsSync(c.path)) found.push({ name: c.name, path: c.path }); } catch (e) {}
  }
  return found;
}

// Same install, written two ways: Windows does not care about separators or letter case, and the
// picker hands back the path it found while config.json may hold the same one capitalised differently.
export function samePath(a, b) {
  return pathKey(a) === pathKey(b);
}

// The archiver profile. Deliberately outside the repo: it is machine state, not content.
export function profileDir() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(base, "weverse-dm-archiver", "profile");
}


async function freePort() {
  return await new Promise((resolve) => {
    const srv = net.createServer();
    srv.on("error", () => resolve(0));
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

// The browser writes the port on the first line of this file as soon as it is listening.
function readPortFile(file) {
  try {
    const first = String(fs.readFileSync(file, "utf8")).split(NL)[0].trim();
    const p = Number(first);
    return Number.isInteger(p) && p > 0 ? p : 0;
  } catch (e) { return 0; }
}

async function waitPortFile(file, ms) {
  const until = Date.now() + ms;
  for (;;) { const p = readPortFile(file); if (p) return p; if (Date.now() > until) return 0; await sleep(250); }
}

// Is the debugging endpoint answering yet?
export async function ready(port, ms) {
  const until = Date.now() + (ms || 10000);
  for (;;) {
    try {
      const r = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (r.ok) return await r.json();
    } catch (e) {}
    if (Date.now() > until) return null;
    await sleep(300);
  }
}

// Every page target the browser is willing to talk about.
export async function targets(port) {
  try { const r = await fetch("http://127.0.0.1:" + port + "/json/list"); if (r.ok) return await r.json(); } catch (e) {}
  return [];
}

// Weverse keeps its sign-in in session cookies - cookies with no expiry, written to the profile marked
// is_persistent=0 (measured on the owner's profile 2026-10-02) - and Chromium only writes cookies of
// that kind into the profile when the profile is set to restore the last session. That is why this
// flag is here at all. What it does NOT do is carry the sign-in across an orderly close: measured on
// this machine 2026-10-02 with the flag confirmed on the command line, a window that quits by itself
// leaves the persistent cookie on disk and drops the session one, while a window that is killed before
// it can tidy up leaves both. No hand-over restarts the browser any more, so this flag is not carrying
// a hand-over - it is here so a run that ends abruptly still finds its sign-in in the profile folder.
const SESSION_KEEP_ARG = "--restore-last-session";
const BASE_ARGS = [
  SESSION_KEEP_ARG,
  // Chromium admits to being driven as soon as the debugging port is open: measured on this machine
  // 2026-10-02, navigator.webdriver is "false" with no port, "true" with the port open and no
  // client attached at all, and "false" again with the port open plus this switch. Sign-in
  // providers read that value and turn a browser that admits it away ("this browser or app may not
  // be secure"). The window the person types into is now the same window that carries the port, so
  // the value has to stay quiet while they type. The switch only stops the browser from advertising
  // the port: nothing here types, clicks or fills anything for anyone.
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-sync",
  "--disable-extensions",
  "--disable-features=Translate,OptimizationHints",
  "--window-size=1280,900",
];

// Start the browser on a private profile and return the port its DevTools endpoint listens on.
// "--remote-debugging-port=0" asks the browser to pick a free port and report it inside the
// profile directory; if that file never shows up we fall back to a port we chose ourselves.
export async function launch(opts) {
  const o = opts || {};
  const profile = o.profile || profileDir();
  fs.mkdirSync(profile, { recursive: true });
  const portFile = path.join(profile, "DevToolsActivePort");
  const log = o.onLog || (() => {});
  const url = o.url || "https://weverse.io/";

  const start = async (port) => {
    try { fs.rmSync(portFile, { force: true }); } catch (e) {}
    const args = ["--user-data-dir=" + profile, "--remote-debugging-port=" + port].concat(BASE_ARGS, [url]);
    log("browser: " + path.basename(o.browserPath) + " (debug port " + (port === 0 ? "auto" : port) + ")");
    const proc = spawn(o.browserPath, args, { stdio: "ignore" });
    proc.on("error", (e) => log("browser error: " + String(e.message || e)));
    return proc;
  };

  let proc = await start(0);
  let port = await waitPortFile(portFile, o.portWaitMs || 15000);
  if (!port || !(await ready(port, 8000))) {
    log("browser: the automatic port did not answer, retrying on a port we picked");
    // The whole tree has to be gone before the retry: a renderer left behind keeps the profile locked,
    // and a second launch on a locked profile only hands its arguments to the instance that is still
    // there -- no fresh port opens and the run dies later pointing at the wrong thing. Not asked to
    // quit first, on purpose: nothing has been typed into this window yet, and the polite path is the
    // one that drops session cookies (see closeBrowser) - there is nothing here to be gentle about.
    killBrowser(proc);
    await waitExit(proc, 15000);
    const fixed = await freePort();
    if (!fixed) {
      // A hard-coded fallback is worse than saying so: 9333 sits inside a port range Windows keeps
      // for itself on some machines, so the retry would fail the same way and blame the browser.
      log("browser: no free debug port could be found for the retry");
      return { proc: proc, port: 0, profile: profile };
    }
    proc = await start(fixed);
    const again = (await waitPortFile(portFile, o.portWaitMs || 15000)) || fixed;
    if (!(await ready(again, 10000))) { log("browser: the second debug port did not answer either"); return { proc: proc, port: 0, profile: profile }; }
    port = again;
  }
  return { proc: proc, port: port, profile: profile };
}


// Take a browser tree down by force. taskkill takes the whole tree with it: killing only the top
// process can leave renderers behind, and they hold the profile the next launch needs.
export function killBrowser(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  killPid(proc.pid);
}

// The same, for a pid we do not hold a handle to - a browser window left behind by an earlier run.
function killPid(pid) {
  const n = Number(pid);
  if (!n) return;
  try {
    if (process.platform === "win32") { spawn("taskkill", ["/PID", String(n), "/T", "/F"], { stdio: "ignore" }); return; }
  } catch (e) {}
  try { process.kill(n, "SIGKILL"); } catch (e) {}
}

// Ask one browser process to quit, the way a person closing the window would.
function politeQuit(pid) {
  const n = Number(pid);
  if (!n) return;
  try {
    // taskkill without /F posts a close to the window: the browser runs its own shutdown, and a
    // browser that runs its own shutdown takes its renderers with it.
    if (process.platform === "win32") { spawn("taskkill", ["/PID", String(n)], { stdio: "ignore" }); return; }
  } catch (e) {}
  try { process.kill(n, "SIGTERM"); } catch (e) {}
}

// Is that process still there? A pid we did not spawn has no exit event to read, so the system has
// to be asked. EPERM means it exists and belongs to somebody else, which is not ours to close.
function alive(pid) {
  const n = Number(pid);
  if (!n) return false;
  try { process.kill(n, 0); return true; } catch (e) { return !!(e && e.code === "EPERM"); }
}

async function waitGone(pid, ms) {
  const until = Date.now() + (ms || 15000);
  for (;;) {
    if (!alive(pid)) return true;
    if (Date.now() > until) return false;
    await sleep(200);
  }
}

// Close a browser we started the way a person would: ask it to quit, give it a moment to tidy up, and
// force the tree down only when it refuses. taskkill /F takes the whole tree with it, and killing just
// the process we spawned can leave renderers behind holding the profile lock the next launch needs.
//
// Be clear about what this buys, because an earlier version of this comment got it backwards: it does
// not save a sign-in. Measured on this machine 2026-10-02, a profile holding one persistent and one
// session cookie, every window left idle long enough to flush before either close:
//   force kill  -> persistent + session cookie on disk, the next window on that profile is signed in
//   this path   -> persistent cookie only, the next window is signed out
// Chromium writes those session cookies to disk while it runs and a tidy exit is what deletes them:
// the session is over, so they go. What keeps a sign-in from one run to the next is that no run closes
// and restarts the window it signed in on (see openSession). Use this path for a tidy, polite shutdown
// - not as a way of carrying a session.
export async function closeBrowser(target, opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  // Two shapes arrive here. A ChildProcess we spawned: its exit is an event we can wait on. Or a bare
  // { pid } - a window an earlier run of the tool left behind, ours only by its command line, so
  // liveness has to be asked of the system instead. Everything below treats them the same way.
  const child = !!(target && typeof target.kill === "function");
  const pid = Number(target && target.pid);
  if (!pid) return true;
  if (child && (target.exitCode !== null || target.signalCode)) return true;
  if (!child && !alive(pid)) return true;
  const gone = (ms) => (child ? waitExit(target, ms) : waitGone(pid, ms));
  politeQuit(pid);
  if (await gone(o.gracefulMs == null ? 10000 : Number(o.gracefulMs))) return true;
  log("browser: the window would not quit on its own - closing it the hard way");
  killPid(pid);
  return await gone(15000);
}

// Wait until a browser we started is really gone, so the profile is free for the next launch.
export async function waitExit(proc, ms) {
  const until = Date.now() + (ms || 15000);
  for (;;) {
    if (!proc || proc.exitCode !== null || proc.signalCode) return true;
    if (Date.now() > until) return false;
    await sleep(200);
  }
}
// Open a file or URL with the desktop default handler: the "Open result" button and the Node
// download page when no browser was found.
export function openExternal(target) {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", target], { stdio: "ignore", detached: true }).unref();
    else if (process.platform === "darwin") spawn("open", [target], { stdio: "ignore", detached: true }).unref();
    else spawn("xdg-open", [target], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch (e) { return false; }
}
