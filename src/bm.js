// The bookmarks you make yourself.
//
// The renderer can bake a list in, but this script is the one that matters day to day: press the three
// dots next to any message, pick "bookmark", and the message gets a star and a line in the bookmarks
// panel - the star button in the corner, left of the theme switch. Nothing is ever sent anywhere and the file on disk is never rewritten - your list
// lives in localStorage under "wdm-bm", per room, on your own machine.
//
// The list can be exported and imported as the very same bookmarks.json the renderer reads, so a list
// can be carried between machines or dropped next to the room to be baked into the next render.
(function () {
  var BK = {{BK}};
  var S = BK.S;
  var KUNCI = "wdm-bm";
  var ROOM = BK.room;
  var idx = {}, hari = "";
  var dotAktif = null, det = null, kotak = null, notaEl = null, jamNota = 0;

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function bersih(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  // ---- where each message sits, so a bookmark can find it again ------------------------------
  var jalan = qa(".day,.m[data-m]");
  for (var i = 0; i < jalan.length; i++) {
    var e = jalan[i];
    if (e.classList.contains("day")) { hari = e.id.slice(2); continue; }
    var jam = q(".jam", e);
    idx[e.getAttribute("data-m")] = { hari: hari, jam: jam ? jam.textContent : "", el: e };
  }

  // ---- what was baked in, and what you added on top ------------------------------------------
  function baca() {
    try {
      var s = JSON.parse(localStorage.getItem(KUNCI) || "{}") || {};
      var v = s[ROOM];
      if (!v || typeof v !== "object") return { a: [], h: [] };
      return { a: v.a || [], h: v.h || [] };
    } catch (e) { return { a: [], h: [] }; }
  }
  function simpan(v) {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KUNCI) || "{}") || {}; } catch (e) { s = {}; }
    s[ROOM] = { a: v.a, h: v.h };
    try { localStorage.setItem(KUNCI, JSON.stringify(s)); } catch (e) {}
  }
  var st = baca();
  var dipaku = {};
  BK.k0.forEach(function (x) { dipaku[x.m] = 1; });
  function punyaSaya(mid) { for (var j = 0; j < st.a.length; j++) if (st.a[j].m === mid) return st.a[j]; return null; }
  function iso(mid) { var r = idx[mid]; return r && r.hari ? r.hari + " " + r.jam + ":00" : ""; }

  // A preview for the list: the words if there are any, otherwise what kind of media it was.
  function ringkas(mid) {
    var r = idx[mid];
    if (!r) return "";
    var t = q(".tx", r.el);
    if (t) { var s = bersih(t.textContent); if (s) return s.slice(0, 160); }
    if (q(".bub.gift", r.el)) return S.gift;
    if (q("video", r.el)) return S.video;
    if (q("audio", r.el)) return S.voice;
    if (q("img", r.el)) return S.photo;
    return "";
  }
  function teksPesan(r) {
    var t = q(".tx", r.el);
    var teks = t ? bersih(t.textContent) : "";
    if (teks) return teks;
    var a = q("a.ph", r.el);
    return a ? a.href : ringkas(r.el.getAttribute("data-m"));
  }
  function daftar() {
    var keluar = [], ada = {};
    BK.k0.forEach(function (x) {
      if (st.h.indexOf(x.m) >= 0) return;
      ada[x.m] = 1;
      keluar.push({ m: x.m, s: x.s || iso(x.m), p: x.p || ringkas(x.m), d: 0 });
    });
    st.a.forEach(function (x) {
      if (ada[x.m] || !idx[x.m]) return;
      keluar.push({ m: x.m, s: x.s || iso(x.m), p: x.p || ringkas(x.m), d: 1 });
    });
    keluar.sort(function (a, b) { return a.s < b.s ? 1 : a.s > b.s ? -1 : 0; });
    return keluar;
  }

  // ---- the list, the stars and the nav link ---------------------------------------------------
  function nota(teks) {
    if (!notaEl) return;
    notaEl.textContent = teks || "";
    if (jamNota) clearTimeout(jamNota);
    jamNota = setTimeout(function () { notaEl.textContent = ""; }, 2800);
  }
  function gambar() {
    var list = daftar(), n = 0;
    qa(".m.bm").forEach(function (e) {
      e.classList.remove("bm");
      e.removeAttribute("id");
      var b = q(".bmk", e);
      if (b) { b.textContent = ""; b.removeAttribute("title"); }
    });
    if (!kotak) return;
    kotak.textContent = "";
    list.forEach(function (x, i) {
      x.n = i + 1;
      var r = idx[x.m];
      if (!r) return;
      n++;
      r.el.classList.add("bm");
      r.el.id = "bmk-" + x.n;
      var b = q(".bmk", r.el);
      if (b) { b.textContent = "\u2605"; b.title = S.tajuk.split("{n}").join(x.n); }
      var row = el("div", "br");
      var no = el("span", "bn");
      no.textContent = "#" + x.n;
      row.appendChild(no);
      var a = el("a");
      a.href = "#bmk-" + x.n;
      a.title = S.bubble;
      a.textContent = x.p;
      row.appendChild(a);
      if (document.getElementById("d-" + x.s.slice(0, 10))) {
        var d = el("a", "bd");
        d.href = "#d-" + x.s.slice(0, 10);
        d.title = S.tanggal;
        d.textContent = x.s.slice(0, 16);
        row.appendChild(d);
      }
      if (x.d) {
        var x2 = el("button", "bx2");
        x2.type = "button";
        x2.textContent = "\u00d7";
        x2.title = S.hapus;
        x2.setAttribute("aria-label", S.hapus);
        x2.onclick = function () { tanda(x.m, false); };
        row.appendChild(x2);
      }
      kotak.appendChild(row);
    });
    if (!n) { var kosong = el("div", "bkosong"); kosong.textContent = S.kosong; kotak.appendChild(kosong); }
    var sum = det ? q("summary", det) : null;
    if (sum) sum.textContent = (n ? S.ringkas : S.ringkas0).split("{n}").join(n);
    // The count lives on the buttons now: the corner one and the tab that opens this list.
    qa("[data-bmn]").forEach(function (e) { e.textContent = "(" + n + ")"; });
  }

  function tanda(mid, on) {
    if (!idx[mid]) return;
    if (on) {
      if (dipaku[mid]) { var i = st.h.indexOf(mid); if (i >= 0) st.h.splice(i, 1); }
      else if (!punyaSaya(mid)) st.a.push({ m: mid, s: iso(mid), p: ringkas(mid) });
    } else if (dipaku[mid]) {
      if (st.h.indexOf(mid) < 0) st.h.push(mid);
    } else {
      st.a = st.a.filter(function (x) { return x.m !== mid; });
    }
    simpan(st);
    gambar();
    if (on && det) det.open = true;
  }

  // ---- copying --------------------------------------------------------------------------------
  function paksa(teks) {
    var t = document.createElement("textarea");
    t.value = teks;
    t.style.position = "fixed";
    t.style.top = "-1000px";
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch (e) {}
    t.parentNode.removeChild(t);
  }
  function salin(teks) {
    if (!teks) return;
    var beres = function () { nota(S.tersalin); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(teks).then(beres, function () { paksa(teks); beres(); });
    } else { paksa(teks); beres(); }
  }

  // ---- the three-dot menu ---------------------------------------------------------------------
  var menu = document.getElementById("mx");
  function tutupMenu() {
    if (menu) { menu.hidden = true; menu.textContent = ""; }
    if (dotAktif) { dotAktif.setAttribute("aria-expanded", "false"); dotAktif = null; }
  }
  function buka(b, mid) {
    var r = idx[mid];
    if (!r || !menu) return;
    var sudah = !!q('.m.bm[data-m="' + mid + '"]');
    menu.textContent = "";
    var itens = [
      [sudah ? S.buang : S.tandai, function () { tanda(mid, !sudah); }],
      [S.salin, function () { salin(teksPesan(r)); }],
      [S.waktu, function () { salin(r.hari + " " + r.jam); }]
    ];
    itens.forEach(function (it) {
      var b2 = el("button");
      b2.type = "button";
      b2.textContent = it[0];
      b2.onclick = function () { tutupMenu(); it[1](); };
      menu.appendChild(b2);
    });
    menu.hidden = false;
    var pr = b.getBoundingClientRect();
    var lbr = menu.offsetWidth, tgi = menu.offsetHeight;
    var kiri = Math.max(8, Math.min(window.innerWidth - lbr - 8, pr.right - lbr));
    var atas = pr.top - tgi - 6;                 // above the button when there is room
    if (atas < 8) atas = pr.bottom + 6;          // otherwise below it
    atas = Math.max(8, Math.min(window.innerHeight - tgi - 8, atas));   // and always on screen
    menu.style.left = kiri + "px";
    menu.style.top = atas + "px";
    dotAktif = b;
    b.setAttribute("aria-expanded", "true");
  }

  // ---- export, import, clear ------------------------------------------------------------------
  var fi = document.getElementById("bmfi");
  var bIm = document.getElementById("bmim"), bEx = document.getElementById("bmex");
  if (bIm && fi) {
    bIm.onclick = function () { fi.click(); };
    fi.onchange = function () {
      var f = fi.files && fi.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var n = 0, lewat = 0;
        try {
          var j = JSON.parse(String(rd.result));
          var arr = j && j.item ? j.item : (j && j.a ? j.a : (j && j.length ? j : []));
          if (!arr || !arr.length) { nota(S.gagal); return; }
          arr.forEach(function (t) {
            var id = t.messageId || t.m || "";
            if (!id || !idx[id] || punyaSaya(id) || (dipaku[id] && st.h.indexOf(id) < 0)) { lewat++; return; }
            st.a.push({ m: id, s: t.isoWib || t.s || iso(id), p: String(t.preview || t.p || ringkas(id) || "").slice(0, 160) });
            n++;
          });
          simpan(st);
          gambar();
          nota(S.impor.split("{n}").join(n).split("{m}").join(lewat));
        } catch (e) { nota(S.gagal); }
      };
      rd.readAsText(f);
      fi.value = "";
    };
  }
  if (bEx) {
    bEx.onclick = function () {
      var list = daftar();
      var isi = list.map(function (x, i) { return { bookmarkNo: i + 1, preview: x.p, isoWib: x.s, messageId: x.m, mode: x.d ? "manual" : "panel" }; });
      var teks = JSON.stringify({ room: BK.nama, quota: "", diekspor: new Date().toISOString(), item: isi }, null, 1);
      var nama = "bookmarks-" + BK.slug + ".json";
      var url = URL.createObjectURL(new Blob([teks], { type: "application/json" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = nama;
      document.body.appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      nota(S.ekspor.split("{f}").join(nama));
    };
  }

  // ---- wire it up ------------------------------------------------------------------------------
  det = document.getElementById("bml");
  kotak = document.getElementById("bmlist");
  notaEl = document.getElementById("bmnota");
  qa(".m[data-m]").forEach(function (e) {
    var tm = q(".tm", e);
    if (!tm) return;
    var b = el("button", "dot");
    b.type = "button";
    b.textContent = "\u22ee";
    b.title = S.more;
    b.setAttribute("aria-label", S.more);
    b.setAttribute("aria-haspopup", "true");
    b.setAttribute("aria-expanded", "false");
    tm.appendChild(b);
  });
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    var b = t && t.closest ? t.closest(".dot") : null;
    if (b) {
      ev.preventDefault();
      var baris = b.closest(".m");
      var mid = baris ? baris.getAttribute("data-m") : "";
      if (dotAktif === b) { tutupMenu(); } else { tutupMenu(); buka(b, mid); }
      return;
    }
    if (!t || !t.closest || !t.closest(".mx")) tutupMenu();
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") tutupMenu(); });
  window.addEventListener("scroll", tutupMenu, true);
  window.addEventListener("resize", tutupMenu);
  gambar();
  if (location.hash && location.hash.indexOf("#bmk-") === 0) {
    var t2 = document.getElementById(location.hash.slice(1));
    if (t2) t2.scrollIntoView();
  }
})();
