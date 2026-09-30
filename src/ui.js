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

  function pasang() {
    var wrap = document.querySelector(".wrap");
    if (!wrap || document.querySelector(".chip")) return;
    var d = wrap.querySelector(".day, .m");
    if (d) wrap.insertBefore(chip, d); else wrap.appendChild(chip);
    // Park the sticky pill just below the day header instead of on top of the date.
    var hd = wrap.querySelector(".day");
    if (hd) chip.style.setProperty("--chip-atas", Math.round(hd.offsetHeight) + "px");
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
  setInterval(tulisAngka, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tulisAngka(); });
  window.addEventListener("focus", tulisAngka);
})();
