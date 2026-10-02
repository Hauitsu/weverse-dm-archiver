// src/gui.mjs -- the local page the user actually works with.
//
// It listens on 127.0.0.1 only, so nothing on the network can reach it, and it never asks for a
// password: logging in happens in the browser window, exactly the way it normally would.
//
//   node src/gui.mjs [--port 8787] [--no-open]
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { loadConfig, saveConfig, CONFIG_FILE, SHARE_MODES, THUMB_MODES, DEFAULTS } from "./config.mjs";
import { makeT, pickLang, LANGS } from "./i18n.mjs";
import { REPO, dirs, rooms, runRoom, renderRoom, srcFor, openSession, tzFor, publicRenameFor, publicDirFor, hurryMode, GIB } from "./pipeline.mjs";
import { rowNumbers, listSignature } from "./rowinfo.mjs";
import { canOffer, collectReady, driveUrl, eligibleRooms, memberName } from "./collect.mjs";
import { bundle, estimateBundle } from "./bundle.mjs";
import { openExternal, listBrowsers, samePath } from "./browser.mjs";
import { fmtSize } from "./size.mjs";
import { artistLabel, tzOk } from "./rooms.mjs";

const NL = String.fromCharCode(10);
const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v && v.indexOf("--") !== 0 ? v : true;
}

