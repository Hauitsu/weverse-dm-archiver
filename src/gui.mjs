// src/gui.mjs -- the local page the user actually works with.
//
// It listens on 127.0.0.1 only, so nothing on the network can reach it, and it never asks for a
// password: logging in happens in the browser window, exactly the way it normally would.
//
//   node src/gui.mjs [--port 8787] [--no-open]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { loadConfig, saveConfig, CONFIG_FILE } from "./config.mjs";
import { makeT, pickLang } from "./i18n.mjs";
import { REPO, dirs, rooms, runRoom, estimateFor, openSession, tzFor } from "./pipeline.mjs";
import { openExternal } from "./browser.mjs";

const NL = String.fromCharCode(10);
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && v.indexOf("--") !== 0 ? v : true;
}

let cfg = loadConfig();
const state = {
  phase: "idle", running: false, slug: "", roomName: "", percent: 0, progress: null,
  log: [], result: null, error: "", startedAt: 0,
};
const push = (m) => {
  const line = String(m);
  state.log.push(line);
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
  console.log(line);
};
const setPhase = (p) => { state.phase = p; push("phase: " + p); };
const setPhaseSilent = (p) => { state.phase = p; };

const t = () => makeT(cfg.language);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));

function zones() {
  try { return Intl.supportedValuesOf("timeZone"); } catch (e) { return ["UTC", "Asia/Jakarta", "Asia/Seoul", "Asia/Tokyo"]; }
}

