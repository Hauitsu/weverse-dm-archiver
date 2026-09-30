// src/gui.mjs -- the local page the user actually works with.
//
// It listens on 127.0.0.1 only, so nothing on the network can reach it, and it never asks for a
// password: logging in happens in the browser window, exactly the way it normally would.
//
//   node src/gui.mjs [--port 8787] [--no-open]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { loadConfig, saveConfig, CONFIG_FILE, SHARE_MODES } from "./config.mjs";
import { makeT, pickLang } from "./i18n.mjs";
import { REPO, dirs, rooms, runRoom, estimateFor, openSession, tzFor, publicRenameFor, hurryMode, GIB } from "./pipeline.mjs";
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
  phase: "idle", running: false, slug: "", roomName: "", percent: 0, progress: null, hurry: false, loginWait: false, loginAt: 0, hurryFirstAt: 0,
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

// **word** in a translation becomes real emphasis, so the popup can number its lines and bold the
// words that matter without putting markup into the language files beyond those two asterisks.
const bold = (s) => esc(String(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

function zones() {
  try { return Intl.supportedValuesOf("timeZone"); } catch (e) { return ["UTC", "Asia/Jakarta", "Asia/Seoul", "Asia/Tokyo"]; }
}

function page() {
  const tr = t();
  const list = rooms(cfg);
  const machine = "auto (" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") + ")";
  const rows = list.map((r) => {
    const e = estimateFor(cfg, r);
    const size = e.measured ? tr("gui.sizeSaved", { v: (e.saved / GIB).toFixed(1) }) : tr("gui.sizeGuess", { v: (e.bytes / GIB).toFixed(1) });
    const a = r.nameEn && r.nameEn !== r.nameKo ? r.nameEn + " (" + r.nameKo + ")" : (r.nameKo || r.slug);
    // Every row carries its own numbers, so the page can re-add them whenever a box is ticked.
    return "<label class=\"row\"><input type=\"checkbox\" data-slug=\"" + esc(r.slug) + "\" data-full=\"" + e.full + "\" data-saved=\"" + (e.saved || 0) + "\">" +
    // The stage name leads and the room's own title follows it, so a row reads as a person first
    // and as a chat room second.
      "<span class=\"nm\">" + esc(a) + "</span>" +
      "<span class=\"who\">" + esc(r.rowLabel || r.slug) + "</span><span class=\"id\">" + esc(r.roomId) + "</span>" +
      "<span class=\"sz\">" + esc(size) + "</span></label>";
  }).join(NL);
  // A real dropdown: a zone is picked from the list instead of typed into a native autocomplete that
  // shows nothing until the first keystroke. A zone pinned by hand but missing from Intl's list is
  // kept at the top, so merely opening the page never rewrites the setting.
  const curTz = String(cfg.tz || "auto");
  const tzList = ["auto"].concat(zones());
  if (curTz !== "auto" && tzList.indexOf(curTz) < 0) tzList.unshift(curTz);
  const opts = tzList.map((z) => "<option value=\"" + esc(z) + "\"" + (z === curTz ? " selected" : "") + ">" + esc(z === "auto" ? machine : z) + "</option>").join("");
  const langs = ["en", "ko", "id"].map((l) => "<option value=\"" + l + "\"" + (pickLang(cfg.language) === l ? " selected" : "") + ">" + l + "</option>").join("");
  // Yes / Yes but low quality / No, with the last choice remembered in config.json.
  const shareOpts = [["yes", "gui.shareYes"], ["low", "gui.shareLow"], ["no", "gui.shareNo"]]
    .map((m) => "<option value=\"" + m[0] + "\"" + (String(cfg.shareMode || "yes") === m[0] ? " selected" : "") + ">" + esc(tr(m[1])) + "</option>").join("");
  const noteHtml = "<ol style=\"margin:0;padding-left:22px\">" + tr("gui.startNote").split(NL).map((s) => "<li>" + bold(s) + "</li>").join("") + "</ol>";

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
    // The estimate explains itself on hover only, so the page stays short. Pure CSS, no script.
    ".tipwrap{position:relative;display:inline-block;cursor:help}",
    ".tip{display:none;position:absolute;left:0;top:100%;z-index:5;min-width:460px;margin-top:8px;padding:10px 12px;border:1px solid #8886;border-radius:8px;background:Canvas;color:CanvasText;font-size:13px;line-height:1.45;box-shadow:0 6px 18px #0003}",
    ".tipwrap:hover .tip{display:block}",
    ".tipwrap.flow{position:static}",
    ".tipwrap.flow .tip{min-width:min(460px,100%)}",
    ".info{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #8888;border-radius:50%;font-size:11px;font-weight:700;font-style:italic;line-height:1;opacity:.75}",
    "input[type=text],select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid #8886;background:transparent}",
    "details.adv summary{cursor:pointer;font-size:13px;opacity:.75}details.adv[open] summary{margin-bottom:2px}",
    "</style></head><body>",
    "<h1>" + esc(tr("gui.title")) + "</h1><p class=\"sub\">" + esc(tr("gui.tagline")) + "</p>",
    "<div class=\"grid\" style=\"margin:-6px 0 16px\"><label>" + esc(tr("gui.language")) + " <select id=\"lang\">" + langs + "</select></label>",
    "<span class=\"muted\">" + esc(tr("gui.langHint")) + "</span></div>",

    "<section><div class=\"grid\"><strong>" + esc(tr("gui.rooms")) + "</strong>",
    "<button id=\"bAll\">" + esc(tr("gui.selectAll")) + "</button>",
    "<button id=\"bNone\">" + esc(tr("gui.selectNone")) + "</button>",
    "<span class=\"muted\">" + esc(tr("gui.sizeHint")) + "</span></div>",
    "<div id=\"rooms\">" + rows + "</div></section>",
    // The same sentence the Start button shows on hover, repeated as a confirmation: starting really
    // does open its own browser window, so the click waits here until the user has read that.
    "<div id=\"modal\" style=\"display:none;position:fixed;inset:0;background:#0009;align-items:center;justify-content:center;padding:20px;z-index:9\">",
"<div style=\"max-width:540px;background:Canvas;color:CanvasText;border:1px solid #8886;border-radius:12px;padding:18px 20px\">",
noteHtml.replace("<ol style=\"margin:0;", "<ol style=\"margin:0 0 16px;"),
"<div class=\"grid\"><button id=\"mGo\" class=\"primary\">" + esc(tr("gui.start")) + "</button>",
"<button id=\"mNo\">" + esc(tr("gui.cancel")) + "</button></div></div></div>",

    "<div id=\"under\" style=\"display:none\">",
    "<section>",
    "<div class=\"grid\" style=\"margin-top:8px;position:relative\"><span id=\"total\" class=\"muted\"></span>",
    "<span class=\"tipwrap flow\"><span class=\"info\">i</span><span class=\"tip\">" + esc(tr("gui.estHint", { v: Number(cfg.estimateGb || 3).toFixed(1) })) + "</span></span></div>",
    "<div class=\"grid\" style=\"margin-top:8px;position:relative\"><label>" + esc(tr("gui.share")) + " <select id=\"share\">" + shareOpts + "</select></label>",
    "<span class=\"tipwrap flow\"><span class=\"info\">i</span><span class=\"tip\">" + esc(tr("gui.shareHint")) + "</span></span></div>",
    "<details class=\"adv\" style=\"margin-top:20px\"><summary>" + esc(tr("gui.advanced")) + "</summary>",
    "<div class=\"grid\" style=\"margin-top:8px\"><label>" + esc(tr("gui.tz")) + " <select id=\"tz\">" + opts + "</select></label>",
    "<span class=\"muted\">" + esc(tr("gui.tzHint", { v: machine })) + "</span></div></details>",
    "<div class=\"grid\" style=\"margin-top:14px\"><span class=\"tipwrap\"><button id=\"start\" class=\"primary\">" + esc(tr("gui.start")) + "</button>",
    "<span class=\"tip\">" + esc(tr("gui.browserHint")) + "</span></span>",
    "<button id=\"stop\" disabled>" + esc(tr("gui.stop")) + "</button>",
    "<span id=\"authedWrap\" style=\"display:none\"><span class=\"muted\">" + esc(tr("gui.authedHint")) + "</span> <button id=\"bAuthed\">" + esc(tr("gui.authed")) + "</button></span>",
    "<span id=\"phase\" class=\"muted\"></span></div>",
    "<div id=\"bar\" style=\"display:none\"><i id=\"fill\"></i></div></section>",


    "<section id=\"result\" style=\"display:none\"><strong>" + esc(tr("gui.result")) + "</strong>",
    "<p id=\"resline\"></p><div class=\"grid\">",
    "<button id=\"bChat\">" + esc(tr("gui.openChat")) + "</button>",
    "<button id=\"bFolder\">" + esc(tr("gui.openFolder")) + "</button>",
    "<button id=\"bZip\">" + esc(tr("gui.openZip")) + "</button>",
    "<span class=\"muted\" id=\"resmeta\"></span></div></section>",

    // The same steps the Start popup shows, still on the page while the login wait runs, so nobody
    // has to remember what the popup said after dismissing it.
    "<section id=\"loginNote\" style=\"display:none\">" + noteHtml + "</section>",
    "<section id=\"logBox\" style=\"display:none\"><strong>" + esc(tr("gui.log")) + "</strong><div id=\"log\"></div></section>",
    "</div>",
    "<script>",
    "var MSG={pick:" + JSON.stringify(tr("gui.pickRoom")) + ",total:" + JSON.stringify(tr("gui.totalSel")) + ",none:" + JSON.stringify(tr("gui.totalNone")) + ",savedNote:" + JSON.stringify(tr("gui.totalSaved")) + ",zipNote:" + JSON.stringify(tr("gui.totalZip")) + ",zipLow:" + JSON.stringify(tr("gui.totalZipLow")) + ",allNote:" + JSON.stringify(tr("gui.totalAll")) + ",authed:" + JSON.stringify(tr("gui.authed")) + ",retry:" + JSON.stringify(tr("gui.retry")) + "};",
    "function el(s){return document.querySelector(s);}",
    "function all(v){document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){c.checked=v;});total();}",
    "var GIB=1073741824;",
    "function total(){",
    "  under();",
    "  var n=0,full=0,saved=0;",
    "  document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){if(!c.checked)return;n++;full+=Number(c.dataset.full||0);saved+=Number(c.dataset.saved||0);});",
    "  if(!n){el(\"#total\").innerHTML=MSG.none;return;}",
    "  var t=MSG.total.replace(\"{n}\",\"<strong>\"+n+\"</strong>\").replace(\"{v}\",\"<strong>\"+(full/GIB).toFixed(1)+\" GB</strong>\");",
    "  if(saved>0)t+=MSG.savedNote.replace(\"{s}\",\"<strong>\"+(saved/GIB).toFixed(1)+\" GB</strong>\");",
    "  var mode=el(\"#share\").value;",
    "  if(mode!==\"no\"){",
    "    t+=mode===\"low\"?MSG.zipLow:MSG.zipNote.replace(\"{z}\",\"<strong>\"+(full/GIB).toFixed(1)+\" GB</strong>\");",
    // What ends up on disk: the conversation, plus the zip beside it when one is written. A
    // re-compressed zip is a fraction of the conversation and guessing that fraction would be
    // worse than saying "much smaller", so in low mode only the conversation is counted.
    "    t+=MSG.allNote.replace(\"{t}\",\"<strong>\"+((mode===\"low\"?full:full*2)/GIB).toFixed(1)+\" GB</strong>\");",
    "  }",
    "  el(\"#total\").innerHTML=t;",
    "}",
    "function hideModal(){el(\"#modal\").style.display=\"none\";}",
    "function askStart(){",
    "  var ids=[];",
    "  document.querySelectorAll(\"#rooms input[data-slug]:checked\").forEach(function(c){ids.push(c.dataset.slug);});",
    "  if(!ids.length){alert(MSG.pick);return;}",
    "  el(\"#modal\").style.display=\"flex\";",
    "}",
    "async function start(){",
    "  hideModal();",
    "  var ids=[];",
    "  document.querySelectorAll(\"#rooms input[data-slug]:checked\").forEach(function(c){ids.push(c.dataset.slug);});",
    "  if(!ids.length){alert(MSG.pick);return;}",
    "  await fetch(\"/api/start\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({rooms:ids,share:el(\"#share\").value,tz:el(\"#tz\").value})});",
    "  tick();",
    "}",
    "async function stop(){await fetch(\"/api/stop\",{method:\"POST\"});tick();}",
    "async function setLang(v){await fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({language:v})});location.reload();}",
    "async function openIt(w){await fetch(\"/api/open\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({what:w})});}",
    // The lower half of the page only makes sense once something is picked, so it stays out of the
    // way until a room is ticked (or a run is going on, so its own result never disappears).
    // The progress bar is not an option, it is a report: it appears only once a run has started.
    "var busy=false;",
    "function under(flag){",
    "  if(flag!==undefined)busy=!!flag;",
    "  var n=0;",
    "  document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){if(c.checked)n++;});",
    "  el(\"#bar\").style.display=busy?\"\":\"none\"; el(\"#logBox\").style.display=busy?\"\":\"none\"; el(\"#under\").style.display=(n>0||busy)?\"\":\"none\";",
    "}",
    "async function tick(){",
    "  var s=null;",
    "  try{ s=await (await fetch(\"/api/state\")).json(); }catch(e){ return; }",
    "  el(\"#phase\").textContent=s.phaseText;",
    "  el(\"#fill\").style.width=(s.percent||0)+\"%\";",
    "  var box=el(\"#log\"); box.textContent=s.log.join(String.fromCharCode(10)); box.scrollTop=box.scrollHeight;",
    "  el(\"#start\").disabled=s.running; el(\"#stop\").disabled=!s.running;",
    "  el(\"#authedWrap\").style.display=s.hurryMode?\"\":\"none\";",
    "  el(\"#bAuthed\").textContent=(s.hurryMode===\"retry\")?MSG.retry:MSG.authed;",
    "  el(\"#loginNote\").style.display=(s.running&&s.phase===\"browser\")?\"\":\"none\";",
    "  el(\"#result\").style.display=s.result?\"block\":\"none\";",
    "  under(!!s.running||!!s.result);",
    "  if(s.result){ el(\"#resline\").textContent=s.result.line; el(\"#resmeta\").textContent=s.result.meta||\"\"; }",
    "}",
    "el(\"#bAll\").addEventListener(\"click\",function(){all(true);});",
    "el(\"#bNone\").addEventListener(\"click\",function(){all(false);});",
    "el(\"#rooms\").addEventListener(\"change\",total);",
    "el(\"#share\").addEventListener(\"change\",function(){total();fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({shareMode:el(\"#share\").value})});});",
    "el(\"#start\").addEventListener(\"click\",askStart);",
    "el(\"#mGo\").addEventListener(\"click\",start);",
    "el(\"#mNo\").addEventListener(\"click\",hideModal);",
    "el(\"#modal\").addEventListener(\"click\",function(e){if(e.target===el(\"#modal\"))hideModal();});",
    "document.addEventListener(\"keydown\",function(e){if(e.key===\"Escape\")hideModal();});",
    "el(\"#stop\").addEventListener(\"click\",stop);",
    "el(\"#bAuthed\").addEventListener(\"click\",function(){fetch(\"/api/hurry\",{method:\"POST\"});});",
    "el(\"#bChat\").addEventListener(\"click\",function(){openIt(\"chat\");});",
    "el(\"#bFolder\").addEventListener(\"click\",function(){openIt(\"folder\");});",
    "el(\"#bZip\").addEventListener(\"click\",function(){openIt(\"zip\");});",
    "el(\"#lang\").addEventListener(\"change\",function(e){setLang(e.target.value);});",
    "el(\"#tz\").addEventListener(\"change\",function(){fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({language:el(\"#lang\").value,tz:el(\"#tz\").value})});});",
    "total();",
    "setInterval(tick,1000); tick();",
    "</script></body></html>",
  ].join(NL);
}