// A config.json that stopped parsing must not cost the user the window (a stray comma is easy to
// leave behind). Start on the built-in defaults, leave the file untouched, and pick it up again as
// soon as it parses -- cfgWatch below retries on every request.
let cfg;
try { cfg = loadConfig(); }
catch (e) {
  console.error("gui: " + String((e && e.message) || e));
  console.error("gui: starting on the built-in defaults; fix or delete " + CONFIG_FILE + " when you can");
  cfg = Object.assign({}, DEFAULTS);
  cfg.pacing = Object.assign({}, DEFAULTS.pacing);
}
// config.json can be edited while the page is open - the collector link, the debug switch. Rather than
// holding a stale copy until the next restart, notice the change on the next request and re-read it. A
// file that stopped parsing is left alone, so a stray comma cannot take the page down.
let cfgSig = "";
function cfgWatch() {
  try {
    const st = fs.statSync(CONFIG_FILE);
    const sig = st.mtimeMs + " " + st.size;
    if (sig !== cfgSig) { cfgSig = sig; cfg = loadConfig(CONFIG_FILE); }
  } catch (e) {}
  return cfg;
}
const state = {
  phase: "idle", running: false, slug: "", roomName: "", percent: 0, floor: 0, maxPages: 0, progress: null, hurry: false, loginWait: false, loginAt: 0, hurryFirstAt: 0, plainWait: false, settleUntil: 0,
  browserWish: null,
  log: [], result: null, results: [], error: "", startedAt: 0,
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

// **word** in a translation becomes bold and *word* becomes italic, so the popup can number its
// lines and emphasize the words that matter without putting markup into the language files beyond
// those asterisks. One pass alternates the two patterns, so a run of asterisks can never be read as
// one long span: "*a* then **b**" is three pieces, not one.
const emph = (s) => esc(String(s)).replace(/\*\*([^*]+)\*\*|\*([^*]+)\*/g, (m, b, i) => (b !== undefined ? "<strong>" + b + "</strong>" : "<em>" + i + "</em>"));
const bold = emph;

function zones() {
  try { return Intl.supportedValuesOf("timeZone"); } catch (e) { return ["UTC", "Asia/Jakarta", "Asia/Seoul", "Asia/Tokyo"]; }
}

// What the Open button on a room row points at: the complete export first, then the shareable one,
// and the zip last. Returns "" when nothing was saved for that room yet.
function roomPage(slug) {
  const s = String(slug || "").replace(/[^A-Za-z0-9._-]/g, "");
  if (!s) return "";
  const d = dirs(cfg);
  const cands = [path.join(d.rooms, s + ".html"), path.join(d.roomsPublic, s + ".html"), path.join(d.share, "weverse-dm-" + s + ".zip")];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return "";
}
// The Share button works off the public export: that is the copy a zip is built from, and the only
// one that never carries bookmarks or the owner's own nickname.
function publicExport(slug) {
  const s = String(slug || "").replace(/[^A-Za-z0-9._-]/g, "");
  if (!s) return "";
  const p = path.join(publicDirFor(cfg), s + ".html");
  try { return fs.existsSync(p) ? p : ""; } catch (e) { return ""; }
}
// bundle() never overwrites: a second zip for the same room is written as -v2, -v3 and so on, so
// "the zip" of a room means the newest one that is lying in share/.
function shareZips(slug) {
  const s = String(slug || "").replace(/[^A-Za-z0-9._-]/g, "");
  const out = [];
  if (!s) return out;
  let names = [];
  try { names = fs.readdirSync(dirs(cfg).share); } catch (e) { return out; }
  for (const f of names) {
    const m = /^weverse-dm-(.+?)(-v[0-9]+)?[.]zip$/.exec(f);
    if (!m || m[1] !== s) continue;
    const p = path.join(dirs(cfg).share, f);
    try { const st = fs.statSync(p); out.push({ name: f, path: p, bytes: st.size, at: st.mtimeMs }); } catch (e) {}
  }
  out.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
  return out;
}
function shareInfo(slug) {
  const zs = shareZips(slug);
  const z = zs[0] || null;
  return { canZip: !!publicExport(slug), zips: zs.length, zip: z ? { name: z.name, bytes: z.bytes, at: z.at } : null };
}

// Packing a zip is a job of its own: it needs no browser and no login, it runs while the page keeps
// polling, and it is the only thing this file does that writes into share/.
const shareJob = { running: false, stop: false, slug: "", low: false, percent: 0, log: [], error: "", result: null, at: 0 };
function sharePush(m) {
  const line = String(m);
  shareJob.log.push(line);
  if (shareJob.log.length > 120) shareJob.log.splice(0, shareJob.log.length - 120);
  // "quality: 250/1479 file(s)" and anything else written as n/m drives the little progress bar.
  const m2 = /([0-9]+)\s*\/\s*([0-9]+)/.exec(line);
  if (m2 && Number(m2[2]) > 0) shareJob.percent = Math.min(99, Math.round((Number(m2[1]) / Number(m2[2])) * 100));
  console.log("[share] " + line);
}
async function startShare(body) {
  if (shareJob.running || state.running) return;
  const r = rooms(cfg).filter((x) => x.slug === String(body.slug || ""))[0];
  if (!r) return;
  shareJob.running = true; shareJob.stop = false; shareJob.slug = r.slug; shareJob.low = !!body.low;
  shareJob.percent = 0; shareJob.log = []; shareJob.error = ""; shareJob.result = null; shareJob.at = Date.now();
  const tr = t();
  sharePush(tr("gui.phase.bundle") + ": " + (r.rowLabel || r.slug));
  try {
    if (!publicExport(r.slug)) {
      // A room harvested back when sharing was off has a private page and no public one. That is
      // not a reason to refuse: the public export is rendered here from the same source, and it
      // is exactly the artist-only copy a zip is allowed to carry.
      if (!roomPage(r.slug)) throw new Error(tr("gui.shareNeedPub"));
      sharePush(tr("gui.shareBuildPub"));
      const built = await renderRoom({
        slug: r.slug, srcDir: srcFor(r.slug), roomName: r.rowLabel || r.slug, artist: artistLabel(r),
        tz: tzFor(cfg, r), lang: pickLang(cfg.language), only: "artist", rename: publicRenameFor(cfg, r.slug),
        bookmarks: "off", outDir: publicDirFor(cfg), warn: false, onLog: sharePush,
      });
      if (built !== 0 || !publicExport(r.slug)) throw new Error(tr("gui.shareNeedPub"));
    }
    const b = await bundle({
      slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: artistLabel(r),
      roomDir: publicDirFor(cfg), mediaDir: dirs(cfg).media, shareDir: dirs(cfg).share, verifyDir: dirs(cfg).verify,
      credit: cfg.credit || "", lowQuality: shareJob.low, onLog: sharePush, shouldStop: () => shareJob.stop,
    });
    shareJob.result = { name: path.basename(b.zip), bytes: b.bytes, sha256: b.sha256, path: b.zip };
    shareJob.percent = 100;
    sharePush("zip: " + path.basename(b.zip) + " (" + fmtSize(b.bytes) + ")");
  } catch (e) {
    // Cancelling is not a failure: the log below says so, and everything the job held is released
    // by the finally right after it, which is what brings the share buttons back.
    if (e && e.stopped) sharePush("stopped by the user");
    else { shareJob.error = String((e && e.message) || e); sharePush("error: " + shareJob.error); }
  } finally { shareJob.running = false; shareJob.stop = false; }
}
// "Open folder" means the folder that holds the zip, with the zip itself already marked on Windows.
function openShareFolder(slug) {
  const z = shareZips(slug)[0];
  const dir = dirs(cfg).share;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  try {
    if (process.platform === "win32") {
      spawn("explorer", [z ? "/select," + z.path : dir], { stdio: "ignore", detached: true }).unref();
      return true;
    }
  } catch (e) {}
  return openExternal(dir);
}

function page() {
  const tr = t();
  const list = rooms(cfg);
  const machine = "auto (" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") + ")";
  const rows = list.map((r) => {
    // The numbers come from the same place the state poll uses, so what this page prints and what a
    // later poll patches in can never drift apart.
    const e = rowNumbers(cfg, r, tr);
    const size = e.text;
    const canOpen = !!roomPage(r.slug);
    // collectDebug is the owner switch for looking at the share popup: it hands out the button even for
    // a room with nothing saved yet, so the popup can be read without running a whole harvest first.
    const canShare = canOpen || !!cfg.collectDebug;
    const openBtn = "<span class=\"op\"" + (canOpen ? "" : " style=\"visibility:hidden\"") + "><button type=\"button\" class=\"mini\" data-slug=\"" + esc(r.slug) + "\"" + (canOpen ? "" : " disabled") + " title=\"" + esc(tr("gui.openHint")) + "\">" + esc(tr("gui.open")) + "</button></span>";
    // Share stands right of Open and only where Open stands: a room with nothing saved yet has no
    // page to pack, so the button stays hidden until there is one. Its tooltip names the zip that is
    // already there.
    const si = shareInfo(r.slug);
    const shTip = tr("gui.shareHint") + " " + (si.zip ? tr("gui.shareHas", { v: si.zip.name + " (" + fmtSize(si.zip.bytes) + ")" }) : tr("gui.shareNone"));
    const shareBtn = "<span class=\"sh\"" + (canShare ? "" : " style=\"visibility:hidden\"") + "><button type=\"button\" class=\"mini\" data-share=\"" + esc(r.slug) + "\"" + (canShare ? "" : " disabled") + " title=\"" + esc(shTip) + "\">" + esc(tr("gui.shareBtn")) + "</button></span>";
    const a = r.nameEn && r.nameEn !== r.nameKo ? r.nameEn + " (" + r.nameKo + ")" : (r.nameKo || r.slug);
    // Every row carries its own numbers, so the page can re-add them whenever a box is ticked.
    return "<label class=\"row\"><input type=\"checkbox\" data-slug=\"" + esc(r.slug) + "\" data-full=\"" + e.full + "\" data-saved=\"" + (e.saved || 0) + "\">" +
    // The stage name leads and the room's own title follows it, so a row reads as a person first
    // and as a chat room second.
      "<span class=\"nm\">" + esc(a) + "</span>" +
      "<span class=\"who\">" + esc(r.rowLabel || r.slug) + "</span><span class=\"id\">" + esc(r.roomId) + "</span>" +
      "<span class=\"sz\">" + esc(size) + "</span>" + openBtn + shareBtn + "</label>";
  }).join(NL);
  // A real dropdown: a zone is picked from the list instead of typed into a native autocomplete that
  // shows nothing until the first keystroke. A zone pinned by hand but missing from Intl's list is
  // kept at the top, so merely opening the page never rewrites the setting.
  const curTz = String(cfg.tz || "auto");
  const tzList = ["auto"].concat(zones());
  if (curTz !== "auto" && tzList.indexOf(curTz) < 0) tzList.unshift(curTz);
  const opts = tzList.map((z) => "<option value=\"" + esc(z) + "\"" + (z === curTz ? " selected" : "") + ">" + esc(z === "auto" ? machine : z) + "</option>").join("");
  const langs = ["en", "ko", "id"].map((l) => "<option value=\"" + l + "\"" + (pickLang(cfg.language) === l ? " selected" : "") + ">" + l + "</option>").join("");
  // Yes / No, remembered in config.json. A re-compressed zip is no longer a batch choice: it lives
  // in the Share popup (and in `wdm share --low`), so a config still saying "low" reads as "yes" here.
  const curShare = String(cfg.shareMode) === "no" ? "no" : "yes";
  const shareOpts = [["yes", "gui.shareYes"], ["no", "gui.shareNo"]]
    .map((m) => "<option value=\"" + m[0] + "\"" + (curShare === m[0] ? " selected" : "") + ">" + esc(tr(m[1])) + "</option>").join("");
// The Advanced picker lists every Chromium browser this machine really has. "Automatic" keeps the
// built-in order; a path that only exists in config.json (hand-written, an unusual install) gets its
// own entry, so what the dropdown shows is always what the next run will actually start.
const detected = listBrowsers(cfg);
const orig = (s) => String(s || "").replace(/\\/g, "/").toLowerCase();
const picked = cfg.browserPath ? orig(cfg.browserPath) : "";
const browserList = detected.slice();
if (picked && !browserList.some((b) => orig(b.path) === picked)) browserList.unshift({ name: "config", path: String(cfg.browserPath) });
const browserOpts = ["<option value=\"\"" + (picked ? "" : " selected") + ">" + esc(tr("gui.browserAuto")) + "</option>"]
  .concat(browserList.map((b) => "<option value=\"" + esc(b.path) + "\"" + (picked && orig(b.path) === picked ? " selected" : "") + ">" + esc(b.name + " - " + b.path) + "</option>")).join("");
  // The (i) beside "Home page": one look at what that page should look like once the signing in went
  // through, so nobody has to guess whether they are standing in the right place. The {i} token sits
  // in each translation, because where it belongs in the sentence is not the same in every language.
  const homeShot = "<span class=\"tipwrap\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip shot\"><img src=\"/assets/home-page.png\" alt=\"\"><span class=\"cap\">" + esc(tr("gui.homeShot")) + "</span></span></span>";
  // The same little (i), but this one only has words to say: where the login lives. It is not the
  // session screenshot, so it keeps the plain text tooltip and hangs off the end of the line.
  const loginTip = "<span class=\"tipwrap end\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.loginStays")) + "</span></span>";
  const noteHtml = "<ol style=\"margin:0;padding-left:22px\">" + tr("gui.startNote").split(NL).map((s) => "<li style=\"margin:0 0 10px\">" + emph(s).replace("{login}", loginTip).replace("{i}", homeShot) + "</li>").join("") + "</ol>";
  // The banner picture is a local file the owner may swap at any time, so its timestamp rides in the URL.
  // That is what makes a replaced file show up on a plain reload, even in a browser still holding the old
  // copy under the bare /assets/milky-way.png name (the route below answers no-store for the same reason).
  const bannerV = (() => { try { return Math.round(fs.statSync(path.join(REPO, "assets", "milky-way.png")).mtimeMs); } catch (e) { return 0; } })();

  return [
    "<!doctype html><html lang=\"" + pickLang(cfg.language) + "\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>" + esc(tr("gui.title")) + "</title><style>",
    ":root{color-scheme:light dark}body{font-family:system-ui,Segoe UI,Malgun Gothic,sans-serif;margin:0;padding:24px;max-width:900px;line-height:1.5}",
    // The banner sits in the page flow right after the panels, so it stays under the rooms list while
    // nothing is selected and slides further down as the settings, result and log panels appear.
    ".banner{margin:0;border-radius:16px;overflow:hidden;border:1px solid #8886;box-shadow:0 10px 30px #0003}",
    ".banner img{display:block;width:100%;height:auto}",
    "h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 18px;opacity:.7}.oleh{font-weight:400;opacity:.7}",
    "section{border:1px solid #8884;border-radius:10px;padding:14px 16px;margin:0 0 14px}",
    "label.row{display:grid;grid-template-columns:24px minmax(120px,1fr) 150px 76px 92px 74px 72px;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid #8882;cursor:pointer}",
    ".nm{font-weight:600}.who,.id,.sz{opacity:.75;font-size:13px}",
    "button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid #8886;background:#8881;cursor:pointer}",
    "button.mini{padding:3px 9px;font-size:13px;border-radius:6px}.op,.sh{text-align:right}",
    "button.primary{background:#2f6feb;border-color:#2f6feb;color:#fff}button:disabled{opacity:.45;cursor:default}",
    // Feedback for the seconds between pressing Stop and the run really reaching its stopped
    // state. The ring spins and both the button and the phase line breathe, so a click that is
    // waiting on the current page looks different from a click that did nothing at all.
    "@keyframes wdmPulse{0%,100%{opacity:1}50%{opacity:.3}}",
    "@keyframes wdmSpin{to{transform:rotate(360deg)}}",
    "button.busy{animation:wdmPulse 1.1s ease-in-out infinite}",
    "button.busy::after{content:\"\";display:inline-block;width:9px;height:9px;margin-left:7px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:wdmSpin .8s linear infinite;vertical-align:-1px}",
    "#phase.stopping{animation:wdmPulse 1.1s ease-in-out infinite}",
    "@media (prefers-reduced-motion:reduce){button.busy,#phase.stopping,#fill.live,#shFill.live{animation:none}button.busy::after{animation:none}}",
// The Share to Hauitsu button gives a small shake once every five seconds while it sits there: eight
// quick up-and-down passes that are easy to ignore. It claims transform only while the pointer is
// away from the button, so the hover lift and the press stay exactly as they were, it stops by itself
// when the button is disabled (a zip is being built), and it obeys the reduced-motion switch below.
"@keyframes wdmNudge{0%,82%,100%{transform:translateY(0)}84%{transform:translateY(-2px)}86%{transform:translateY(2px)}88%{transform:translateY(-2px)}90%{transform:translateY(2px)}92%{transform:translateY(-2px)}94%{transform:translateY(2px)}96%{transform:translateY(-2px)}98%{transform:translateY(2px)}}",
"#shTo:not(:disabled):not(:hover):not(:active){animation:wdmNudge 5s ease-in-out infinite}",
"@media (prefers-reduced-motion:reduce){#shTo{animation:none !important}}",
    // Ready-to-press feedback for every button: it lifts under the cursor and sinks when pressed, so
    // a click is felt even when the real answer happens outside the page. Disabled buttons stay put.
    "button{transition:transform .14s ease,box-shadow .14s ease}",
    "button:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 4px 10px #0002}",
    "button:active:not(:disabled){transform:translateY(1px) scale(.97);box-shadow:0 1px 2px #0002}",
    "@media (prefers-reduced-motion:reduce){button{transition:none}button:hover,button:active{transform:none;box-shadow:none}}",
    "#log,#shLog{white-space:pre-wrap;font:12px/1.45 ui-monospace,Consolas,monospace;max-height:280px;overflow:auto;background:#8881;border-radius:8px;padding:10px;margin:0}",
    "#shLog{max-height:150px;margin-top:12px}",
    "#bar,#shBar{height:6px;background:#8883;border-radius:3px;overflow:hidden;margin:10px 0}#fill,#shFill{display:block;height:100%;width:0;background:#2f6feb;transition:width .4s}",
    // Only the bar that belongs to the job running right now crawls, so a slow page still looks
    // busy instead of frozen. Both bars go back to a plain solid fill the moment their job ends.
    "@keyframes wdmCrawl{from{background-position:0 0}to{background-position:36px 0}}",
    "#fill.live,#shFill.live{background-color:#2f6feb;background-image:linear-gradient(45deg,#ffffff40 25%,transparent 25%,transparent 50%,#ffffff40 50%,#ffffff40 75%,transparent 75%,transparent);background-size:36px 36px;animation:wdmCrawl 1s linear infinite}",
    // Every row is a positioned ancestor for the row-wide tooltips below: a tip that drops its own
    // anchor (".tipwrap.flow") is measured against the row it belongs to, never against the page.
    ".grid{display:flex;gap:10px;flex-wrap:wrap;align-items:center;position:relative}.muted{opacity:.7;font-size:13px}",
    // One line per finished room. A run can cover several rooms and each ends with its own export, so
    // the three buttons sit in the row they belong to instead of on whichever room finished last.
    ".resrow{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:center;padding:7px 0;border-bottom:1px solid #8882}",
    ".resrow:last-child{border-bottom:0}",
    // The estimate explains itself on hover only, so the page stays short. Showing it is still pure
    // CSS; the nudging back inside the window (fitTip below) is the one part CSS cannot work out for
    // itself. That nudge rides its own "translate", so the centring a screenshot tip does with
    // "transform" is left alone, and a tip taller than the window scrolls instead of being cut off.
    ".tipwrap{position:relative;display:inline-block;cursor:help}",
    ".tip{display:none;position:absolute;left:0;top:100%;z-index:5;min-width:460px;margin-top:8px;padding:10px 12px;border:1px solid #8886;border-radius:8px;background:Canvas;color:CanvasText;font-size:13px;line-height:1.45;box-shadow:0 6px 18px #0003;translate:var(--tipdx,0) var(--tipdy,0);max-height:calc(100vh - 20px);overflow:auto}",
    ".tipwrap:hover .tip{display:block}",
    // A tip that belongs to a whole row, not to one word in it: it gives up its own anchor so it can
    // start at the left edge of the row and run the row's width. The row it sits in is then its
    // containing block, which is why every row carries "position:relative" (see the .grid rule above) -
    // without that the tip is measured against the page and lands nowhere near its own (i).
    ".tipwrap.flow{position:static}",
    ".tipwrap.flow .tip{min-width:min(460px,100%)}",
    // A tooltip at the end of a line has nowhere to grow to the right, so it grows left instead of
    // running off the panel. The wrapper keeps its own position, which is what anchors it to the icon.
    // It also drops the 460px floor the left-aligned tips use: with the right edge pinned to the icon a
    // floor would show up as dead space beside the words, so this one is exactly as wide as its sentence
    // (and wraps once that would pass 460px, or 86vw on a narrow window).
    ".tipwrap.end .tip{left:auto;right:0;min-width:0;width:max-content;max-width:min(460px,86vw)}",
".tipwrap:focus-within .tip{display:block}",
".tip.shot{left:50%;transform:translateX(-50%);min-width:0;width:min(620px,86vw);padding:8px}",
".tip.shot img{display:block;width:100%;height:auto;border-radius:6px;border:1px solid #8884}",
".tip.shot .cap{display:block;margin-top:6px;font-size:12px;line-height:1.4;opacity:.85}",
    ".info{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #8888;border-radius:50%;font-size:11px;font-weight:700;font-style:italic;line-height:1;opacity:.75}",
    // The fields follow the page's own color scheme. Leaving the box transparent let the browser
    // paint it on its own, and in dark mode a select came out white on white - the value was
    // invisible until the pointer hovered it. System colors keep the text and its box in one scheme.
    "input[type=text],select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid #8886;background:Canvas;color:CanvasText}",
    "select:disabled,input[type=text]:disabled{opacity:.55;cursor:default}",
    "details.adv summary{cursor:pointer;font-size:13px;opacity:.75}details.adv[open] summary{margin-bottom:2px}",
    "em{font-style:italic}em strong,strong em{font-style:normal;font-weight:700}",
    "</style></head><body>",
    "<h1>" + esc(tr("gui.title")) + " <span class=\"oleh unis\">" + esc(tr("gui.titleUnis")) + "</span> <span class=\"oleh\">" + esc(tr("gui.titleBy")) + "</span></h1><p class=\"sub\">" + esc(tr("gui.tagline")) + "</p>",
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
// Share has its own popup: quality is one dropdown, the zip is one button, and once a zip exists
// the folder that holds it is one more click.
"<div id=\"shModal\" style=\"display:none;position:fixed;inset:0;background:#0009;align-items:center;justify-content:center;padding:20px;z-index:10\">",
"<div style=\"max-width:560px;width:100%;background:Canvas;color:CanvasText;border:1px solid #8886;border-radius:12px;padding:18px 20px\">",
"<div id=\"shTitle\" style=\"font-size:16px;font-weight:600\"></div>",
"<div id=\"shNow\" class=\"muted\" style=\"margin:6px 0 4px\"></div>",
// What the zip is expected to weigh, filled in from the server when the popup opens. It sits under the
// line above and follows the quality dropdown, so the choice and what it costs are read together.
"<div id=\"shEst\" class=\"muted\" style=\"display:none;margin:0 0 14px\"></div>",
"<div class=\"grid\"><label>" + esc(tr("gui.shareQuality")) + " <select id=\"shQ\">",
"<option value=\"full\">" + esc(tr("gui.shareFull")) + "</option>",
"<option value=\"low\">" + esc(tr("gui.shareLowQ")) + "</option>",
"</select></label><span class=\"tipwrap\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.shareHint")) + "</span></span></div>",
"<div class=\"grid\" style=\"margin-top:14px\"><button id=\"shGo\" class=\"primary\">" + esc(tr("gui.shareGenerate")) + "</button>",
"<button id=\"shFolder\" style=\"display:none\">" + esc(tr("gui.openFolder")) + "</button>",
"<button id=\"shTo\" style=\"display:none\">" + esc(tr("gui.shareTo", { name: cfg.collectName })) + "</button>",
"<button id=\"shClose\">" + esc(tr("gui.cancel")) + "</button></div>",
// The link opens in the normal browser; the zip itself travels the way the two of them agree on.
"<div id=\"shBar\" style=\"display:none\"><i id=\"shFill\"></i></div>",
"<div id=\"shLog\" style=\"display:none\"></div>",
"</div></div>",
// Once a room is complete the author asks for it himself: a short chat, then the one button that
// matters. The room name is filled in when the popup opens, because the same popup also comes up on
// its own carrying several rooms at once.
"<div id=\"toModal\" style=\"display:none;position:fixed;inset:0;background:#0009;align-items:center;justify-content:center;padding:20px;z-index:11\">",
"<div style=\"max-width:520px;width:100%;background:Canvas;color:CanvasText;border:1px solid #8886;border-radius:12px;padding:18px 20px\">",
"<div id=\"toTitle\" style=\"font-size:16px;font-weight:600;margin-bottom:12px\"></div>",
"<div id=\"toChat\" style=\"display:flex;flex-direction:column;gap:8px;align-items:flex-start\"></div>",
"<div id=\"toHint\" class=\"muted\" style=\"display:none;margin-top:12px\"></div>",
"<div class=\"grid\" style=\"margin-top:16px\"><button id=\"toGo\" class=\"primary\">" + esc(tr("gui.toDrive", { name: cfg.collectName })) + "</button>",
"<button id=\"toClose\">" + esc(tr("gui.toClose")) + "</button></div></div></div>",
    "<div id=\"under\" style=\"display:none\">",
    "<section>",
    "<div class=\"grid\" style=\"margin-top:8px\"><span id=\"total\" class=\"muted\"></span>",
    "<span class=\"tipwrap flow\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.estHint", { v: fmtSize(Number(cfg.estimateGb || 3) * GIB) })) + "</span></span></div>",
    "<div class=\"grid\" style=\"margin-top:8px\"><label>" + esc(tr("gui.share")) + " <select id=\"share\">" + shareOpts + "</select></label>",
    "<span class=\"tipwrap flow\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.shareHint")) + "</span></span></div>",
    "<details class=\"adv\" style=\"margin-top:20px\"><summary>" + esc(tr("gui.advanced")) + "</summary>",
    "<div class=\"grid\" style=\"margin-top:8px\"><label>" + esc(tr("gui.tz")) + " <select id=\"tz\">" + opts + "</select></label>",
    "<span class=\"muted\">" + esc(tr("gui.tzHint", { v: machine })) + "</span></div>",
    // Small copies of the media, so the page and the gallery open quickly. On by default: it is built
    // beside the download and cached, and it is the difference between reading 29 MB and 2 GB.
    "<div class=\"grid\" style=\"margin-top:8px\"><label><input type=\"checkbox\" id=\"thumbs\"" + (String(cfg.thumbs || "auto") === "off" ? "" : " checked") + "> " + esc(tr("gui.thumbs")) + "</label>",
    "<span class=\"tipwrap flow\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.thumbsHint")) + "</span></span></div>",
    "<div class=\"grid\" style=\"margin-top:8px\"><label>" + esc(tr("gui.browser")) + " <select id=\"browser\">" + browserOpts + "</select></label>",
    "<span class=\"tipwrap flow\"><span class=\"info\" tabindex=\"0\">i</span><span class=\"tip\">" + esc(tr("gui.browserPickHint")) + "</span></span></div></details>",
    "<div class=\"grid\" style=\"margin-top:14px\"><span class=\"tipwrap\"><button id=\"start\" class=\"primary\">" + esc(tr("gui.start")) + "</button>",
    "<span class=\"tip\">" + esc(tr("gui.browserHint")) + "</span></span>",
    "<button id=\"stop\" disabled>" + esc(tr("gui.stop")) + "</button>",
    "<span id=\"authedWrap\" style=\"display:none\"><span class=\"muted\">" + esc(tr("gui.authedHint")) + "</span> <button id=\"bAuthed\">" + esc(tr("gui.authed")) + "</button></span>",
    "<span id=\"phase\" class=\"muted\"></span></div>",
    "<div id=\"bar\" style=\"display:none\"><i id=\"fill\"></i></div></section>",


    "<section id=\"result\" style=\"display:none\"><strong>" + esc(tr("gui.result")) + "</strong>",
    // One line per room, each with its own three buttons. These lines are the only way to open a
    // finished room, so a run of several rooms leaves none of them behind.
    "<div id=\"resrows\"></div></section>",

    // The same steps the Start popup shows, still on the page while the login wait runs, so nobody
    // has to remember what the popup said after dismissing it.
    "<section id=\"loginNote\" style=\"display:none\">" + noteHtml + "</section>",
    "<section id=\"logBox\" style=\"display:none\"><strong>" + esc(tr("gui.log")) + "</strong><div id=\"log\"></div></section>",
    "</div>",
    "<div class=\"banner\"><img src=\"/assets/milky-way.png?v=" + bannerV + "\" alt=\"\"></div>",
    "<script>",
    "var MSG={pick:" + JSON.stringify(tr("gui.pickRoom")) + ",total:" + JSON.stringify(tr("gui.totalSel")) + ",none:" + JSON.stringify(tr("gui.totalNone")) + ",self:" + JSON.stringify(tr("gui.totalSelf")) + ",savedNote:" + JSON.stringify(tr("gui.totalSaved")) + ",zipNote:" + JSON.stringify(tr("gui.totalZip")) + ",zipLow:" + JSON.stringify(tr("gui.totalZipLow")) + ",allNote:" + JSON.stringify(tr("gui.totalAll")) + ",authed:" + JSON.stringify(tr("gui.authed")) + ",retry:" + JSON.stringify(tr("gui.retry")) + ",shTitle:" + JSON.stringify(tr("gui.sharePopup")) + ",shHave:" + JSON.stringify(tr("gui.shareHas")) + ",shNone:" + JSON.stringify(tr("gui.shareNone")) + ",shNeedPub:" + JSON.stringify(tr("gui.shareNeedPub")) + ",shEst:" + JSON.stringify(tr("gui.shareEst")) + ",shEstLow:" + JSON.stringify(tr("gui.shareEstLow")) + ",shWorking:" + JSON.stringify(tr("gui.phase.bundle")) + ",shGenerate:" + JSON.stringify(tr("gui.shareGenerate")) + ",shDone:" + JSON.stringify(tr("gui.shareDone")) + ",shFail:" + JSON.stringify(tr("gui.shareFail")) + ",shGoTip:" + JSON.stringify(tr("gui.shareHint")) + "};",
    "function el(s){return document.querySelector(s);}",
    // The page script is plain text sent to the browser, so every helper it calls has to travel with
    // it. em() below calls esc(), so esc() is inlined here the same way fmtSize() is further down -
    // without it every estimate threw "esc is not defined" and #total stayed empty.
    "var esc=" + esc.toString() + ";",
    // The author own message, one bubble per line; {v} is filled with the room - or the rooms -
    // this popup is about, so the same message covers the surprise that lists several at once.
    "MSG.toTitle=" + JSON.stringify(tr("gui.toTitle")) + ";",
    "MSG.toNoZip=" + JSON.stringify(tr("gui.toNoZip")) + ";",
    "MSG.toNoLink=" + JSON.stringify(tr("gui.toNoLink")) + ";",
    "MSG.rowDm=" + JSON.stringify(tr("gui.openChat")) + ";",
    "MSG.rowFolder=" + JSON.stringify(tr("gui.openFolder")) + ";",
    "MSG.rowZip=" + JSON.stringify(tr("gui.openZip")) + ";",
    "var TO=[" + [tr("gui.toL1"), tr("gui.toL2"), tr("gui.toL3"), tr("gui.toL4"), tr("gui.toL5"), tr("gui.toL6"), tr("gui.toL7"), tr("gui.toL8"), tr("gui.toL9")].map(function(s){return JSON.stringify(s);}).join(",") + "];",
    "function em(s){return esc(String(s)).replace(/\\*\\*([^*]+)\\*\\*|\\*([^*]+)\\*/g,function(m,b,i){return b!==undefined?\"<strong>\"+b+\"</strong>\":\"<em>\"+i+\"</em>\";});}",
    "function all(v){document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){c.checked=v;});total();}",
    "var fmtSize=" + fmtSize.toString() + ";",
    "function total(){",
    "  under();",
    // Nothing ticked still has an answer: the whole list is quoted, so the number is there before any
    // click. A tick narrows the same estimate down to what is actually selected.
    "  var n=0,full=0,saved=0,all=0,allFull=0,allSaved=0;",
    "  document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){all++;var fu=Number(c.dataset.full||0),sa=Number(c.dataset.saved||0);allFull+=fu;allSaved+=sa;if(!c.checked)return;n++;full+=fu;saved+=sa;});",
    "  var mine=n>0;",
    "  if(!mine){n=all;full=allFull;saved=allSaved;}",
    "  if(!n){el(\"#total\").innerHTML=MSG.none;return;}",
    "  var t=em(mine?MSG.total:MSG.self).replace(\"{n}\",\"<strong>\"+n+\"</strong>\").replace(\"{v}\",\"<strong>\"+fmtSize(full)+\"</strong>\");",
    "  if(saved>0)t+=em(MSG.savedNote).replace(\"{s}\",\"<strong>\"+fmtSize(saved)+\"</strong>\");",
    "  var mode=el(\"#share\").value;",
    "  if(mode!==\"no\"){",
    // A re-compressed zip is a choice inside the Share popup (and in wdm share --low), so this line
    // is only ever reached with "yes": no mode of #share can be "low" any more.
    "    t+=em(MSG.zipNote).replace(\"{z}\",\"<strong>\"+fmtSize(full)+\"</strong>\");",
    // What ends up on disk: the conversation, plus the zip beside it when one is written. A
    // re-compressed zip is a fraction of the conversation and guessing that fraction would be
    // worse than saying "much smaller", so in low mode only the conversation is counted.
    "    t+=em(MSG.allNote).replace(\"{t}\",\"<strong>\"+fmtSize(full*2)+\"</strong>\");",
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
    "async function stop(){stopping=true;paintStop(true);try{await fetch(\"/api/stop\",{method:\"POST\"});}catch(err){stopping=false;}tick();}",
    "async function openRoom(slug,btn){if(!cool('room:'+slug,btn))return;await fetch(\"/api/open\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({what:\"room\",slug:slug})});}",
    "async function setLang(v){await fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({language:v})});location.reload();}",
    "async function openItSlug(what,slug,btn){if(!cool(what,btn))return;await fetch(\"/api/open\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({what:what,slug:slug})});}",
    // The Result panel used to describe the last room of the run only, with one set of buttons under
    // it, so a run of several rooms left every earlier one without a way back to its page. Every room
    // now gets its own line - in the order they ran, each line arriving as that room finishes.
    "function paintResults(rs){",
    "  var box=el(\"#resrows\");",
    "  var sig=rs.map(function(x){return (x.slug||\"\")+\"|\"+(x.ids||\"\")+\"|\"+(x.meta||\"\");}).join(\";\");",
    "  if(box.dataset.sig===sig)return;",
    "  box.dataset.sig=sig;box.textContent=\"\";",
    "  rs.forEach(function(x){",
    "    var row=document.createElement(\"div\");row.className=\"resrow\";",
    "    var ln=document.createElement(\"span\");ln.className=\"muted\";ln.textContent=x.line+(x.meta?\" (\"+x.meta+\")\":\"\");",
    "    row.appendChild(ln);",
    "    var g=document.createElement(\"div\");g.className=\"grid\";",
    "    [[\"room\",MSG.rowDm],[\"folder\",MSG.rowFolder],[\"zip\",MSG.rowZip]].forEach(function(p){",
    "      var b=document.createElement(\"button\");b.type=\"button\";b.className=\"mini\";b.dataset.what=p[0];b.dataset.slug=x.slug||\"\";b.textContent=p[1];g.appendChild(b);",
    "    });",
    "    row.appendChild(g);box.appendChild(row);",
    "  });",
    "}",
    // Every tip is up to 620px wide and hangs off the side of whatever carries it, so one near the
    // edge of the window used to be cut off. It is measured before it can be seen and nudged back
    // inside: sideways first, then upwards when the bottom would be out of reach. A tip taller than
    // the window ends up pinned to its top and scrolls, which is what the max-height above is for.
    "function fitTip(wrap){",
    "  var tip=wrap.querySelector(\".tip\");",
    "  if(!tip)return;",
    "  tip.style.setProperty(\"--tipdx\",\"0px\");tip.style.setProperty(\"--tipdy\",\"0px\");",
    "  var wasShown=tip.style.display;",
    "  tip.style.display=\"block\";tip.style.visibility=\"hidden\";",
    "  var r=tip.getBoundingClientRect();",
    "  tip.style.display=wasShown;tip.style.visibility=\"\";",
    "  if(!r.width&&!r.height)return;",
    "  var pad=10,vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight,dx=0,dy=0;",
    "  if(r.right>vw-pad)dx=(vw-pad)-r.right;",
    "  if(r.left+dx<pad)dx=pad-r.left;",
    "  if(r.bottom>vh-pad)dy=(vh-pad)-r.bottom;",
    "  if(r.top+dy<pad)dy=pad-r.top;",
    "  if(dx)tip.style.setProperty(\"--tipdx\",dx+\"px\");",
    "  if(dy)tip.style.setProperty(\"--tipdy\",dy+\"px\");",
    "}",
    "var fittedWrap=null;",
    "function fitFrom(e){",
    "  var w=(e.target&&e.target.closest)?e.target.closest(\".tipwrap\"):null;",
    "  if(!w||w===fittedWrap)return;",
    "  fittedWrap=w;fitTip(w);",
    "}",
    "document.addEventListener(\"mouseover\",fitFrom,true);",
    "document.addEventListener(\"focusin\",fitFrom,true);",
    "document.addEventListener(\"mouseout\",function(e){if(fittedWrap&&(!e.relatedTarget||!fittedWrap.contains(e.relatedTarget)))fittedWrap=null;},true);",
    "window.addEventListener(\"resize\",function(){fittedWrap=null;document.querySelectorAll(\".tipwrap:hover\").forEach(fitTip);});",
    "window.addEventListener(\"scroll\",function(){document.querySelectorAll(\".tipwrap:hover\").forEach(fitTip);},true);",
    // The page was built from exactly this list of rooms. When the poll reports a different one - a room