function page() {
  const tr = t();
  const list = rooms(cfg);
  const machine = "auto (" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") + ")";
  const rows = list.map((r) => {
    const e = estimateFor(cfg, r);
    const size = e.known ? tr("gui.sizeMeasured") : tr("gui.sizeGuess", { v: (e.bytes / 1073741824).toFixed(1) });
    const a = r.nameEn && r.nameEn !== r.nameKo ? r.nameEn + " (" + r.nameKo + ")" : (r.nameKo || r.slug);
    return "<label class=\"row\"><input type=\"checkbox\" data-slug=\"" + esc(r.slug) + "\">" +
      "<span class=\"nm\">" + esc(r.rowLabel || r.slug) + "</span>" +
      "<span class=\"who\">" + esc(a) + "</span><span class=\"id\">" + esc(r.roomId) + "</span>" +
      "<span class=\"sz\">" + esc(size) + "</span></label>";
  }).join(NL);
  const opts = zones().map((z) => "<option value=\"" + esc(z) + "\">").join("");
  const langs = ["en", "ko", "id"].map((l) => "<option value=\"" + l + "\"" + (pickLang(cfg.language) === l ? " selected" : "") + ">" + l + "</option>").join("");

  return [
    "<!doctype html><html lang=\"" + pickLang(cfg.language) + "\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(tr("gui.title")) + "</title><style>",
    ":root{color-scheme:light dark}body{font-family:system-ui,Segoe UI,Malgun Gothic,sans-serif;margin:0;padding:24px;max-width:900px;line-height:1.5}",
    "h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 18px;opacity:.7}",
    "section{border:1px solid #8884;border-radius:10px;padding:14px 16px;margin:0 0 14px}",
    "label.row{display:grid;grid-template-columns:24px 1fr 170px 84px 96px;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid #8882;cursor:pointer}",
    ".nm{font-weight:600}.who,.id,.sz{opacity:.75;font-size:13px}",
    "button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid #8886;background:#8881;cursor:pointer}",
    "button.primary{background:#2f6feb;border-color:#2f6feb;color:#fff}button:disabled{opacity:.45;cursor:default}",
    "#log{white-space:pre-wrap;font:12px/1.45 ui-monospace,Consolas,monospace;max-height:280px;overflow:auto;background:#8881;border-radius:8px;padding:10px;margin:0}",
    "#bar{height:6px;background:#8883;border-radius:3px;overflow:hidden;margin:10px 0}#fill{display:block;height:100%;width:0;background:#2f6feb;transition:width .4s}",
    ".grid{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.muted{opacity:.7;font-size:13px}",
    "input[type=text],select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid #8886;background:transparent}",
    "</style></head><body>",
    "<h1>" + esc(tr("gui.title")) + "</h1><p class=\"sub\">" + esc(tr("gui.tagline")) + "</p>",

    "<section><div class=\"grid\"><strong>" + esc(tr("gui.rooms")) + "</strong>",
    "<button id=\"bAll\">" + esc(tr("gui.selectAll")) + "</button>",
    "<button id=\"bNone\">" + esc(tr("gui.selectNone")) + "</button>",
    "<span class=\"muted\">" + esc(tr("gui.sizeHint")) + "</span></div>",
    "<div id=\"rooms\">" + rows + "</div>",
    "<p class=\"muted\">" + esc(tr("gui.browserHint")) + "</p>",
    "<div class=\"grid\"><label><input type=\"checkbox\" id=\"share\"> " + esc(tr("gui.share")) + "</label>",
    "<span class=\"muted\">" + esc(tr("gui.shareHint")) + "</span></div>",
    "<div class=\"grid\" style=\"margin-top:10px\"><label>" + esc(tr("gui.tz")) + " <input type=\"text\" id=\"tz\" list=\"tzs\" size=\"22\" value=\"" + esc(cfg.tz || "auto") + "\"></label>",
    "<datalist id=\"tzs\">" + opts + "</datalist>",
    "<label>" + esc(tr("gui.language")) + " <select id=\"lang\">" + langs + "</select></label>",
    "<span class=\"muted\">" + esc(tr("gui.tzHint", { v: machine })) + "</span></div>",
    "<div class=\"grid\" style=\"margin-top:10px\"><label>" + esc(tr("gui.rename")) + " <input type=\"text\" id=\"rename\" size=\"24\" value=\"" + esc(cfg.publicRename || "") + "\"></label>",
    "<span class=\"muted\">" + esc(tr("gui.renameHint")) + "</span></div>",
    "<div class=\"grid\" style=\"margin-top:14px\"><button id=\"start\" class=\"primary\">" + esc(tr("gui.start")) + "</button>",
    "<button id=\"stop\" disabled>" + esc(tr("gui.stop")) + "</button>",
    "<span id=\"phase\" class=\"muted\"></span></div>",
    "<div id=\"bar\"><i id=\"fill\"></i></div></section>",

    "<section id=\"result\" style=\"display:none\"><strong>" + esc(tr("gui.result")) + "</strong>",
    "<p id=\"resline\"></p><div class=\"grid\">",
    "<button id=\"bChat\">" + esc(tr("gui.openChat")) + "</button>",
    "<button id=\"bFolder\">" + esc(tr("gui.openFolder")) + "</button>",
    "<button id=\"bZip\">" + esc(tr("gui.openZip")) + "</button>",
    "<span class=\"muted\" id=\"resmeta\"></span></div></section>",

    "<section><strong>" + esc(tr("gui.log")) + "</strong><div id=\"log\"></div></section>",
    "<script>",
    "var MSG={pick:" + JSON.stringify(tr("gui.pickRoom")) + "};",
    "function el(s){return document.querySelector(s);}",
    "function all(v){document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){c.checked=v;});}",
    "async function start(){",
    "  var ids=[];",
    "  document.querySelectorAll(\"#rooms input[data-slug]:checked\").forEach(function(c){ids.push(c.dataset.slug);});",
    "  if(!ids.length){alert(MSG.pick);return;}",
    "  await fetch(\"/api/start\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({rooms:ids,share:el(\"#share\").checked,tz:el(\"#tz\").value,rename:el(\"#rename\").value})});",
    "  tick();",
    "}",
    "async function stop(){await fetch(\"/api/stop\",{method:\"POST\"});tick();}",
    "async function setLang(v){await fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({language:v})});location.reload();}",
    "async function openIt(w){await fetch(\"/api/open\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({what:w})});}",
    "async function tick(){",
    "  var s=null;",
    "  try{ s=await (await fetch(\"/api/state\")).json(); }catch(e){ return; }",
    "  el(\"#phase\").textContent=s.phaseText;",
    "  el(\"#fill\").style.width=(s.percent||0)+\"%\";",
    "  var box=el(\"#log\"); box.textContent=s.log.join(String.fromCharCode(10)); box.scrollTop=box.scrollHeight;",
    "  el(\"#start\").disabled=s.running; el(\"#stop\").disabled=!s.running;",
    "  el(\"#result\").style.display=s.result?\"block\":\"none\";",
    "  if(s.result){ el(\"#resline\").textContent=s.result.line; el(\"#resmeta\").textContent=s.result.meta||\"\"; }",
    "}",
    "el(\"#bAll\").addEventListener(\"click\",function(){all(true);});",
    "el(\"#bNone\").addEventListener(\"click\",function(){all(false);});",
    "el(\"#start\").addEventListener(\"click\",start);",
    "el(\"#stop\").addEventListener(\"click\",stop);",
    "el(\"#bChat\").addEventListener(\"click\",function(){openIt(\"chat\");});",
    "el(\"#bFolder\").addEventListener(\"click\",function(){openIt(\"folder\");});",
    "el(\"#bZip\").addEventListener(\"click\",function(){openIt(\"zip\");});",
    "el(\"#lang\").addEventListener(\"change\",function(e){setLang(e.target.value);});",
    "setInterval(tick,1000); tick();",
    "</script></body></html>",
  ].join(NL);
}

