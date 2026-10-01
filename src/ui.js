/* The days-together chip and the bubble-colour picker, injected by src/render.mjs (see the WD
   global it writes into <head>). Reader-side only: the choice lives in this browser, nothing is
   uploaded and no file on disk is touched. Same idea as src/bm.js - plain ES5, no dependencies. */
(function () {
  "use strict";
  var WD = window.WD || {}, T = WD.T || {}, PAL = WD.P || [], KEY = "wdm-bub", ROM = WD.room || "";
  var st = { c: 0, t: "" };

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function muat() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || "{}") || {}, b = j[ROM] || {};
      st.c = (typeof b.c === "number" && b.c >= 0 && PAL[b.c]) ? b.c : 0;
      st.t = (typeof b.t === "string" && b.t) ? b.t : "";
    } catch (e) { st.c = 0; st.t = ""; }
  }
  function simpan() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
      j[ROM] = { c: st.c, t: st.t };
      localStorage.setItem(KEY, JSON.stringify(j));
    } catch (e) {}
  }
  // One pick covers both themes: the deep colour in dark (white letters), the pastel in light.
  // There is no "no colour" state, so there is nothing to reset - every room opens on cyan.
  function terapkan() {
    var d = document.documentElement, p = PAL[st.c] || PAL[0];
    if (!p) return;
    var v = d.getAttribute("data-tema") === "light" ? p.lt : p.dk;
    d.setAttribute("data-bub", p.n);
    d.style.setProperty("--ab", v[0]);
    d.style.setProperty("--abd", v[1]);
    d.style.setProperty("--at", v[2]);
    d.style.setProperty("--atl", v[3]);
  }
  // The number is live: whole days from the first message in the archive to today, counted in the
  // reader's own timezone, so an archive opened next year says a bigger number. The words after it
  // are the reader's to rename.
  function hitung() {
    if (!WD.mulai) return 0;
    var a = new Date(WD.mulai), b = new Date();
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((b - a) / 86400000));
  }
  function tulisAngka() { num.textContent = WD.mulai ? "+" + hitung() : ""; }
  function kata() { return st.t || WD.hari || ""; }

  var chip = el("div", "chip"), pil = el("div", "cp"), num = el("span", "angka"), sp = el("span", "hari");
  var ht = el("button", "hrt");
  num.textContent = "";
  num.setAttribute("role", "button");
  num.tabIndex = 0;
  num.title = T.warna || "";
  ht.type = "button";
  ht.title = T.warna || "Bubble colour";
  ht.setAttribute("aria-label", T.warna || "Bubble colour");
  ht.setAttribute("aria-expanded", "false");
  ht.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.8C9.5 19 3.6 14.7 3.6 10.4 3.6 7.5 5.8 5.4 8.4 5.4c1.5 0 2.8.7 3.6 1.9.8-1.2 2.1-1.9 3.6-1.9 2.6 0 4.8 2.1 4.8 5 0 4.3-5.9 8.6-8.4 10.4z"/></svg>';
  sp.setAttribute("role", "button");
  sp.tabIndex = 0;
  sp.title = T.edit || "";
  pil.appendChild(ht); pil.appendChild(num); pil.appendChild(document.createTextNode(" ")); pil.appendChild(sp);
  chip.appendChild(pil);

  var pal = el("div"); pal.id = "wpal"; pal.hidden = true;
  PAL.forEach(function (e, i) {
    var b = el("button", "w");
    b.type = "button";
    b.style.background = e.sw || e.dk[0];       // the app's own swatches, frozen: same in both themes
    b.title = e.n;
    b.setAttribute("aria-label", e.n);
    b.onclick = function (ev) { ev.stopPropagation(); st.c = i; simpan(); terapkan(); tanda(); };
    pal.appendChild(b);
  });
  chip.appendChild(pal);
  function tanda() {
    var bs = pal.querySelectorAll("button.w");
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-pressed", String(st.c === i));
  }
  // Both the heart and the number open the row, the way the dot next to "days together" does in the app.
  function buka(b) {
    pal.hidden = !b;
    ht.setAttribute("aria-expanded", String(b));
    num.setAttribute("aria-expanded", String(b));
  }
  function tutup() { buka(false); }
  function alih(ev) {
    ev.stopPropagation();
    buka(pal.hidden);
  }
  ht.onclick = alih;
  num.onclick = alih;
  num.onkeydown = function (ev) {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); alih(ev); }
  };
  document.addEventListener("click", function (ev) { if (!pal.hidden && !chip.contains(ev.target)) tutup(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !pal.hidden) tutup(); });

  function tulis() { sp.textContent = kata(); }
  function sunting() {
    if (sp.querySelector("input")) return;
    var inp = el("input", "hari");
    inp.type = "text";
    inp.maxLength = 15;
    inp.value = kata();
    inp.setAttribute("aria-label", T.edit || "");
    sp.textContent = "";
    sp.appendChild(inp);
    inp.focus();
    inp.select();
    function selesai(pakai) {
      if (!inp.parentNode) return;
      if (pakai) {
        var v = String(inp.value || "").replace(/\s+/g, " ").trim().slice(0, 15);
        st.t = (v && v !== (WD.hari || "")) ? v : "";
        simpan();
      }
      sp.removeChild(inp);
      tulis();
    }
    inp.onkeydown = function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); selesai(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); selesai(false); }
    };
    inp.onblur = function () { selesai(true); };
    inp.onclick = function (ev) { ev.stopPropagation(); };
  }
  sp.onclick = function (ev) { ev.stopPropagation(); sunting(); };
  // Anything typed inside the box belongs to the box: Enter there must not bubble up and reopen it.
  sp.onkeydown = function (ev) {
    if (ev.target !== sp) return;
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); sunting(); }
  };

  // The pill sits exactly under the day band, so its pin has to equal the band's height (37px -
  // see .day in src/render.mjs). Every band is one line, so they all measure the same; the tallest
  // one wins in case a label ever grows, and a resize or a late layout gets the same answer instead
  // of leaving the pill out of step with the band it is parked under.
  function ukur() {
    var ds = document.querySelectorAll(".day"), h = 0;
    for (var i = 0; i < ds.length; i++) { var v = ds[i].offsetHeight; if (v > h) h = v; }
    if (h) chip.style.setProperty("--chip-atas", h + "px");
  }
  function pasang() {
    var wrap = document.querySelector(".wrap");
    if (!wrap || document.querySelector(".chip")) return;
    var d = wrap.querySelector(".day, .m");
    if (d) wrap.insertBefore(chip, d); else wrap.appendChild(chip);
    // Park the sticky pill just below the day header instead of on top of the date.
    ukur(); // the chip is on screen now, so the day bands can be measured
    tulisAngka();
    tulis();
    tanda();
  }
  muat();
  terapkan();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pasang); else pasang();
  // The theme button flips data-tema; the same pick has to follow it to the other variant.
  if (window.MutationObserver) {
    new MutationObserver(function () { terapkan(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  }
  // Today is not a constant: refresh on a timer, and again whenever the page is looked at.
  window.addEventListener("resize", ukur);
  window.addEventListener("load", ukur);
  setInterval(tulisAngka, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tulisAngka(); });
  window.addEventListener("focus", tulisAngka);
})();