// added to rooms.unis.json while the window was open - only a fresh page can show that row.
"var ROWSIG=" + JSON.stringify(listSignature(list)) + ";",
"var lastReload=0;",
"var shSlug=\"\",lastRooms=[],lastShare=null,shEstBytes=0,toSurprise=false,DBG=false;",
    "var stopping=false;",
    "var LBL={stop:" + JSON.stringify(tr("gui.stop")) + ",stopping:" + JSON.stringify(tr("gui.stopping")) + ",settling:" + JSON.stringify(tr("gui.settling")) + ",wait:" + JSON.stringify(tr("gui.wait")) + "};",
    // Every button that opens something - the room page, a folder, the share folder, the collector
    // link - waits five seconds after a press. The wait is read from the clock rather than counted
    // down, so a button can never be left stuck disabled, and it says how long is left instead of
    // looking clickable while it ignores you. Two quick presses used to open two windows.
    "var COOL={},COOLMS=5000;",
    "function coolLeft(k){var c=COOL[k];if(!c)return 0;var d=c.until-Date.now();if(d<=0){if(c.btn){c.btn.textContent=c.lbl;c.btn.disabled=c.was;}delete COOL[k];return 0;}return d;}",
    "function cool(k,btn){if(coolLeft(k))return false;COOL[k]={btn:btn||null,lbl:btn?btn.textContent:'',was:btn?!!btn.disabled:false,until:Date.now()+COOLMS};paintCool();return true;}",
    "function paintCool(){for(var k in COOL){var left=coolLeft(k);if(!left)continue;var c=COOL[k],b=c.btn;if(!b)continue;b.disabled=true;b.textContent=LBL.wait.replace('{s}',Math.ceil(left/1000));}}",
    "function paintStop(run){el(\"#stop\").disabled=stopping||!run;el(\"#stop\").textContent=stopping?LBL.stopping:LBL.stop;el(\"#stop\").className=stopping?\"busy\":\"\";el(\"#phase\").className=stopping?\"muted stopping\":\"muted\";}",
    "function roomInfo(slug){for(var i=0;i<lastRooms.length;i++){if(lastRooms[i].slug===slug)return lastRooms[i];}return null;}",
    "function hideShare(){el(\"#shModal\").style.display=\"none\";}",