function stateJson() {
  const tr = t();
  const key = "gui.phase." + state.phase;
  let text = tr(key);
  if (text === key) text = state.phase;
  if (state.error) text = tr("gui.phase.error") + ": " + state.error;
  if (state.slug && (state.phase === "harvest" || state.phase === "media" || state.phase === "render")) {
    text += " - " + state.roomName + (state.progress ? " (" + state.progress.line + ")" : "");
  }
  if (state.phase === "idle") state.percent = 0;
  return {
    phase: state.phase, phaseText: text, running: state.running, percent: state.percent,
    log: state.log, result: state.result, error: state.error,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let all = "";
    req.on("data", (c) => { all += c; if (all.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(all || "{}")); } catch (e) { resolve({}); } });
  });
}

let stopFlag = false;
function running(flag) { state.running = flag; if (!flag) stopFlag = false; }

async function startJob(body) {
  if (state.running) return;
  const wanted = Array.isArray(body.rooms) ? body.rooms : [];
  const list = rooms(cfg).filter((r) => wanted.indexOf(r.slug) >= 0);
  if (!list.length) return;
  const share = body.share === true;
  if (body.tz && body.tz !== cfg.tz) { try { cfg = saveConfig({ tz: String(body.tz) }); } catch (e) {} }
  if (body.rename !== undefined && String(body.rename) !== String(cfg.publicRename || "")) { try { cfg = saveConfig({ publicRename: String(body.rename) }); } catch (e) {} }
  running(true);
  state.result = null; state.error = ""; state.log = []; state.percent = 0; state.progress = null; state.startedAt = Date.now();
  const tr = t();
  const results = [];
  try {
    setPhase("browser");
    push(tr("gui.loginHint"));
    const session = await openSession({ cfg: cfg, onLog: push, shouldStop: () => stopFlag, authTimeoutMs: 600000 });
    if (session.error) {
      state.error = session.error === "no-browser" ? tr("gui.noBrowser") : session.error;
      setPhase("error");
      running(false);
      return;
    }
    for (const r of list) {
      if (stopFlag) break;
      const roomName = r.rowLabel || r.slug;
      state.slug = r.slug; state.roomName = roomName;
      const res = await runRoom({
        slug: r.slug, roomId: r.roomId, roomName: roomName, artist: r.nameKo || r.slug,
        tz: tzFor(cfg, r), lang: pickLang(cfg.language), rename: cfg.publicRename || "", share: share,
        credit: cfg.credit || "", cdp: session.cdp, onLog: push, shouldStop: () => stopFlag,
        onProgress: (p) => {
          setPhaseSilent(p.phase);
          const d = p.data || {};
          state.progress = { line: p.phase === "harvest"
            ? String(d.pages || 0) + " page(s), " + String(d.uniq || 0) + " message(s)"
            : String(d.done || 0) + "/" + String(d.total || 0) + " file(s)" };
          if (p.phase === "media" && d.total) state.percent = Math.round((d.done / d.total) * 100);
        },
      });
      results.push({ slug: r.slug, roomName: roomName, res: res, roomId: r.roomId });
      if (res.error) { state.error = "render failed"; setPhase("error"); running(false); return; }
      if (res.stopped) break;
    }
    const last = results[results.length - 1];
    if (last) {
      const html = path.join(dirs(cfg).rooms, last.slug + ".html");
      const zip = last.res.phases.bundle ? last.res.phases.bundle.zip : "";
      const ids = String((last.res.phases.harvest && last.res.phases.harvest.ids) || 0);
      state.result = {
        slug: last.slug, html: html, zip: zip, folder: dirs(cfg).rooms, dist: dirs(cfg).dist,
        line: tr("gui.doneText", { n: ids, v: last.roomName }),
        meta: zip ? path.basename(zip) : "",
      };
      push(tr("gui.doneText", { n: ids, v: last.roomName }));
      if (zip) push("zip: " + zip);
    }
    setPhase(stopFlag ? "stopped" : "done");
  } catch (e) {
    state.error = String((e && e.message) || e);
    push("error: " + state.error);
    setPhase("error");
  } finally { running(false); }
}

