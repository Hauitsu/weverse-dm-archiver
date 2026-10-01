// gallery.js -- the media gallery overlay and the lightbox behind it, for pages built by src/render.mjs.
//
// The page hands over everything it needs: WG is the media list ([message id, kind, day, small copy,
// file, seconds] per photo, video and voice note), WGM the month headings and WDT the few words that
// change with the language. This file is inlined into the export exactly as it is written here: no
// modules, no build step, nothing it needs from outside the page.
//
// It is also the lightbox: the round buttons in the corner of a picture lead back to the gallery and
// to the message that carried it, and the arrow keys walk whatever list the picture was opened from.
(function () {
  var gal = document.getElementById('gal');
  var ALL = window.WG || [];
  if (!gal) return;
  if (!ALL.length) { if (gal.parentNode) gal.parentNode.removeChild(gal); return; }

  var WDT = window.WDT || {};
  var WGM = window.WGM || {};
  var body = document.getElementById('gb');
  var filters = document.getElementById('gfb');
  var opener = document.getElementById('gbtn');
  var lb = document.getElementById('lb');
  var elImg = document.getElementById('lbi');
  var elVid = document.getElementById('lbv');
  var elAud = document.getElementById('lba');
  var elCt = document.getElementById('lbc');
  var btnGal = document.getElementById('lbg');
  var btnJump = document.getElementById('lbj');
  var cur = ALL;      // what the overlay shows right now
  var lbList = ALL;   // what the lightbox walks
  var li = 0;
  var back = null;    // where the focus goes when the overlay closes
  var scrolled = 0;   // where the grid was left, so opening it again lands in the same place

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function glyph(k) { return k === 'v' ? '\u25B6' : (k === 'a' ? '\uD83C\uDF99' : '\uD83D\uDDBC'); }
  function kindOf(k) { return WDT[k] || (k === 'p' ? 'photo' : (k === 'v' ? 'video' : 'voice note')); }
  // The day heading is the one the transcript already shows, read straight off the divider, so the
  // gallery speaks the same language as the page without carrying a second copy of the date format.
  function dayLabel(d) {
    var el = document.getElementById('d-' + d);
    return (el && el.getAttribute('title')) || d;
  }
  function stamp(n) {
    n = Math.round(Number(n) || 0);
    if (!n) return '';
    var m = Math.floor(n / 60), s = n % 60;
    return m + ':' + (s < 10 ? '0' + s : s);
  }

  function render() {
    var i, it, mo, d, byMonth = {}, order = [];
    for (i = 0; i < cur.length; i++) {
      it = cur[i]; mo = it[2].slice(0, 7); d = it[2];
      if (!byMonth[mo]) { byMonth[mo] = {}; order.push(mo); }
      if (!byMonth[mo][d]) byMonth[mo][d] = [];
      byMonth[mo][d].push(i);
    }
    var h = '';
    for (var m = 0; m < order.length; m++) {
      mo = order[m];
      h += '<div class="gm">' + esc(WGM[mo] || mo) + '</div>';
      var dayList = [], k;
      for (k in byMonth[mo]) if (byMonth[mo].hasOwnProperty(k)) dayList.push(k);
      for (var y = 0; y < dayList.length; y++) {
        d = dayList[y];
        var idx = byMonth[mo][d];
        h += '<div class="gd">' + esc(dayLabel(d)) + ' (' + idx.length + ')</div><div class="grid">';
        for (var z = 0; z < idx.length; z++) {
          var n = idx[z], item = cur[n], small = item[3], kind = item[1], sec = stamp(item[5]);
          h += '<button class="tl" type="button" data-i="' + n + '" aria-label="' + esc(kindOf(kind)) + '">';
          h += small ? '<img src="' + esc(small) + '" loading="lazy" decoding="async" alt="">'
                     : '<span class="k">' + glyph(kind) + '</span>';
          if (sec) h += '<span class="d">' + (kind === 'p' ? '' : glyph(kind) + ' ') + esc(sec) + '</span>';
          h += '</button>';
        }
        h += '</div>';
      }
    }
    body.innerHTML = h || '<div class="empty">' + esc(WDT.empty || '') + '</div>';
  }

  function showAt(n) {
    if (!lbList.length) return;
    li = (n + lbList.length) % lbList.length;
    var it = lbList[li], kind = it[1], small = it[3], file = it[4];
    if (elVid) { elVid.hidden = true; elVid.removeAttribute('src'); }
    if (elAud) { elAud.hidden = true; elAud.removeAttribute('src'); }
    elImg.style.display = 'none';
    elImg.onerror = null;
    if (kind === 'p') {
      elImg.style.display = '';
      elCt.textContent = (li + 1) + ' / ' + lbList.length + (WDT.orig ? ' \u00B7 ' + WDT.orig : '');
      // A thumb is what the list carries when the original is missing or unreadable: fall back to it
      // instead of leaving a broken picture on screen.
      elImg.onerror = function () {
        elImg.onerror = null;
        if (small && elImg.getAttribute('src') !== small) {
          elImg.setAttribute('src', small);
          elCt.textContent = (li + 1) + ' / ' + lbList.length + (WDT.small ? ' \u00B7 ' + WDT.small : '');
        }
      };
      elImg.setAttribute('src', file);
    } else if (kind === 'v' && elVid) {
      elVid.hidden = false;
      elVid.setAttribute('src', file);
      elCt.textContent = (li + 1) + ' / ' + lbList.length + ' \u00B7 ' + kindOf(kind);
    } else if (elAud) {
      elAud.hidden = false;
      elAud.setAttribute('src', file);
      elCt.textContent = (li + 1) + ' / ' + lbList.length + ' \u00B7 ' + kindOf(kind);
    }
  }
  function openLB(list, n) {
    lbList = (list && list.length) ? list : ALL;
    if (lb) lb.classList.add('on');
    showAt(n || 0);
  }
  function closeLB() {
    if (!lb) return;
    lb.classList.remove('on');
    elImg.removeAttribute('src');
    elImg.onerror = null;
    if (elVid) { try { elVid.pause(); } catch (e) {} elVid.removeAttribute('src'); elVid.hidden = true; }
    if (elAud) { try { elAud.pause(); } catch (e) {} elAud.removeAttribute('src'); elAud.hidden = true; }
  }

  function filter(k) {
    cur = k === 'all' ? ALL : ALL.filter(function (it) { return it[1] === k; });
    if (filters) {
      var bs = filters.getElementsByTagName('button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-k') === k ? 'true' : 'false');
    }
    render();
    body.scrollTop = 0;
  }
  function closeGal(focusBack) {
    scrolled = body.scrollTop;
    gal.classList.remove('on');
    gal.setAttribute('aria-hidden', 'true');
    if (opener) opener.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (focusBack !== false && back && back.focus) { try { back.focus(); } catch (e) {} }
    back = null;
  }
  // Point the grid at one file. The gallery is opened from the lightbox with the media that is on
  // screen, so the grid scrolls to that tile (and rings it for a moment) instead of starting over at
  // the top of the room.
  function showInGrid(item, retried) {
    var n = cur.indexOf(item);
    if (n < 0) {
      // The lightbox can hold a photo while the grid is filtered to video, or the other way round:
      // ask for everything once, so the file on screen is in the list being pointed at.
      if (!retried && cur !== ALL) { filter('all'); showInGrid(item, true); }
      return;
    }
    var tl = body.querySelector('.tl[data-i="' + n + '"]');
    if (!tl) return;
    try { tl.scrollIntoView({ block: 'center' }); }
    catch (e) { body.scrollTop = Math.max(0, tl.offsetTop - body.offsetTop - (body.clientHeight - tl.offsetHeight) / 2); }
    tl.classList.add('pin');
    setTimeout(function () { tl.classList.remove('pin'); }, 1800);
  }
  function openGal(item) {
    back = document.activeElement;
    gal.classList.add('on');
    gal.setAttribute('aria-hidden', 'false');
    if (opener) opener.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    render();
    var c = document.getElementById('gcl');
    if (c) { try { c.focus(); } catch (e) {} }
    if (item) showInGrid(item);
    else body.scrollTop = scrolled;
  }
  // Jump to message: shut both layers, walk the transcript to the bubble that carried this file, let
  // it ring for a moment and leave the address pointing at that day.
  function jump() {
    var it = lbList[li];
    if (!it) return;
    var t = document.querySelector('[data-m="' + it[0] + '"]');
    if (!t) return;
    closeLB();
    if (gal.classList.contains('on')) closeGal();
    try { t.scrollIntoView({ block: 'center' }); } catch (e) { t.scrollIntoView(); }
    var b = t.querySelector('.bub') || t;
    b.classList.add('flash');
    setTimeout(function () { b.classList.remove('flash'); }, 2600);
    try { history.replaceState(null, '', '#d-' + it[2]); } catch (e) {}
  }

  if (opener) opener.addEventListener('click', function () {
    if (gal.classList.contains('on')) closeGal(); else openGal();
  });
  var gcl = document.getElementById('gcl');
  if (gcl) gcl.addEventListener('click', closeGal);
  if (filters) filters.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.fb') : null;
    if (b) filter(b.getAttribute('data-k'));
  });
  // A tile gets out of the way: the gallery closes so the file has the whole screen, and the lightbox
  // takes over with the round button in its corner to come back to the grid. The filter is kept.
  body.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.tl') : null;
    if (!b) return;
    closeGal(false);
    openLB(cur, Number(b.getAttribute('data-i')) || 0);
  });
  gal.addEventListener('click', function (e) { if (e.target === gal) closeGal(); });

  // A picture in the transcript opens the same lightbox, walking the photos only - the way it worked
  // before the gallery existed. Video and voice notes keep their own controls on the page.
  var photosOnly = ALL.filter(function (it) { return it[1] === 'p'; });
  var fotos = [].slice.call(document.querySelectorAll('a.ph'));
  fotos.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var u = a.getAttribute('href'), n = -1;
      for (var i = 0; i < photosOnly.length; i++) if (photosOnly[i][4] === u) { n = i; break; }
      openLB(photosOnly, n < 0 ? 0 : n);
    });
  });

  if (btnGal) btnGal.addEventListener('click', function (e) {
    e.stopPropagation();
    closeLB();
    if (!gal.classList.contains('on')) openGal(lbList[li]);
  });
  if (btnJump) btnJump.addEventListener('click', function (e) { e.stopPropagation(); jump(); });
  var lbx = document.getElementById('lbx');
  var lbp = document.getElementById('lbp');
  var lbn = document.getElementById('lbn');
  if (lbx) lbx.addEventListener('click', closeLB);
  if (lbp) lbp.addEventListener('click', function (e) { e.stopPropagation(); showAt(li - 1); });
  if (lbn) lbn.addEventListener('click', function (e) { e.stopPropagation(); showAt(li + 1); });
  if (lb) lb.addEventListener('click', function (e) { if (e.target === lb) closeLB(); });

  document.addEventListener('keydown', function (e) {
    if (lb && lb.classList.contains('on')) {
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowLeft') showAt(li - 1);
      else if (e.key === 'ArrowRight') showAt(li + 1);
      return;
    }
    if (gal.classList.contains('on') && e.key === 'Escape') closeGal();
  });
})();