// Cancel means cancel: while a zip is being built, the same button stops it - the window stays
// open with the log saying so, and everything comes back once the job has unwound. Otherwise it
// just closes the window. Escape and the backdrop go through here too, so no path can leave a
// job running with the console gone quiet.
"async function closeShare(){",
"  if(lastShare&&lastShare.running){",
"    try{await fetch(\"/api/share/stop\",{method:\"POST\"});}catch(err){}",
"    tick();",
"    return;",
"  }",
"  hideShare();",
"}",
    "function paintShare(info,sh){",
    "  var can=!!(info&&info.canZip)||!!(info&&info.canBuild);",
    "  var line=!can?MSG.shNeedPub:(info&&info.zip?MSG.shHave.replace(\"{v}\",info.zip.name+\" (\"+fmtSize(info.zip.bytes)+\")\"):MSG.shNone);",
    "  if(sh&&sh.running)line=MSG.shWorking+(sh.low?\" (low)\":\"\")+\"...\";",
    "  else if(sh&&sh.error)line=MSG.shFail.replace(\"{v}\",sh.error);",
    "  else if(sh&&sh.result)line=MSG.shDone.replace(\"{v}\",sh.result.name+\" (\"+fmtSize(sh.result.bytes)+\")\");",
    "  el(\"#shNow\").textContent=line;",
    "  var busy=!!(sh&&sh.running);",
    "  el(\"#shGo\").disabled=busy||!can;",
    "  el(\"#shGo\").textContent=busy?MSG.shWorking+\"...\":MSG.shGenerate;",
    "  el(\"#shQ\").disabled=busy;",
    "  el(\"#shFolder\").style.display=(info&&info.zip)?\"\":\"none\";",
    "  el(\"#shFolder\").disabled=busy||!!coolLeft('shareFolder');",
    "  el(\"#shTo\").style.display=(info&&info.canShare)?\"\":\"none\";",
    "  el(\"#shTo\").disabled=busy;",
    "  if(busy){el(\"#shBar\").style.display=\"\";el(\"#shLog\").style.display=\"\";}",
    "}",
    "function paintEst(){",
    "  var e=el(\"#shEst\");",
    "  if(!shEstBytes){e.style.display=\"none\";return;}",
    "  e.textContent=(el(\"#shQ\").value===\"low\"?MSG.shEstLow:MSG.shEst).replace(\"{v}\",fmtSize(shEstBytes));",
    "  e.style.display=\"\";",
    "}",
    "async function loadEst(slug){",
    "  shEstBytes=0;paintEst();",
    "  try{",
    "    var r=await fetch(\"/api/zipest?slug=\"+encodeURIComponent(slug));",
    "    var j=await r.json();",
    "    if(shSlug!==slug)return;",
    "    if(j&&j.ok&&j.bytes)shEstBytes=j.bytes;",
    "  }catch(err){shEstBytes=0;}",
    "  paintEst();",
    "}",
    "function showShare(slug){",
    "  shSlug=slug;",
    "  var info=roomInfo(slug)||{};",
    "  el(\"#shTitle\").textContent=MSG.shTitle.replace(\"{v}\",info.label||slug);",
    "  el(\"#shQ\").value=\"full\";",
    "  el(\"#shLog\").textContent=\"\";el(\"#shLog\").style.display=\"none\";",
    "  el(\"#shBar\").style.display=\"none\";el(\"#shFill\").style.width=\"0%\";el(\"#shFill\").className=\"\";",
    "  paintShare(info,(lastShare&&lastShare.slug===slug&&!lastShare.result&&!lastShare.error)?lastShare:null);",
    "  loadEst(slug);",
    "  el(\"#shModal\").style.display=\"flex\";",
    "}",
    // Every bubble is a plain div filled with textContent, so nothing in the message can turn into
    // markup, and the room list is substituted in only here.
    "function showCollect(names,noZip){",
    "  var box=el(\"#toChat\");box.textContent=\"\";",
    "  TO.forEach(function(t){",
    "    var d=document.createElement(\"div\");",
    "    d.style.cssText=\"background:#8882;border-radius:14px;padding:8px 12px;max-width:92%;white-space:pre-wrap\";",
    "    d.textContent=t.replace(\"{v}\",names.join(\", \"));",
    "    box.appendChild(d);",
    "  });",
    "  el(\"#toTitle\").textContent=MSG.toTitle;",
    "  el(\"#toHint\").textContent=MSG.toNoZip;",
    "  el(\"#toHint\").style.display=noZip?\"\":\"none\";",
    "  el(\"#toModal\").style.display=\"flex\";",
    "  fetch(\"/api/collect-seen\",{method:\"POST\"});",
    "}",
    "function hideCollect(){el(\"#toModal\").style.display=\"none\";}",
    "async function genZip(){",
    "  if(!shSlug)return;",
    "  var info=roomInfo(shSlug)||{};",
    "  if(!info.canZip){alert(MSG.shNeedPub);return;}",
    "  await fetch(\"/api/share\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({slug:shSlug,low:el(\"#shQ\").value===\"low\"})});",
    "  tick();",
    "}",
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
    // Writing the log must never fight the reader: the box follows new lines only while it was
    // already at the bottom, so scrolling up to read something stays put. Identical text is skipped
    // too - rewriting it once a second was the other half of the jump.
    "function logTo(box,teks){",
    "  if(box.textContent===teks)return;",
    "  var stick=box.scrollHeight-box.scrollTop-box.clientHeight<24;",
    "  box.textContent=teks;",
    "  if(stick)box.scrollTop=box.scrollHeight;",
    "}",
    "async function tick(){",
    "  var s=null;",
    "  try{ s=await (await fetch(\"/api/state\")).json(); }catch(e){ return; }",
    // The very first run that leaves them holding a room worth asking about puts the message on
    // screen by itself - once per install, and never on top of the Share popup.
    "  if(s.surprise&&s.surprise.length&&!toSurprise&&el(\"#shModal\").style.display===\"none\"){",
    "    toSurprise=true;showCollect(s.surprise);",
    "  }",
    "  el(\"#phase\").textContent=s.phaseText;",
    "  el(\"#fill\").style.width=(s.percent||0)+\"%\";el(\"#fill\").className=s.running?\"live\":\"\";",
    "  logTo(el(\"#log\"),s.log.join(String.fromCharCode(10)));",
    "  if(stopping&&(s.phase===\"stopped\"||!s.running))stopping=false;",
    "  el(\"#start\").disabled=s.running;",
    "  paintStop(!!s.running);",
    "  var settling=!!s.settle;",
    "  el(\"#authedWrap\").style.display=(s.hurryMode||settling)?\"\":\"none\";",
    "  el(\"#bAuthed\").textContent=settling?LBL.settling:((s.hurryMode===\"retry\")?MSG.retry:MSG.authed);",
    // Same busy look the Stop button wears while it works: pulse plus inline spinner, and no second
    // press while the hand-over is already on its way.
    "  el(\"#bAuthed\").className=settling?\"busy\":\"\";",
    "  el(\"#bAuthed\").disabled=settling;",
    "  el(\"#loginNote\").style.display=(s.running&&s.phase===\"browser\")?\"\":\"none\";",
    "  var rr=s.results||[];",
    "  el(\"#result\").style.display=rr.length?\"block\":\"none\";",
    "  under(!!s.running||rr.length>0);",
    "  paintResults(rr);",
    "  document.querySelectorAll(\"#rooms button[data-slug]\").forEach(function(b){var hit=null;(s.rooms||[]).forEach(function(x){if(x.slug===b.dataset.slug)hit=x;});if(!hit)return;b.disabled=!hit.open||!!coolLeft('room:'+b.dataset.slug);b.parentNode.style.visibility=hit.open?\"\":\"hidden\";});",
    "  lastRooms=s.rooms||[];lastShare=s.share||null;DBG=!!s.debug;",
    "  var sbusy=!!s.running||!!(s.share&&s.share.running);",
    "  var sAllowPick=false;",
    // Open in the two moments a change means something: while the page sits idle it is simply the
    // setting for the next run, and during the sign-in wait the pick is carried straight into the run
    // that is waiting (see /api/config). While a run is actually harvesting the picker is shut,
    // because the browser of that run cannot be changed under it.
    "  sAllowPick=!sbusy||!!(s.running&&s.phase===\"browser\");",
    "  el(\"#browser\").disabled=!sAllowPick;",
    "  el(\"#start\").disabled=sbusy;",
    "  document.querySelectorAll(\"#rooms button[data-share]\").forEach(function(b){var h=roomInfo(b.dataset.share);var can=DBG||!!(h&&h.open);b.disabled=sbusy;b.parentNode.style.visibility=can?\"\":\"hidden\";if(h)b.title=h.zip?MSG.shHave.replace(\"{v}\",h.zip.name+\" (\"+fmtSize(h.zip.bytes)+\")\"):MSG.shGoTip;});",
