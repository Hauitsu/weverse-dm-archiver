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

// Known install locations, best first. A bare name is looked up in PATH further down.
const CANDIDATES = [
  ["chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe"],
  ["chrome", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"],
  ["chrome", "%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe"],
  ["edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"],
  ["edge", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"],
  ["brave", "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"],
  ["vivaldi", "%LOCALAPPDATA%/Vivaldi/Application/vivaldi.exe"],
  ["chromium", "C:/Program Files/Chromium/Application/chrome.exe"],
  ["chrome", "chrome.exe"],
  ["edge", "msedge.exe"],
];

const expand = (p) => String(p).replace(/%([A-Za-z_]+)%/g, (m, k) => process.env[k] || m);

// Look a bare executable name up in PATH without starting a subprocess.
function fromPath(name) {
  for (const dir of String(process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

// First browser that really exists. config.browserPath wins so unusual setups still work.
export function findBrowser(cfg) {
  const out = [];
  const explicit = cfg && cfg.browserPath ? String(cfg.browserPath) : "";
  if (explicit) out.push({ name: "config", path: path.resolve(expand(explicit)) });
  for (const pair of CANDIDATES) {
    const name = pair[0];
    const p = expand(pair[1]);
    if (p.indexOf("/") < 0 && p.indexOf(String.fromCharCode(92)) < 0) { const hit = fromPath(p); if (hit) out.push({ name: name, path: hit }); }
    else out.push({ name: name, path: p });
  }
  for (const c of out) { try { if (fs.existsSync(c.path)) return c; } catch (e) {} }
  return null;
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

// Chromium only writes session cookies to the profile - the kind a fresh Weverse sign-in leaves
// behind before its cookie banner is accepted - when the profile is set to restore the last session.
// Without this the sign-in window quits, the cookie never reaches the disk, and the window that takes
// over opens logged out no matter how many times the person signs in again.
const SESSION_KEEP_ARG = "--restore-last-session";

const BASE_ARGS = [
  SESSION_KEEP_ARG,
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
    // there -- no fresh port opens and the run dies later pointing at the wrong thing.
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

// Sign-in providers refuse a browser that is being driven over DevTools: Google answers with "this
// browser or app may not be secure" and there is no flag that talks it out of that. The window the
// user types into therefore starts without the debugging port, on the very same profile, and the
// session it leaves behind is what the automated launch picks up a moment later.
const PLAIN_ARGS = [
  SESSION_KEEP_ARG,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-features=Translate,OptimizationHints",
  "--window-size=1280,900",
];

// A normal browser window on the archiver profile: same cookies, no DevTools, nothing automated.
export function launchPlain(opts) {
  const o = opts || {};
  const profile = o.profile || profileDir();
  fs.mkdirSync(profile, { recursive: true });
  const log = o.onLog || (() => {});
  const url = o.url || "https://weverse.io/";
  log("browser: " + path.basename(o.browserPath) + " (normal window, no debug port)");
  const proc = spawn(o.browserPath, ["--user-data-dir=" + profile].concat(PLAIN_ARGS, [url]), { stdio: "ignore" });
  proc.on("error", (e) => log("browser error: " + String(e.message || e)));
  return { proc: proc, profile: profile };
}

// Close a browser we started. taskkill takes the whole tree with it: killing only the process we
// spawned can leave renderers behind, and they hold the profile lock the next launch needs.
export function killBrowser(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode) return;
  try {
    if (process.platform === "win32") { spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" }); return; }
  } catch (e) {}
  try { proc.kill(); } catch (e) {}
}

// Close a browser we started the way a person would: ask it to quit and give the cookie store time to
// reach the disk, and only force the tree down when it refuses. taskkill /F throws away every cookie
// written since the last commit (Chromium commits on a timer and on a clean exit), which is exactly
// the state a fresh sign-in leaves behind: the next window opens logged out and the person is asked to
// sign in again for nothing. Measured on this machine: force-kill -> session and persistent cookie both
// gone; this path -> both still there.
export async function closeBrowser(proc, opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  if (!proc || proc.exitCode !== null || proc.signalCode) return true;
  if (process.platform === "win32") {
    try { spawn("taskkill", ["/PID", String(proc.pid)], { stdio: "ignore" }); } catch (e) { killBrowser(proc); }
  } else {
    try { proc.kill("SIGTERM"); } catch (e) {}
  }
  if (await waitExit(proc, o.gracefulMs == null ? 10000 : Number(o.gracefulMs))) return true;
  log("browser: the window would not quit on its own - closing it the hard way");
  killBrowser(proc);
  return await waitExit(proc, 15000);
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
