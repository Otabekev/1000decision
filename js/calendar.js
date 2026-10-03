/*
 * 1000 Decisions — Calendar.
 *
 * Not a planner. Nothing is scheduled here and there is no way to add
 * anything. It fills itself from decisions you have already made, so at
 * the end of the week you look back at what you actually did.
 *
 *   Week:  a time grid (agenda list on phones), one block per decision at
 *          the time you made it, plus the week's moments (firsts, big bets,
 *          battles started and ended).
 *   Month: one cell per day, colored by where the decisions went.
 */
(function () {
  'use strict';

  var HOUR = 64;       // px per hour in the week grid
  var BLOCK = 30;      // px height of one decision block
  var MODE_KEY = 'td-calendar-mode';

  function boot() {
    var TD = window.TD;
    var U = TD.util;
    var $ = U.$, esc = U.esc, fmtNum = U.fmtNum;
    var DAY = 86400000;

    var mode = 'week';
    try { if (localStorage.getItem(MODE_KEY) === 'month') mode = 'month'; } catch (e) {}
    var anchor = new Date();

    function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
    function weekStart(d) { var x = startOfDay(d); var wd = (x.getDay() + 6) % 7; return addDays(x, -wd); } // Monday
    function sameDay(a, b) { return U.dayIndex(a) === U.dayIndex(b); }
    function hhmm(d) { return d.toLocaleTimeString(TD.LOCALE, { hour: 'numeric', minute: '2-digit' }); }
    function alpha(hex, a) { return /^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex; }

    function catColors() {
      var m = Object.create(null);
      TD.state.categories.forEach(function (c) { m[c.name] = c.color; });
      return m;
    }

    /** Decisions grouped by local day key, for [from, to). */
    function byDay(from, to) {
      var out = Object.create(null);
      var a = from.getTime(), b = to.getTime();
      TD.state.decisions.forEach(function (d, i) {
        var t = Date.parse(d.timestamp);
        if (t < a || t >= b) return;
        var k = U.ymd(new Date(t));
        (out[k] = out[k] || []).push({ d: d, n: i + 1, at: new Date(t) });
      });
      return out;
    }

    /** Things that happened that aren't decisions: firsts, bets, battles. */
    function moments(from, to) {
      var s = TD.state;
      var out = Object.create(null);
      if (TD.hiddenNow()) return out;
      function add(date, m) { if (date >= from && date < to) { var k = U.ymd(date); (out[k] = out[k] || []).push(m); } }
      s.firsts.forEach(function (f) { var d = U.parseYmd(f.date); if (d) add(d, { kind: 'first', label: 'First: ' + f.title }); });
      s.bets.forEach(function (b) { add(new Date(b.madeAt), { kind: 'bet', label: 'Big bet: ' + b.title }); });
      s.battles.forEach(function (b) {
        add(new Date(b.startedAt), { kind: 'battle', label: 'Battle began: ' + b.title });
        if (b.endedAt) add(new Date(b.endedAt), { kind: 'won', label: (b.status === 'won' ? 'Won: ' : 'Over: ') + b.title });
      });
      return out;
    }

    // ── Render ─────────────────────────────────────────────────────────
    function paint() {
      var root = document.getElementById('calendar-root');
      if (!root || document.getElementById('view-calendar').hidden) return;
      root.innerHTML = mode === 'month' ? monthHtml() : weekHtml();
      var grid = root.querySelector('.cal-grid__body');
      if (grid && !grid.dataset.scrolled) {
        grid.dataset.scrolled = '1';
        var first = grid.querySelector('.cal-ev');
        var target = first ? Math.max(0, parseFloat(first.style.top) - 24) : 7 * HOUR;
        grid.scrollTop = Math.min(target, grid.scrollHeight);
      }
    }

    function head(title, sub, rangeLabel) {
      return '<section class="war cal-hero">' +
        '<div class="war__top"><div><p class="eyebrow">Calendar</p><h1 class="war__title">' + title + '</h1></div>' +
        '<div class="cal-switch" role="group" aria-label="Calendar view">' +
        '<button type="button" class="btn btn--ghost-light" data-cal-mode="week" aria-pressed="' + (mode === 'week') + '">Week</button>' +
        '<button type="button" class="btn btn--ghost-light" data-cal-mode="month" aria-pressed="' + (mode === 'month') + '">Month</button></div></div>' +
        '<p class="war__line">' + sub + '</p>' +
        '<div class="cal-nav"><button type="button" class="btn btn--ghost-light" data-cal="prev" aria-label="Previous">‹</button>' +
        '<b class="cal-nav__label">' + rangeLabel + '</b>' +
        '<button type="button" class="btn btn--ghost-light" data-cal="next" aria-label="Next">›</button>' +
        '<button type="button" class="btn btn--ghost-light" data-cal="today">Today</button></div>' +
        '</section>';
    }

    function weekHtml() {
      var from = weekStart(anchor);
      var to = addDays(from, 7);
      var today = startOfDay(new Date());
      var days = byDay(from, to);
      var mom = moments(from, to);
      var colors = catColors();
      var list = [];
      Object.keys(days).forEach(function (k) { list = list.concat(days[k]); });
      var isThis = sameDay(from, weekStart(new Date()));
      var label = from.toLocaleDateString(TD.LOCALE, { month: 'short', day: 'numeric' }) + ' – ' + addDays(to, -1).toLocaleDateString(TD.LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });

      var html = head(isThis ? 'This week, so far.' : 'The week you had.', 'Nothing to plan, nothing to fall behind on. Every block here is a decision you already made.', label);
      html += review(from, to, list, days);

      // Moments strip
      var dayCells = [];
      for (var i = 0; i < 7; i++) dayCells.push(addDays(from, i));
      var hasMoments = dayCells.some(function (d) { return mom[U.ymd(d)]; });

      // Desktop: time grid
      var minH = 6, maxH = 23;
      list.forEach(function (e) { var h = e.at.getHours(); if (h < minH) minH = h; if (h + 1 > maxH) maxH = Math.min(24, h + 1); });
      var cols = dayCells.map(function (d) {
        var k = U.ymd(d);
        var evs = (days[k] || []).slice().sort(function (a, b) { return a.at - b.at; });
        // Blocks that overlap form a cluster; only a cluster is split into lanes.
        var cluster = [], lanes = [], clusterEnd = -1;
        function closeCluster() { cluster.forEach(function (e) { e.nl = lanes.length; }); cluster = []; lanes = []; }
        evs.forEach(function (e) {
          var top = ((e.at.getHours() - minH) * 60 + e.at.getMinutes()) / 60 * HOUR;
          if (top >= clusterEnd) closeCluster();
          e.top = top;
          var lane = 0;
          while (lanes[lane] !== undefined && lanes[lane] > top) lane++;
          lanes[lane] = top + BLOCK + 2;
          e.lane = lane;
          cluster.push(e);
          clusterEnd = Math.max(clusterEnd, top + BLOCK + 2);
        });
        closeCluster();
        var future = d > today;
        var blocks = evs.map(function (e) {
          var c = colors[e.d.categoryName] || '#8E949B';
          return '<button type="button" class="cal-ev" data-action="edit-decision" data-id="' + e.d.id + '" style="top:' + e.top.toFixed(1) + 'px;left:calc(' + (e.lane * 100 / e.nl) + '% + 2px);width:calc(' + (100 / e.nl) + '% - 4px);--c:' + c + ';--cb:' + alpha(c, 0.14) + '" title="' + esc(hhmm(e.at) + ' · ' + e.d.categoryName + ' · ' + e.d.text + (e.d.result ? ' → ' + e.d.result : '')) + '">' +
            '<span class="cal-ev__x">' + esc(e.d.text) + '</span><span class="cal-ev__t">' + esc(hhmm(e.at)) + '</span></button>';
        }).join('');
        var nowLine = sameDay(d, today) ? '<i class="cal-now" style="top:' + (((new Date().getHours() - minH) * 60 + new Date().getMinutes()) / 60 * HOUR).toFixed(1) + 'px"></i>' : '';
        return '<div class="cal-col' + (sameDay(d, today) ? ' is-today' : '') + (future ? ' is-future' : '') + '">' + blocks + nowLine + '</div>';
      }).join('');
      var hours = '';
      for (var h = minH; h < maxH; h++) hours += '<div class="cal-hour" style="top:' + ((h - minH) * HOUR) + 'px"><span>' + new Date(2000, 0, 1, h).toLocaleTimeString(TD.LOCALE, { hour: 'numeric' }) + '</span></div>';
      var heads = dayCells.map(function (d) {
        var k = U.ymd(d);
        var n = (days[k] || []).length;
        return '<div class="cal-dh' + (sameDay(d, today) ? ' is-today' : '') + (d > today ? ' is-future' : '') + '"><span>' + d.toLocaleDateString(TD.LOCALE, { weekday: 'short' }) + '</span><b>' + d.getDate() + '</b><em>' + (d > today ? '' : n ? n + ' ' + U.plural(n, 'decision') : 'quiet') + '</em></div>';
      }).join('');
      var momRow = hasMoments ? '<div class="cal-moments"><div class="cal-gutter"></div>' + dayCells.map(function (d) {
        return '<div>' + (mom[U.ymd(d)] || []).map(function (m) { return '<span class="cal-m cal-m--' + m.kind + '" title="' + esc(m.label) + '">' + esc(m.label) + '</span>'; }).join('') + '</div>';
      }).join('') + '</div>' : '';

      html += '<section class="panel cal-week">' +
        '<div class="cal-grid"><div class="cal-heads"><div class="cal-gutter"></div>' + heads + '</div>' + momRow +
        '<div class="cal-grid__body"><div class="cal-grid__inner" style="height:' + ((maxH - minH) * HOUR) + 'px">' + hours + '<div class="cal-cols">' + cols + '</div></div></div></div>';

      // Phones: agenda
      html += '<div class="cal-agenda">' + dayCells.slice().reverse().filter(function (d) { return d <= today; }).map(function (d) {
        var k = U.ymd(d);
        var evs = (days[k] || []).slice().sort(function (a, b) { return a.at - b.at; });
        return '<div class="cal-day' + (sameDay(d, today) ? ' is-today' : '') + '"><h3><span>' + (sameDay(d, today) ? 'Today' : d.toLocaleDateString(TD.LOCALE, { weekday: 'long' })) + '</span> ' + d.toLocaleDateString(TD.LOCALE, { month: 'short', day: 'numeric' }) + '<em>' + (evs.length ? evs.length + ' ' + U.plural(evs.length, 'decision') : '') + '</em></h3>' +
          (mom[k] || []).map(function (m) { return '<p class="cal-m cal-m--' + m.kind + '">' + esc(m.label) + '</p>'; }).join('') +
          (evs.length ? '<ul>' + evs.map(function (e) {
            return '<li><button type="button" data-action="edit-decision" data-id="' + e.d.id + '" style="--c:' + (colors[e.d.categoryName] || '#8E949B') + '"><time>' + esc(hhmm(e.at)) + '</time><span><b>' + esc(e.d.categoryName) + '</b> ' + esc(e.d.text) + (e.d.result ? '<em>→ ' + esc(e.d.result) + '</em>' : '') + '</span></button></li>';
          }).join('') + '</ul>' : '<p class="cal-quiet">A quiet day.</p>') + '</div>';
      }).join('') + (from > today ? '<p class="cal-quiet">This week hasn’t happened yet. It fills itself in as you go.</p>' : '') + '</div>';
      html += '</section>';
      return html;
    }

    function review(from, to, list, days) {
      if (!list.length) {
        var future = from > new Date();
        return '<section class="panel cal-review"><p class="cal-review__line">' + (future ? 'This week hasn’t happened yet. It fills itself in as you make decisions.' : 'No decisions this week. That’s information, not failure. The next one starts it.') + '</p></section>';
      }
      var counts = Object.create(null);
      var results = 0;
      list.forEach(function (e) { counts[e.d.categoryName] = (counts[e.d.categoryName] || 0) + 1; if (e.d.result) results++; });
      var cats = TD.state.categories.filter(function (c) { return counts[c.name]; });
      var top = cats.slice().sort(function (a, b) { return counts[b.name] - counts[a.name]; })[0];
      var first = TD.state.categories[0];
      var active = Object.keys(days).length;
      var best = Object.keys(days).sort(function (a, b) { return days[b].length - days[a].length; })[0];
      var bestDate = U.parseYmd(best);
      var line = '<b>' + fmtNum(list.length) + ' ' + U.plural(list.length, 'decision') + '</b> over ' + active + ' ' + U.plural(active, 'day') + '. ';
      if (top) line += 'Most went to <b>' + esc(top.name) + '</b> (' + counts[top.name] + '). ';
      if (first && top && first.name !== top.name) line += 'Your #1, ' + esc(first.name) + ', got ' + (counts[first.name] || 0) + '. ';
      if (bestDate) line += 'Strongest day: ' + bestDate.toLocaleDateString(TD.LOCALE, { weekday: 'long' }) + ' (' + days[best].length + ').';
      var total = list.length;
      var bar = '<div class="cal-split" aria-hidden="true">' + cats.map(function (c) { return '<i style="width:' + (counts[c.name] / total * 100).toFixed(2) + '%;background:' + c.color + '" title="' + esc(c.name) + ' ' + counts[c.name] + '"></i>'; }).join('') + '</div>' +
        '<div class="cal-legend">' + cats.map(function (c) { return '<span><i style="background:' + c.color + '"></i>' + esc(c.name) + ' <b>' + counts[c.name] + '</b></span>'; }).join('') + (results ? '<span class="cal-legend__r">' + results + ' with a result</span>' : '') + '</div>';
      return '<section class="panel cal-review"><p class="eyebrow">Week in review</p><p class="cal-review__line">' + line + '</p>' + bar + '</section>';
    }

    function monthHtml() {
      var first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      var gridStart = weekStart(first);
      var nextMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
      var weeks = Math.ceil((U.dayIndex(nextMonth) - U.dayIndex(gridStart)) / 7);
      var end = addDays(gridStart, weeks * 7);
      var days = byDay(gridStart, end);
      var mom = moments(gridStart, end);
      var colors = catColors();
      var today = startOfDay(new Date());
      var monthCount = 0, activeDays = 0;
      Object.keys(days).forEach(function (k) { var d = U.parseYmd(k); if (d.getMonth() === first.getMonth()) { monthCount += days[k].length; activeDays++; } });
      var max = 1;
      Object.keys(days).forEach(function (k) { max = Math.max(max, days[k].length); });
      var label = first.toLocaleDateString(TD.LOCALE, { month: 'long', year: 'numeric' });
      var html = head(label.split(' ')[0] + '.', monthCount ? fmtNum(monthCount) + ' ' + U.plural(monthCount, 'decision') + ' on ' + activeDays + ' ' + U.plural(activeDays, 'day') + '. Click a day to see that week.' : 'Nothing logged this month yet. It fills itself in as you go.', label);
      var wd = [];
      for (var i = 0; i < 7; i++) wd.push('<div class="cal-mh">' + addDays(gridStart, i).toLocaleDateString(TD.LOCALE, { weekday: 'short' }) + '</div>');
      var cells = [];
      for (var j = 0; j < weeks * 7; j++) {
        var d = addDays(gridStart, j);
        var k = U.ymd(d);
        var evs = days[k] || [];
        var counts = Object.create(null);
        evs.forEach(function (e) { counts[e.d.categoryName] = (counts[e.d.categoryName] || 0) + 1; });
        var segs = Object.keys(counts).map(function (n) { return '<i style="flex:' + counts[n] + ';background:' + (colors[n] || '#8E949B') + '"></i>'; }).join('');
        cells.push('<button type="button" class="cal-cell' + (d.getMonth() !== first.getMonth() ? ' is-out' : '') + (sameDay(d, today) ? ' is-today' : '') + (d > today ? ' is-future' : '') + '" data-cal-day="' + k + '" style="--heat:' + (evs.length / max).toFixed(2) + '"' + (d > today ? ' tabindex="-1"' : '') + '>' +
          '<span class="cal-cell__d">' + d.getDate() + '</span>' +
          (evs.length ? '<b class="cal-cell__n">' + evs.length + '</b>' : '') +
          ((mom[k] || []).length ? '<span class="cal-cell__m" title="' + esc(mom[k].map(function (m) { return m.label; }).join('\n')) + '">★</span>' : '') +
          (segs ? '<span class="cal-cell__bar">' + segs + '</span>' : '') + '</button>');
      }
      return html + '<section class="panel cal-month"><div class="cal-mgrid">' + wd.join('') + cells.join('') + '</div></section>';
    }

    // ── Wiring ─────────────────────────────────────────────────────────
    function move(dir) {
      if (mode === 'month') anchor = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
      else anchor = addDays(anchor, 7 * dir);
      paint();
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cal], [data-cal-mode], [data-cal-day]');
      if (!b) return;
      if (b.dataset.calMode) {
        mode = b.dataset.calMode;
        try { localStorage.setItem(MODE_KEY, mode); } catch (er) {}
        paint();
      } else if (b.dataset.calDay) {
        if (b.classList.contains('is-future')) return;
        anchor = U.parseYmd(b.dataset.calDay);
        mode = 'week';
        try { localStorage.setItem(MODE_KEY, mode); } catch (er) {}
        paint();
      } else if (b.dataset.cal === 'prev') move(-1);
      else if (b.dataset.cal === 'next') move(1);
      else if (b.dataset.cal === 'today') { anchor = new Date(); paint(); }
    });

    document.addEventListener('keydown', function (e) {
      if (document.getElementById('view-calendar').hidden) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.td-overlay') || document.getElementById('sheet').open || document.getElementById('confirm').open) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    });

    TD.onRender(paint);
    window.addEventListener('hashchange', function () { setTimeout(paint, 0); });
    document.addEventListener('click', function (e) { if (e.target.closest('.tab[data-view="calendar"]')) setTimeout(paint, 0); });
    paint();

    window.TDCalendar = { paint: paint, show: function (date, m) { anchor = date || new Date(); mode = m || mode; paint(); } };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