// The rows own numbers are the one thing the page cannot work out for itself: they need the room
// page and every media file it points at. The server hands them over, and this writes them back
// only when they really moved, so a page sitting idle does no work at all.
    "  var nubah=false;",
    "  document.querySelectorAll(\"#rooms input[data-slug]\").forEach(function(c){var hit=null;(s.rooms||[]).forEach(function(x){if(x.slug===c.dataset.slug)hit=x;});if(!hit||hit.text===undefined)return;",
    "    if(String(hit.full)!==c.dataset.full||String(hit.saved)!==c.dataset.saved){c.dataset.full=hit.full;c.dataset.saved=hit.saved;nubah=true;}",
    "    var z=c.parentNode?c.parentNode.querySelector(\".sz\"):null;if(z&&z.textContent!==hit.text)z.textContent=hit.text;});",
    "  if(nubah)total();",
// A row that was not there when this page was built cannot be patched in, so that one case waits
// for an idle moment and then reloads the page itself. The five seconds keep a churn from looping.
    "  if(s.rowsig&&s.rowsig!==ROWSIG&&!sbusy&&Date.now()-lastReload>5000){lastReload=Date.now();location.reload();}",
    "  if(shSlug&&el(\"#shModal\").style.display!==\"none\"){",
    "    var sj=(s.share&&s.share.slug===shSlug)?s.share:null;",
    "    paintShare(roomInfo(shSlug),sj);",
    "    el(\"#shFill\").className=(sj&&s.share&&s.share.running)?\"live\":\"\";",
    "    if(sj){el(\"#shFill\").style.width=(sj.percent||0)+\"%\";logTo(el(\"#shLog\"),(sj.log||[]).join(String.fromCharCode(10)));}",
    "  }",
    "}",
    "el(\"#bAll\").addEventListener(\"click\",function(){all(true);});",
    "el(\"#bNone\").addEventListener(\"click\",function(){all(false);});",
    "el(\"#rooms\").addEventListener(\"change\",total);",
    "el(\"#rooms\").addEventListener(\"click\",function(e){var b=(e.target&&e.target.closest)?e.target.closest(\"button[data-slug]\"):null;if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();openRoom(b.dataset.slug,b);});",
    "el(\"#share\").addEventListener(\"change\",function(){total();fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({shareMode:el(\"#share\").value})});});",
    "el(\"#start\").addEventListener(\"click\",askStart);",
    "el(\"#mGo\").addEventListener(\"click\",start);",
    "el(\"#mNo\").addEventListener(\"click\",hideModal);",
    "el(\"#modal\").addEventListener(\"click\",function(e){if(e.target===el(\"#modal\"))hideModal();});",
    "document.addEventListener(\"keydown\",function(e){if(e.key===\"Escape\"){hideModal();closeShare();hideCollect();}});",
    "el(\"#stop\").addEventListener(\"click\",stop);",
    "el(\"#bAuthed\").addEventListener(\"click\",function(){fetch(\"/api/hurry\",{method:\"POST\"});});",
    "el(\"#resrows\").addEventListener(\"click\",function(e){var b=(e.target&&e.target.closest)?e.target.closest(\"button[data-what]\"):null;if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();openItSlug(b.dataset.what,b.dataset.slug,b);});",
    // The row is a label, so the click is stopped before it reaches the checkbox underneath.
    "el(\"#rooms\").addEventListener(\"click\",function(e){var b=(e.target&&e.target.closest)?e.target.closest(\"button[data-share]\"):null;if(!b||b.disabled)return;e.preventDefault();e.stopPropagation();showShare(b.dataset.share);});",
    "el(\"#shGo\").addEventListener(\"click\",genZip);",
    "el(\"#shQ\").addEventListener(\"change\",paintEst);",
    "el(\"#shClose\").addEventListener(\"click\",closeShare);",
    "el(\"#shFolder\").addEventListener(\"click\",function(){if(shSlug)openItSlug('shareFolder',shSlug,el('#shFolder'));});",
    "el(\"#shTo\").addEventListener(\"click\",function(){var h=roomInfo(shSlug)||{};showCollect([h.name||h.label||shSlug],!h.zip);});",
    "el(\"#toGo\").addEventListener(\"click\",function(){if(!cool('collect',el('#toGo')))return;fetch(\"/api/open\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({what:\"collect\"})}).then(function(r){return r.json();}).then(function(j){if(!j||!j.ok)alert(MSG.toNoLink);}).catch(function(){alert(MSG.toNoLink);});});",
    "el(\"#toClose\").addEventListener(\"click\",hideCollect);",
    "el(\"#toModal\").addEventListener(\"click\",function(e){if(e.target===el(\"#toModal\"))hideCollect();});",
    "el(\"#shModal\").addEventListener(\"click\",function(e){if(e.target===el(\"#shModal\"))closeShare();});",
    "el(\"#lang\").addEventListener(\"change\",function(e){setLang(e.target.value);});",
    "el(\"#tz\").addEventListener(\"change\",function(){fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({language:el(\"#lang\").value,tz:el(\"#tz\").value})});});",
    "el(\"#thumbs\").addEventListener(\"change\",function(e){fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({thumbs:e.target.checked?\"on\":\"off\"})});});",
    "el(\"#browser\").addEventListener(\"change\",function(e){fetch(\"/api/config\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({browserPath:e.target.value})}).then(function(r){return r.json();}).then(function(j){if(j&&j.applied)tick();});});",
    "total();",
    "setInterval(tick,1000); tick(); setInterval(paintCool,200);",
    "</script></body></html>",
  ].join(NL);
}

