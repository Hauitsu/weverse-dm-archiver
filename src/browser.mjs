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

const BASE_ARGS = [
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
    try { proc.kill(); } catch (e) {}
    await sleep(800);
    const fixed = (await freePort()) || 9333;
    proc = await start(fixed);
    port = (await waitPortFile(portFile, o.portWaitMs || 15000)) || fixed;
    await ready(port, 10000);
  }
  return { proc: proc, port: port, profile: profile };
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