async function handle(req, res) {
  const url = String(req.url || "/").split("?")[0];
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page());
    return;
  }
  if (req.method === "GET" && url === "/api/state") { json(200, stateJson()); return; }
  if (req.method === "POST" && url === "/api/start") { const b = await readBody(req); startJob(b); json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/stop") { stopFlag = true; push("stop requested, finishing the current step"); json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/config") {
    const b = await readBody(req);
    if (b.language) { try { cfg = saveConfig({ language: String(b.language) }); } catch (e) {} }
    if (b.tz) { try { cfg = saveConfig({ tz: String(b.tz) }); } catch (e) {} }
    json(200, { ok: true, language: cfg.language, tz: cfg.tz });
    return;
  }
  if (req.method === "POST" && url === "/api/open") {
    const b = await readBody(req);
    const r = state.result || {};
    const target = b.what === "zip" ? r.dist : b.what === "folder" ? r.folder : r.html;
    const ok = target ? openExternal(target) : false;
    json(200, { ok: ok, target: target || "" });
    return;
  }
  json(404, { error: "not found" });
}

const wantPort = Number(flag("port", cfg.guiPort || 8787)) || 8787;
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { try { res.writeHead(500, { "content-type": "text/plain" }); res.end(String((e && e.message) || e)); } catch (err) {} });
});

// Windows with Hyper-V, WSL or Docker installed reserves whole port ranges (8572-9871 is a common
// one), and a reserved port refuses the connection instead of reporting itself as busy. So walk a
// short list of candidates and, as a last resort, let the operating system pick the port.
const ladder = [];
for (const p of [wantPort, wantPort + 1, wantPort + 2, wantPort + 3, 17321, 17322, 17323, 0]) if (ladder.indexOf(p) < 0) ladder.push(p);
let step = 0;
server.on("error", (e) => {
  const code = e && e.code;
  const taken = code === "EADDRINUSE" || code === "EACCES" || code === "EPERM";
  step++;
  if (taken && step < ladder.length) { setTimeout(() => server.listen(ladder[step], "127.0.0.1"), 150); return; }
  console.error("gui: " + String((e && e.message) || e));
});
server.listen(ladder[0], "127.0.0.1", () => {
  const port = server.address().port;
  const url = "http://127.0.0.1:" + port + "/";
  console.log("gui: " + url);
  console.log("gui: config " + CONFIG_FILE);
  console.log("gui: repo " + REPO);
  if (!argv.includes("--no-open")) openExternal(url);
});

process.on("SIGINT", () => { push("closing"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 800); });