/* The translation switch: Weverse's own English line under a message can be read together with the
   original text, on its own, or not at all. Same idea as the theme above - a reader-side choice kept
   in this browser and applied by flipping one attribute on <html>. Both texts already sit inside the
   file, so a mode never loads or rewrites anything. The renderer only emits this when the archive
   really carries translations, and then TR is missing and nothing below runs. */
(function () {
  "use strict";
  var WD = window.WD || {}, TR = WD.TR;
  if (!TR) return;
  var KEY = "wdm-tr", d = document.documentElement, aktif = "both", tombol = [];
  var MODES = [["both", TR.both], ["orig", TR.orig], ["en", TR.en]];

  function baca() {
    try {
      var m = localStorage.getItem(KEY);
      if (m === "both" || m === "orig" || m === "en") return m;
    } catch (e) {}
    return "both";
  }
  // Both places the switch appears hold their own three buttons, so every copy follows the choice.
  function segarkan() {
    for (var i = 0; i < tombol.length; i++) {
      var b = tombol[i], on = b.getAttribute("data-mode") === aktif;
      b.setAttribute("aria-pressed", String(on));
      b.textContent = (on ? "\u2713 " : "") + b.getAttribute("data-label");
    }
  }
  function pakai(m) {
    aktif = m;
    d.setAttribute("data-tr", m);
    try { localStorage.setItem(KEY, m); } catch (e) {}
    segarkan();
  }
  function daftar() {
    var box = document.createDocumentFragment();
    MODES.forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-mode", m[0]);
      b.setAttribute("data-label", m[1]);
      b.setAttribute("aria-pressed", "false");
      b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); pakai(m[0]); };
      tombol.push(b);
      box.appendChild(b);
    });
    return box;
  }
  var kotak = document.getElementById("trbox");
  if (kotak) kotak.appendChild(daftar());

  // The three-dot menu asks for the same three modes; this popup is where it gets them. It borrows
  // the menu's own look (.mx) so the two never drift apart.
  var pop = document.createElement("div");
  pop.className = "mx";
  pop.id = "trpop";
  pop.setAttribute("role", "group");
  pop.setAttribute("aria-label", TR.t);
  pop.hidden = true;
  pop.appendChild(daftar());
  pop.addEventListener("click", function (ev) {
    if (ev.target && ev.target.tagName === "BUTTON") tutupPop();
  });
  document.body.appendChild(pop);

  function tutupPop() { pop.hidden = true; }
  function bukaPop(anchor) {
    pop.hidden = false;
    var pr = anchor.getBoundingClientRect();
    var lbr = pop.offsetWidth, tgi = pop.offsetHeight;
    var kiri = Math.max(8, Math.min(window.innerWidth - lbr - 8, pr.right - lbr));
    var atas = pr.top - tgi - 6;                 // above the button when there is room
    if (atas < 8) atas = pr.bottom + 6;          // otherwise below it
    atas = Math.max(8, Math.min(window.innerHeight - tgi - 8, atas));
    pop.style.left = kiri + "px";
    pop.style.top = atas + "px";
  }
  // Capture, not bubble: bm.js empties the three-dot menu in its own click handler, and an element
  // that has already left the page measures as 0x0. On the way down the item is still on screen.
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    var a = t && t.closest ? t.closest("[data-tropen]") : null;
    if (a) { ev.preventDefault(); bukaPop(a); return; }   // the click that opens it must not close it
    if (!pop.hidden && t && !pop.contains(t)) tutupPop();
  }, true);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !pop.hidden) tutupPop(); });

  pakai(baca());
})();
