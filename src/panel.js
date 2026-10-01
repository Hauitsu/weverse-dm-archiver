/* The side panel: the month jump, the translation switch and your bookmarks, out of the reading
   column until you press the button in the top-right corner. Plain ES5 like src/ui.js and src/bm.js;
   the panel only shows and hides what the renderer already wrote, the bookmark list itself stays
   bm.js' business, and the switch inside the panel is built by ui.js. */
(function () {
  var panel = document.getElementById("panel");
  if (!panel) return;
  var menu = document.getElementById("pmenu"), closer = document.getElementById("pcl");
  // A tab that is not in the page (no bookmarks, no translations) simply is not in the map.
  var tabs = { j: document.getElementById("tabj"), b: document.getElementById("tabb"), t: document.getElementById("tabt") };
  var panes = { j: document.getElementById("panej"), b: document.getElementById("paneb"), t: document.getElementById("panet") };
  var last = "j";   // the tab the next open starts on, so a switch is remembered

  function isOpen() { return panel.classList.contains("buka"); }
  function select(k) {
    for (var q in tabs) {
      if (!tabs[q]) continue;
      var on = q === k;
      tabs[q].setAttribute("aria-selected", on ? "true" : "false");
      if (panes[q]) panes[q].hidden = !on;
    }
  }
  function show(k) {
    last = k || last;
    select(last);
    panel.classList.add("buka");
    panel.setAttribute("aria-hidden", "false");
    document.body.classList.add("pnel");
    if (menu) menu.setAttribute("aria-expanded", "true");
    panel.tabIndex = -1;
    try { panel.focus({ preventScroll: true }); } catch (e) { panel.focus(); }
  }
  function hide() {
    if (!isOpen()) return;
    panel.classList.remove("buka");
    panel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pnel");
    if (menu) menu.setAttribute("aria-expanded", "false");
  }
  function toggle(ev) {
    if (ev) ev.preventDefault();
    if (isOpen()) hide(); else show();
  }
  if (menu) menu.onclick = toggle;
  if (closer) closer.onclick = hide;
  if (tabs.j) tabs.j.onclick = function () { last = "j"; select("j"); };
  if (tabs.b) tabs.b.onclick = function () { last = "b"; select("b"); };
  if (tabs.t) tabs.t.onclick = function () { last = "t"; select("t"); };
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hide(); });
  // Anything else on the page - a message, a photo, the theme switch - puts the panel away again. The
  // corner button is left alone: it carries its own toggle, so one click must never open and close.
  var bar = document.getElementById("icons");
  document.addEventListener("click", function (ev) {
    if (!isOpen()) return;
    var el = ev.target;
    if (!el || panel.contains(el)) return;
    if (bar && bar.contains(el)) return;
    if (menu && (el === menu || menu.contains(el))) return;
    hide();
  });
  // A month chip or a bookmark link is meant to be followed: get the panel out of the way first.
  panel.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[href^='#']") : null;
    if (a) hide();
  });
})();