// The cooldown is read from the clock, so it ends by itself: it can never outlive the run, and it
// does not wait for the hand-over to report back (that would hold the button for a whole minute).
function settling() { return !!state.running && state.settleUntil > Date.now() && state.phase === "browser"; }
function settleLeft() { return Math.max(1, Math.ceil((state.settleUntil - Date.now()) / 1000)); }

function stateJson() {

  const tr = t();
  const key = "gui.phase." + state.phase;
  let text = tr(key);
  if (text === key) text = state.phase;
  // While the login wait runs, say what is actually being waited for instead of "Starting the browser".
  // The cooldown line comes first: the window is opening again already, so the countdown is the honest
  // thing to show while that button is busy.
  if (settling()) text = tr("gui.settleHint", { s: settleLeft() });
  if (state.phase === "browser" && state.loginWait) text = tr("gui.loginHint");
if (state.phase === "browser" && state.plainWait) text = tr("gui.plainHint");
  if (state.error) text = tr("gui.phase.error") + ": " + state.error;
  if (state.slug && (state.phase === "harvest" || state.phase === "media" || state.phase === "render")) {
    text += " - " + state.roomName + (state.progress ? " (" + state.progress.line + ")" : "");
  }
  if (state.phase === "idle") { state.percent = 0; state.floor = 0; }
  const list = rooms(cfg);
  return {
    pid: process.pid,
    phase: state.phase, phaseText: text, running: state.running, percent: state.percent, hurryMode: hurryMode(state),
    settle: settling(),
    // The once-per-install popup: a finished run that left them holding a complete room puts the
    // author own message on screen without a click. Empty means there is nothing to show.
    surprise: state.surprise || null,
    debug: !!cfg.collectDebug,
    log: state.log, result: state.result, results: state.results, error: state.error,
    // Only what the rows need to keep their Open button honest while a run goes on.
    // The room set itself: the page patches numbers when they move, but a row it never had needs a
    // fresh page.
    rowsig: listSignature(list),
    rooms: list.map(function (x) { const si = shareInfo(x.slug); const er = rowNumbers(cfg, x, tr); return { slug: x.slug, name: memberName(x, pickLang(cfg.language)), canShare: canOffer(cfg, er, x.slug), label: x.rowLabel || x.slug, open: !!roomPage(x.slug), canZip: si.canZip, canBuild: !!roomPage(x.slug), zip: si.zip, text: er.text, full: er.full, saved: er.saved }; }),
    // The Share popup packs one room on its own: no browser, no login, its own small progress log.
    share: { running: shareJob.running, slug: shareJob.slug, low: shareJob.low, percent: shareJob.percent, error: shareJob.error, result: shareJob.result, log: shareJob.log.slice(-40) },
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let all = "";
    req.on("data", (c) => { all += c; if (all.length > 1e6) req.destroy(); });
    // A body that never finishes (client gone, or cut off above) must not leave the handler waiting on
    // this promise for good.
    req.on("aborted", () => resolve({}));
    req.on("error", () => resolve({}));
    req.on("end", () => { try { resolve(JSON.parse(all || "{}")); } catch (e) { resolve({}); } });
  });
}

let stopFlag = false;
function running(flag) { state.running = flag; if (!flag) stopFlag = false; }

// One room is four measured steps and a small prologue. The weights are roughly how long each step
// takes, so the bar keeps telling the truth about where a run stands: the walk through the history and
// the downloads carry most of it, the render and the zip share the rest. The order below is the order
// the pipeline runs them in, because a step starts out credited with every step before it.
const WEIGHT = { browser: 5, harvest: 40, render: 10, media: 35, bundle: 10 };
const WEIGHT_TOTAL = Object.keys(WEIGHT).reduce((a, k) => a + WEIGHT[k], 0);
// The walk backwards ends when the room runs out, so its total is not known in advance. While it runs,
// the bar uses a curve that moves quickly at first and slows down as the walk gets long; when the run
// was given an explicit page cap, that cap is the exact total and it wins.
const HARVEST_KNEE = 120;

// How far into the bar a step stands: every step before it counts as done, plus its own reported
// fraction. A null fraction means the step has nothing to count (the render, the zip), and the bar
// holds the ground the step before it reached rather than inventing a number.
function phaseSpan(phase, frac) {
  if (!(phase in WEIGHT)) return state.floor || 0;
  let done = 0;
  for (const k of Object.keys(WEIGHT)) {
    if (k === phase) break;
    done += WEIGHT[k];
  }
  const f = frac == null ? null : Math.max(0, Math.min(1, frac));
  const own = f == null ? 0 : WEIGHT[phase] * f;
  return 100 * ((done + own) / WEIGHT_TOTAL);
}
// The bar never walks backwards and never claims a run is finished before it is.
function pct(v) { state.floor = Math.min(99, Math.max(state.floor || 0, Math.round(v))); return state.floor; }