function stateJson() {
  const tr = t();
  const key = "gui.phase." + state.phase;
  let text = tr(key);
  if (text === key) text = state.phase;
  // While the login wait runs, say what is actually being waited for instead of "Starting the browser".
  if (state.phase === "browser" && state.loginWait) text = tr("gui.loginHint");
  if (state.error) text = tr("gui.phase.error") + ": " + state.error;
  if (state.slug && (state.phase === "harvest" || state.phase === "media" || state.phase === "render")) {
    text += " - " + state.roomName + (state.progress ? " (" + state.progress.line + ")" : "");
  }
  if (state.phase === "idle") state.percent = 0;
  return {
    phase: state.phase, phaseText: text, running: state.running, percent: state.percent, hurryMode: hurryMode(state),
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
  // The page sends "yes" | "low" | "no"; true/false are still accepted so an older page or a script
  // keeps working.
  const asked = body.share === true ? "yes" : body.share === false ? "no" : String(body.share || cfg.shareMode || "yes");
  const shareMode = SHARE_MODES.indexOf(asked) >= 0 ? asked : "yes";
  const share = shareMode !== "no";
  const shareLow = shareMode === "low";
  if (shareMode !== cfg.shareMode) { try { cfg = saveConfig({ shareMode: shareMode }); } catch (e) {} }
  if (body.tz && body.tz !== cfg.tz) { try { cfg = saveConfig({ tz: String(body.tz) }); } catch (e) {} }
      running(true);
  state.result = null; state.error = ""; state.log = []; state.percent = 0; state.progress = null; state.startedAt = Date.now();
  const tr = t();
  const results = [];
  try {
    setPhase("browser");
    push(tr("gui.loginHint"));
    // The login wait is automatic; the button only shortens the pause before the next check.
    state.hurry = false; state.loginWait = true; state.loginAt = Date.now(); state.hurryFirstAt = 0;
    const session = await openSession({
      cfg: cfg, onLog: push, shouldStop: () => stopFlag, authTimeoutMs: 600000,
      hurry: () => { if (!state.hurry) return false; state.hurry = false; return true; },
      hurryLog: tr("gui.checkNow"),
    });
    state.loginWait = false;
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
        tz: tzFor(cfg, r), lang: pickLang(cfg.language), rename: publicRenameFor(cfg, r.slug), share: share, shareLow: shareLow,
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
  if (req.method === "POST" && url === "/api/hurry") { state.hurry = true; if (!state.hurryFirstAt) state.hurryFirstAt = Date.now(); json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/config") {
    const b = await readBody(req);
    if (b.language) { try { cfg = saveConfig({ language: String(b.language) }); } catch (e) {} }
    if (b.tz) { try { cfg = saveConfig({ tz: String(b.tz) }); } catch (e) {} }
    if (b.shareMode && SHARE_MODES.indexOf(String(b.shareMode)) >= 0) { try { cfg = saveConfig({ shareMode: String(b.shareMode) }); } catch (e) {} }
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
