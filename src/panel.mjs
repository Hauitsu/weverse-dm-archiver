// Reads the Weverse bookmark panel out of a browser that already has it open.
//
// Nothing here navigates, clicks or sends anything: it asks the page for the <li> elements the panel
// has already rendered. That list is the only place the bookmark order and the date survive, and the
// preview the server hands out is truncated, so the message a bookmark points at is recovered later by
// render.mjs from the harvested messages of that day.
import fs from "node:fs";
import path from "node:path";
import { targets } from "./browser.mjs";
import { attach } from "./cdp.mjs";

const ITEM = "li.bookmark-modal-contents-_-bookmark_item";
const MSG = ".bookmark-modal-contents-_-bookmark_message";
const DATE = ".bookmark-modal-contents-_-bookmark_date";

const EXPR = "(()=>{var ls=[].slice.call(document.querySelectorAll('" + ITEM + "'));" +
  "return JSON.stringify(ls.map(function(li,n){var m=li.querySelector('" + MSG + "'),d=li.querySelector('" + DATE + "');" +
  "return {bookmarkNo:n+1,preview:(m?m.textContent.trim():''),tanggalTampil:(d?d.textContent.trim():'')};}));})()";

export const panelPath = (srcDir) => path.join(srcDir, "bookmarks-panel.json");

export async function readPanel(port, opts) {
  const o = opts || {};
  const log = o.onLog || (() => {});
  const list = await targets(port);
  const pages = (list || []).filter((t) => t.type === "page");
  const page = pages.filter((t) => String(t.url || "").indexOf("weverse.io") >= 0)[0] || pages[0];
  if (!page) throw new Error("no page on port " + port + " (is the browser running with --remote-debugging-port=" + port + "?)");
  log("reading " + String(page.url || "").slice(0, 60) + " on port " + port + " (read-only)");
  const cdp = await attach(page.webSocketDebuggerUrl, {});
  try {
    const items = JSON.parse((await cdp.evaluate(EXPR, 20000)) || "[]");
    return { items: items, page: { title: page.title, url: page.url } };
  } finally { cdp.close(); }
}

export function savePanel(srcDir, o) {
  const isi = {
    room: o.room, roomId: o.roomId || null,
    diambil: new Date().toISOString().slice(0, 19),
    sumber: "panel bookmark DOM (read-only, tanpa klik)",
    halaman: o.page || null,
    jumlah: o.items.length,
    item: o.items,
  };
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(panelPath(srcDir), JSON.stringify(isi, null, 1), "utf8");
  return panelPath(srcDir);
}