async function startJob(body) {
  if (state.running) return;
  const wanted = Array.isArray(body.rooms) ? body.rooms.filter((x) => typeof x === "string") : [];
  const list = rooms(cfg).filter((r) => wanted.indexOf(r.slug) >= 0);
  if (!list.length) return;
  // The page sends "yes" | "low" | "no"; true/false are still accepted so an older page or a script
  // keeps working.
  const asked = body.share === true ? "yes" : body.share === false ? "no" : typeof body.share === "string" ? body.share : String(cfg.shareMode || "yes");
  const shareMode = SHARE_MODES.indexOf(asked) >= 0 ? asked : "yes";
  const share = shareMode !== "no";
  const shareLow = shareMode === "low";
  if (shareMode !== cfg.shareMode) { try { cfg = saveConfig({ shareMode: shareMode }); } catch (e) {} }
  if (typeof body.tz === "string" && body.tz !== cfg.tz && tzOk(body.tz)) { try { cfg = saveConfig({ tz: body.tz }); } catch (e) {} }
      running(true);
  state.result = null; state.results = []; state.error = ""; state.log = []; state.percent = 0; state.floor = 0; state.maxPages = 0; state.progress = null; state.startedAt = Date.now();
  const tr = t();
  const results = [];
  try {
    setPhase("browser");
    push(tr("gui.loginHint"));
    // The press on that button is what begins the hand-over, so the page offers it as soon as the
    // sign-in window is up; the delayed mode below only ever covers the silent re-check.
    state.hurry = false; state.loginWait = true; state.loginAt = Date.now(); state.hurryFirstAt = 0; state.plainWait = false; state.settleUntil = 0;
    // Nothing picked yet, and the window that is up is whatever the config says: both are read back by
    // /api/config while the run waits, which is how a change from the page reaches this run.
    state.browserWish = null;
    const session = await openSession({
      cfg: cfg, onLog: push, shouldStop: () => stopFlag, authTimeoutMs: 600000,
      hurry: () => { if (!state.hurry) return false; state.hurry = false; return true; },
      hurryLog: tr("gui.checkNow"),
      // Nothing here attaches to the window while the person is typing in it, so that button is the
      // only way to say "done". The same click means "look again" in that same window.
      saidDone: () => { if (!state.hurry) return false; state.hurry = false; return true; },
      // Each time that window opens the button starts over as "I'm logged in - continue": the
      // person has just signed in again, so a leftover Retry from the round before would mislead.
      onPlainWait: (on) => { state.plainWait = !!on; if (on) { state.hurry = false; state.hurryFirstAt = 0; state.settleUntil = 0; } },
      // The cooldown the page puts on that button, started the moment the hand-over begins: the
      // browser is already opening again while it runs, so nothing here waits for it.
      onSettle: (on, ms) => { state.settleUntil = on ? Date.now() + (ms || 0) : 0; },
      // A browser picked on the page while this run waits for its sign-in. The wish is read here, one
      // wait at a time, and the run is told which window it ended up with so it can name it.
      pickBrowser: {
        cfg: () => cfg,
        get: () => state.browserWish,
        clear: () => { state.browserWish = null; },
      },
    });
    state.loginWait = false;
    if (session.error === "stopped" || stopFlag) { setPhase("stopped"); running(false); return; }
    if (session.error) {
      // The failures a person can actually hit get a sentence in their own language; anything else is
    // shown as it is, because it is a bug report and hiding it helps nobody.
    const emap = { "no-browser": "gui.noBrowser", "no-page": "gui.noPage", "no-port": "gui.noPort", "no-socket": "gui.noSocket" };
    state.error = emap[session.error] ? tr(emap[session.error]) : session.error;
      setPhase("error");
      running(false);
      return;
    }
    // The sign-in is behind us: the person pressed the button and the hand-over found the session.
    // Say so before the first room starts, so the wait never ends in silence.
    push(tr("gui.loginOk"));
    for (const r of list) {
      if (stopFlag) break;
      const roomName = r.rowLabel || r.slug;
      state.slug = r.slug; state.roomName = roomName;
      const res = await runRoom({
        slug: r.slug, roomId: r.roomId, roomName: roomName, artist: artistLabel(r),
        tz: tzFor(cfg, r), lang: pickLang(cfg.language), rename: publicRenameFor(cfg, r.slug), share: share, shareLow: shareLow,
        credit: cfg.credit || "", cdp: session.cdp, onLog: push, shouldStop: () => stopFlag,
        // Every phase of a run reports here, so the bar can move from the first press instead of only
        // while files are downloading. Two phases can count their own work - the walk knows how many
        // pages it has taken and the download knows how many files it has - and the rest simply hand
        // the bar over at their own weight.
        onProgress: (p) => {
          setPhaseSilent(p.phase);
          const d = p.data || {};
          if (p.phase === "harvest") {
            if (d.maxPages) state.maxPages = d.maxPages;
            const pages = Number(d.pages) || 0;
            const frac = state.maxPages ? pages / state.maxPages : pages / (pages + HARVEST_KNEE);
            state.progress = { line: pages + " page(s), " + (Number(d.uniq) || 0) + " message(s)" };
            state.percent = pct(phaseSpan("harvest", frac));
          } else if (p.phase === "media") {
            state.progress = { line: (Number(d.done) || 0) + "/" + (Number(d.total) || 0) + " file(s)" };
            state.percent = pct(phaseSpan("media", d.total ? d.done / d.total : null));
          } else {
            // The render and the zip have no count of their own to show.
            state.progress = null;
            state.percent = pct(phaseSpan(p.phase));
          }
        },
      });
      results.push({ slug: r.slug, roomName: roomName, res: res, roomId: r.roomId });
      // The Result panel lists every room the run touched, not just the last one, so the row is built
      // here as each room lands: the ids it now holds and the zip it just wrote, if it wrote one.
      const idsDone = String((res.phases.harvest && res.phases.harvest.ids) || 0);
      state.results.push({ slug: r.slug, name: roomName, ids: idsDone, meta: res.phases.bundle ? path.basename(res.phases.bundle.zip) : "", line: tr("gui.doneText", { n: idsDone, v: roomName }) });
      if (res.error) { state.error = "render failed"; setPhase("error"); running(false); return; }
      if (res.stopped) break;
    }
    const last = results[results.length - 1];
    if (last) {
      const html = path.join(dirs(cfg).rooms, last.slug + ".html");
      const zip = last.res.phases.bundle ? last.res.phases.bundle.zip : "";
      const ids = String((last.res.phases.harvest && last.res.phases.harvest.ids) || 0);
      state.result = {
        slug: last.slug, html: html, zip: zip, folder: dirs(cfg).rooms, share: dirs(cfg).share,
        line: tr("gui.doneText", { n: ids, v: last.roomName }),
        meta: zip ? path.basename(zip) : "",
      };
      push(tr("gui.doneText", { n: ids, v: last.roomName }));
      if (zip) push("zip: " + zip);
    }
    // The surprise: the first finished run that leaves them holding a room worth offering shows the
    // author own message without being asked. The flag is written down, so it happens once - except
    // under collectDebug, where every finished run shows it and nothing is written down, so the real
    // once-per-install moment still comes later.
    if (cfg.collectDebug || (!cfg.collectSeen && collectReady(cfg))) {
      const names = eligibleRooms(cfg, rooms(cfg), tr).map((r) => memberName(r, pickLang(cfg.language)));
      if (names.length) {
        state.surprise = names;
        push(tr("gui.collectOffer", { name: cfg.collectName, v: names.join(", ") }));
        if (!cfg.collectDebug) { try { cfg = saveConfig({ collectSeen: true }); } catch (e) {} }
      }
    }
    setPhase(stopFlag ? "stopped" : "done");
    state.percent = stopFlag ? state.percent : 100;
  } catch (e) {
    state.error = String((e && e.message) || e);
    push("error: " + state.error);
    setPhase("error");
  } finally { running(false); }
}

