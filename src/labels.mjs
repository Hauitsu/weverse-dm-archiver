// src/labels.mjs -- read the names the DM list actually shows.
//
// The messages the API hands back carry the fan own nickname on both sides of the conversation, so the
// names the artists go by - emoji included - only exist in the DM list itself. This module reads them
// off that page (or off a JSON file holding a pasted probe result) and writes them into
// rooms.unis.json, where rowLabel already decides what the exports call the room.
import fs from "node:fs";

// The DM web app. It is a separate site from weverse.io and the only place the room names show.
export const DM_URL = "https://dm.weverse.io/";

// Runs inside the DM list page: one entry per row, with the room id when the row still carries it.
// No network request - it only looks at what the page has already rendered.
const PROBE = [
  "(function(){",
  "  var out = [], seen = {};",
  "  var isId = function (v) { return typeof v === 'string' && /^WR[A-Z0-9]{5}$/.test(v); };",
  "  var dig = function (o, d) {",
  "    if (!o || typeof o !== 'object' || d > 5) return null;",
  "    for (var k in o) {",
  "      var v; try { v = o[k]; } catch (e) { continue; }",
  "      if (isId(v)) return v;",
  "      if (v && typeof v === 'object') { var hit = dig(v, d + 1); if (hit) return hit; }",
  "    }",
  "    return null;",
  "  };",
  "  var fromProps = function (n) {",
  "    var ks = Object.keys(n);",
  "    for (var i = 0; i < ks.length; i++) {",
  "      if (ks[i].indexOf('__reactProps$') !== 0 && ks[i].indexOf('__reactFiber$') !== 0) continue;",
  "      var hit = dig(n[ks[i]], 0);",
  "      if (hit) return hit;",
  "    }",
  "    return null;",
  "  };",
  "  var tidy = function (s) {",
  "    var t = String(s == null ? '' : s).split(String.fromCharCode(10)).join(' ').split(String.fromCharCode(9)).join(' ');",
  "    while (t.indexOf('  ') >= 0) t = t.split('  ').join(' ');",
  "    return t.trim();",
  "  };",
  "  var items = document.querySelectorAll('li');",
  "  for (var i = 0; i < items.length; i++) {",
  "    var li = items[i];",
  "    var strong = li.querySelector('strong');",
  "    if (!strong) continue;",
  "    var label = tidy(strong.textContent);",
  "    if (!label) continue;",
  "    var id = null, nodes = [li].concat([].slice.call(li.querySelectorAll('*')));",
  "    for (var j = 0; j < nodes.length && !id; j++) id = fromProps(nodes[j]);",
  "    if (!id) {",
  "      var a = li.querySelector('a[href]');",
  "      var m = a ? String(a.getAttribute('href') || '').match(/WR[A-Z0-9]{5}/) : null;",
  "      if (m) id = m[0];",
  "    }",
  "    var key = (id || '?') + '|' + label;",
  "    if (seen[key]) continue;",
  "    seen[key] = 1;",
  "    out.push({ roomId: id, label: label });",
  "  }",
  "  return { url: location.href, title: document.title, count: out.length, rows: out };",
  "})()",
].join(String.fromCharCode(10));

export const LABEL_PROBE = PROBE;

// Wait for the list to have rows, then hand back what it said.
export async function captureLabels(cdp, o) {
  const opts = o || {};
  const log = opts.onLog || (() => {});
  const until = Date.now() + (opts.timeoutMs || 90000);
  let last = null;
  for (;;) {
    try { last = await cdp.evaluate(LABEL_PROBE, 30000); } catch (e) { last = null; }
    if (last && last.count) return last;
    if (Date.now() > until) return last || { count: 0, rows: [] };
    log("waiting for the DM list to show its rooms (" + Math.round((until - Date.now()) / 1000) + "s left)");
    await new Promise((r) => setTimeout(r, opts.stepMs || 2500));
  }
}

// Point the window the tool owns at the DM list. Nothing here touches a window someone browses in.
export async function gotoDm(cdp, o) {
  const log = (o && o.onLog) || (() => {});
  log("dm: opening " + DM_URL);
  try { await cdp.send("Page.navigate", { url: DM_URL }, 30000); } catch (e) { log("dm: could not navigate (" + e.message + ")"); }
  await new Promise((r) => setTimeout(r, 1200));
}

// Write the captured names into the registry object. Only rooms already listed are touched.
export function mergeLabels(obj, rows) {
  const byId = new Map();
  for (const r of rows || []) {
    const id = String((r && r.roomId) || "").toUpperCase();
    const label = String((r && r.label) || "").trim();
    if (id && label && !byId.has(id)) byId.set(id, label);
  }
  const changed = [], kept = [], missing = [];
  const rooms = (obj && obj.rooms) || [];
  for (const r of rooms) {
    const hit = byId.get(String(r.roomId || "").toUpperCase());
    if (!hit) { missing.push(r.slug); continue; }
    if (String(r.rowLabel || "") === hit && String(r.roomName || "") === hit) { kept.push(r.slug); continue; }
    changed.push({ slug: r.slug, from: r.rowLabel || null, to: hit });
    r.rowLabel = hit;
    r.roomName = hit;
  }
  const known = new Set(rooms.map((r) => String(r.roomId || "").toUpperCase()));
  const unmatched = [];
  for (const id of byId.keys()) if (!known.has(id)) unmatched.push(id);
  return { changed: changed, kept: kept, missing: missing, unmatched: unmatched };
}

// Rows from a file: either what the probe printed or a bare array of rows.
export function readRows(file) {
  const obj = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(obj) ? obj : (obj && obj.rows) || [];
  const out = [];
  for (const r of rows) {
    const label = String((r && (r.label || r.name || r.rowLabel)) || "").trim();
    const id = String((r && (r.roomId || r.id)) || "").trim().toUpperCase() || null;
    if (label) out.push({ roomId: id, label: label });
  }
  if (!out.length) throw new Error("no rows with a label in " + file);
  return out;
}
