/* The side panel: the month jump and your bookmarks, out of the reading column until you press one of
   the two icon buttons in the top-right corner. Plain ES5 like src/ui.js and src/bm.js; the panel only
   shows and hides what the renderer already wrote, and the bookmark list itself stays bm.js' business. */
(function () {
  var p = document.getElementById("panel");
  if (!p) return;
  var bj = document.getElementById("pj"), bb = document.getElementById("pb"), bt = document.getElementById("pcl");
  var tab = { j: document.getElementById("tabj"), b: document.getElementById("tabb") };
  var pane = { j: document.getElementById("panej"), b: document.getElementById("paneb") };

  function pilih(k) {
    for (var q in tab) {
      if (!tab[q]) continue;
      var on = q === k;
      tab[q].setAttribute("aria-selected", on ? "true" : "false");
      if (pane[q]) pane[q].hidden = !on;
    }
  }
  function tandaBuka(k) {
    if (bj) bj.setAttribute("aria-expanded", k === "j" ? "true" : "false");
    if (bb) bb.setAttribute("aria-expanded", k === "b" ? "true" : "false");
  }
  function buka(k) {
    pilih(k);
    p.classList.add("buka");
    p.setAttribute("aria-hidden", "false");
    document.body.classList.add("pnel");
    tandaBuka(k);
    p.tabIndex = -1;
    try { p.focus({ preventScroll: true }); } catch (e) { p.focus(); }
  }
  function tutup() {
    if (!p.classList.contains("buka")) return;
    p.classList.remove("buka");
    p.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pnel");
    tandaBuka("");
  }
  function alih(k, ev) {
    if (ev) ev.preventDefault();
    var lagi = tab[k] && tab[k].getAttribute("aria-selected") === "true";
    if (p.classList.contains("buka") && lagi) tutup(); else buka(k);
  }
  if (bj) bj.onclick = function (ev) { alih("j", ev); };
  if (bb) bb.onclick = function (ev) { alih("b", ev); };
  if (bt) bt.onclick = tutup;
  if (tab.j) tab.j.onclick = function () { pilih("j"); };
  if (tab.b) tab.b.onclick = function () { pilih("b"); };
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") tutup(); });
  // Anything else on the page - a message, a photo, the theme switch - puts the panel away again. The
  // two icons are left alone: they carry their own toggle, so clicking them must not close twice.
  var bar = document.getElementById("pico");
  document.addEventListener("click", function (ev) {
    if (!p.classList.contains("buka")) return;
    var el = ev.target;
    if (!el || p.contains(el)) return;
    if (bar && bar.contains(el)) return;
    tutup();
  });
  // A month chip or a bookmark link is meant to be followed: get the panel out of the way first.
  p.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href^='#']") : null;
    if (a) tutup();
  });
})();