async function handle(req, res) {
  cfgWatch();
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
  // The page is served from 127.0.0.1, so a request carrying another Host header is a DNS-rebinding
  // attempt, and a request carrying an Origin that is not this page was sent by some other site -- a
  // form post or a text/plain fetch needs no CORS preflight, so the browser does deliver it. Anything
  // that can change state is refused here, before a single route can act on it.
  const host = String(req.headers.host || "");
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { json(403, { error: "bad host" }); return; }
  if (req.method !== "GET") {
    const origin = String(req.headers.origin || "");
    if (origin && origin !== "http://" + host) { json(403, { error: "bad origin" }); return; }
    const site = String(req.headers["sec-fetch-site"] || "");
    if (site && site !== "same-origin") { json(403, { error: "cross-site request" }); return; }
    // Our own page sends JSON, and a body that is not JSON cannot even be sent cross-site without a
    // preflight, so no body-carrying post gets past this. Posts without a body (stop, hurry) still go
    // through, protected by the Origin and Sec-Fetch-Site checks above.
    const hasBody = Number(req.headers["content-length"] || 0) > 0 || !!req.headers["transfer-encoding"];
    if (hasBody && !/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) { json(415, { error: "expected application/json" }); return; }
  }
  const url = String(req.url || "/").split("?")[0];
  const q = new URL(String(req.url || "/"), "http://127.0.0.1").searchParams;
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page());
    return;
  }
  // The still pictures that ship next to the code, served from disk so the page itself stays small.
  // Only the names listed here are served, so the route can never walk out of assets/; a copy that lost
  // one answers 404, and the (i) tip then shows its caption alone. Both are PNG, so one content type
  // covers the pair. Nothing here is cached: these are local files the owner replaces while the tool is
  // in use, and a day-old browser copy is exactly how a swapped picture ends up looking stale.
  const ASSETS = { "/assets/home-page.png": "home-page.png", "/assets/milky-way.png": "milky-way.png" };
  if (req.method === "GET" && ASSETS[url]) {
    try {
      const buf = fs.readFileSync(path.join(REPO, "assets", ASSETS[url]));
      res.writeHead(200, { "content-type": "image/png", "content-length": buf.length, "cache-control": "no-store" });
      res.end(buf);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
    return;
  }

  if (req.method === "GET" && url === "/api/state") { json(200, stateJson()); return; }
  // How big a zip of this room would be, asked for by the Share popup as it opens. One room at a time,
  // on demand: walking a room's media list once a second along with the poll would be waste.
  if (req.method === "GET" && url === "/api/zipest") {
    const slug = String(q.get("slug") || "");
    const r = rooms(cfg).filter((x) => x.slug === slug)[0];
    if (!r || !publicExport(slug)) { json(200, { ok: false }); return; }
    let est = null;
    try {
      est = estimateBundle({
        slug: r.slug, roomId: r.roomId, roomName: r.rowLabel || r.slug, artist: artistLabel(r),
        roomDir: publicDirFor(cfg), mediaDir: dirs(cfg).media, credit: cfg.credit || "", lowQuality: false,
      });
    } catch (e) { est = null; }
    json(200, { ok: !!est, bytes: est ? est.bytes : 0, mediaBytes: est ? est.mediaBytes : 0, mediaFiles: est ? est.mediaFiles : 0, entries: est ? est.entries : 0, missing: est ? est.missing : 0 });
    return;
  }
  // The page has shown the author own message, so it will not appear again in this session.
  if (req.method === "POST" && url === "/api/collect-seen") { state.surprise = null; json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/start") {
    const b = await readBody(req);
    // A body that is not a list of slugs is answered honestly instead of starting something.
    if (!Array.isArray(b.rooms) || !b.rooms.every((x) => typeof x === "string")) { json(400, { ok: false, error: "rooms must be a list of slugs" }); return; }
    startJob(b);
    json(200, { ok: true, running: state.running });
    return;
  }
  if (req.method === "POST" && url === "/api/share") { const b = await readBody(req); startShare(b); json(200, { ok: true, running: shareJob.running, slug: shareJob.slug }); return; }
  if (req.method === "POST" && url === "/api/share/stop") {
    // Only asks: the job notices at its next checkpoint, kills the encoder it is running and
    // unwinds itself, so the share buttons come back on their own.
    if (shareJob.running) { shareJob.stop = true; sharePush("stop requested, killing the file being re-compressed"); }
    json(200, { ok: true, running: shareJob.running });
    return;
  }
  if (req.method === "POST" && url === "/api/stop") { stopFlag = true; push("stop requested, finishing the current step"); json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/hurry") { state.hurry = true; if (!state.hurryFirstAt) state.hurryFirstAt = Date.now(); json(200, { ok: true }); return; }
  if (req.method === "POST" && url === "/api/config") {
    const b = await readBody(req);
    // Only a language we ship and a zone the runtime accepts: anything else would be written to
    // config.json for good and then passed on to every render.
    if (typeof b.language === "string" && LANGS.indexOf(b.language) >= 0 && b.language !== cfg.language) { try { cfg = saveConfig({ language: b.language }); } catch (e) {} }
    if (typeof b.tz === "string" && tzOk(b.tz) && b.tz !== cfg.tz) { try { cfg = saveConfig({ tz: b.tz }); } catch (e) {} }
    if (b.shareMode && SHARE_MODES.indexOf(String(b.shareMode)) >= 0) { try { cfg = saveConfig({ shareMode: String(b.shareMode) }); } catch (e) {} }
    if (b.thumbs && THUMB_MODES.indexOf(String(b.thumbs)) >= 0) { try { cfg = saveConfig({ thumbs: String(b.thumbs) }); } catch (e) {} }
    // The browser the tool starts. Only one that really exists on this machine, or "" for the
    // built-in order: a hand-typed path with a typo would otherwise stop every later run from
    // starting, and the picker only offers what was detected anyway.
    let applied = false;
    if (typeof b.browserPath === "string") {
      const wish = b.browserPath.trim();
      const known = wish === "" || listBrowsers(cfg).some((x) => samePath(x.path, wish));
      // Picked while a sign-in is waited on, the answer is not "next run" but "this one": the run is
      // told which window to use right now and opens it in place of the one in front of the person.
      if (known && state.running && state.phase === "browser") { state.browserWish = wish; applied = true; }
      // Remembered either way, including mid-run: a browser that got past the sign-in page is the one
      // the next run should start, and the person has already made that choice once.
      if (known && wish !== String(cfg.browserPath || "")) { try { cfg = saveConfig({ browserPath: wish }); } catch (e) {} }
    }
    json(200, { ok: true, applied: applied, language: cfg.language, tz: cfg.tz, thumbs: cfg.thumbs, browserPath: cfg.browserPath || "" });
    return;
  }
  if (req.method === "POST" && url === "/api/open") {
    const b = await readBody(req);
    const r = state.result || {};
    if (b.what === "shareFolder" && b.slug) { json(200, { ok: openShareFolder(String(b.slug)), target: dirs(cfg).share }); return; }
    // "Share to <name>": the one link this build knows about, stitched together here rather than
    // written down in the page. Only that value is opened, and only when it is a real http(s)
    // address - the page cannot ask for any other target.
    if (b.what === "collect") {
      const u = driveUrl(cfg);
      const ok = /^https?:\/\//i.test(u) ? openExternal(u) : false;
      json(200, { ok: ok, target: ok ? u : "" });
      return;
    }
    // Only the three names the page sends (plus the old no-name call) may open anything: an unknown
    // value must not quietly open the last run's files instead.
    const key = typeof b.what === "string" ? b.what : "";
    const known = { zip: r.share, folder: r.folder, room: roomPage(b.slug), html: r.html, "": r.html };
    const target = Object.prototype.hasOwnProperty.call(known, key) ? known[key] : "";
    const ok = target ? openExternal(target) : false;
    json(200, { ok: ok, target: target || "" });
    return;
  }
  json(404, { error: "not found" });
}

// Double-clicking START.bat twice used to leave two servers and two tabs behind, and a click on the
// stale tab then went nowhere - the run in the other tab never heard about it. So: one GUI per
// machine. It writes down where it listens, and a second start finds the first one.
//
// What it does with that first one depends on what it is doing. A run in progress is never
// interrupted - not even by a double-click - that window is simply opened. Anything else (idle,
// finished, or wedged and not answering) is closed first, because it is holding the page and the
// old code in memory, and starting again only means something if the new code is what runs.
// An explicit --port (what the tests use) skips this entirely.
const APP_DIR = path.join(process.env.LOCALAPPDATA || process.env.HOME || ".", "weverse-dm-archiver");
const GUI_FILE = path.join(APP_DIR, "gui.json");
// A stale gui.json can name a pid that Windows has since handed to some other program, and
// taskkill /T /F would take that program and its children down with it. So "is this pid ours?" is
// answered by the window itself when it can answer, and by the process command line when it cannot.
function cmdlineOf(pid) {
  const n = Number(pid);
  try {
    if (process.platform === "win32") {
      const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_Process -Filter \"ProcessId=" + n + "\").CommandLine"], { encoding: "utf8", timeout: 8000, windowsHide: true });
      return r && r.status === 0 && r.stdout ? String(r.stdout).trim() : "";
    }
    return String(fs.readFileSync("/proc/" + n + "/cmdline", "utf8")).split("\u0000").join(" ");
  } catch (e) {
    if (process.platform === "win32") return "";
    try { const r = spawnSync("ps", ["-p", String(n), "-o", "command="], { encoding: "utf8", timeout: 8000 }); return r && r.status === 0 ? String(r.stdout).trim() : ""; } catch (e2) { return ""; }
  }
}
function looksLikeOurs(pid) {
  const cl = cmdlineOf(pid);
  return !!cl && /gui\.mjs/i.test(cl) && /node/i.test(cl);
}
function liveGui() {
  try {
    // A BOM in there (anything written by PowerShell, say) would kill JSON.parse for no good reason.
    const j = JSON.parse(String(fs.readFileSync(GUI_FILE, "utf8")).replace(/^\uFEFF/, ""));
    if (!j || !j.pid || !j.url) return null;
    process.kill(Number(j.pid), 0);   // throws when that pid is gone
    return j;
  } catch (e) { return null; }
}
// Ask the previous window what it is doing, on its own port. No answer at all counts as dead weight.
async function twinState(url) {
  try {
    const res = await fetch(String(url).replace(/\/?$/, "/") + "api/state", { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch (e) { return null; }
}
function killTree(pid) {
  try { if (process.platform === "win32") { spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); return; } } catch (e) {}
  try { process.kill(Number(pid)); } catch (e) {}
}
if (!argv.includes("--port")) {
  const prev = liveGui();
  if (prev && Number(prev.pid) !== process.pid) {
    const st = await twinState(prev.url);
    if (st && st.running) {
      console.log("gui: a run is in progress at " + prev.url + " - opening that window instead");
      if (!argv.includes("--no-open")) openExternal(prev.url);
      process.exit(0);
    }
    // The answer decides first: a window that reports the pid gui.json names is this program. Without
    // an answer, only a command line that reads like this script counts. Anything else is left alone.
    const ours = st ? Number(st.pid) === Number(prev.pid) : looksLikeOurs(prev.pid);
    if (!ours) {
      console.log("gui: " + prev.url + " is not answering and pid " + prev.pid + " does not look like this program");
      console.log("gui: leaving it alone; starting on another port");
    } else {
      console.log("gui: closing the previous window at " + prev.url + " (" + (st ? "idle" : "not answering") + ")");
      killTree(prev.pid);
      try { fs.rmSync(GUI_FILE, { force: true }); } catch (e) {}
      await new Promise((r) => setTimeout(r, 1200));   // let the port go before we claim it
    }
  }
}
const wantPort = Number(flag("port", cfg.guiPort || 8787)) || 8787;
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { try { res.writeHead(500, { "content-type": "text/plain" }); res.end(String((e && e.message) || e)); } catch (err) {} });
});
// Receiving a request must not be able to hold a socket open forever.
server.headersTimeout = 10000;
server.requestTimeout = 30000;

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
  if (cfg.collectDebug) console.log("gui: collectDebug is on - every room offers the Share to button");
  if (/\{[A-Za-z0-9_.-]+\}/.test(String(cfg.collectUrl || "")) && !driveUrl(cfg)) {
    console.log("gui: collectUrl has an unresolved {name} placeholder; the Share to button stays hidden");
  }
  if (!argv.includes("--no-open")) openExternal(url);
  // Remember where this one listens, so the next double-click opens this page instead of a new server.
  // A run with an explicit --port is a test or a second window: it must not overwrite the entry of the
  // window the user is actually looking at. The write itself goes through a rename so a reader never
  // sees half a file.
  if (!argv.includes("--port")) {
    try {
      fs.mkdirSync(APP_DIR, { recursive: true });
      const tmp = GUI_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify({ pid: process.pid, port: port, url: url, at: Date.now() }));
      fs.renameSync(tmp, GUI_FILE);
    } catch (e) {}
  }
});

// Leave no stale note behind: a pid that is gone is ignored anyway, but a clean exit is cheaper.
function forgetGui() { if (argv.includes("--port")) return; try { const j = JSON.parse(fs.readFileSync(GUI_FILE, "utf8")); if (j && Number(j.pid) === process.pid) fs.rmSync(GUI_FILE, { force: true }); } catch (e) {} }
process.on("exit", forgetGui);
process.on("SIGINT", () => { push("closing"); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 800); });
