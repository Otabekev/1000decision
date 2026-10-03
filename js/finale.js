/*
 * 1000 Decisions — the finale, the Book and the poster.
 *
 * When the total reaches the goal: a full-screen "Chapter complete" moment,
 * the sealed letter opens, and the season can be kept as
 *   - the Book of your grind (printable; "Save as PDF" in the print dialog)
 *   - a poster (PNG, every decision as one colored square)
 * then Season 2 starts: the goal moves up by one season and a new letter
 * can be sealed.
 */
(function () {
  'use strict';

  function boot() {
    var TD = window.TD;
    var U = TD.util;
    var $ = U.$, esc = U.esc, fmtNum = U.fmtNum;
    var I = window.TDInsights, BT = window.TDBattles, R = window.TDRecord;
    var DAY = 86400000;

    // ── Season numbers ─────────────────────────────────────────────────
    function seasonInfo(s) {
      s = s || TD.state;
      var prev = s.seasons[s.seasons.length - 1];
      var startDecision = prev ? prev.decisions : 0;
      var start = prev ? U.ymd(new Date(prev.endedAt)) : s.settings.startDate;
      return { number: s.seasons.length + 1, start: start, startDecision: startDecision, step: s.seasons.length ? s.seasons[0].decisions : s.settings.goal };
    }

    function stats(s) {
      s = s || TD.state;
      var si = seasonInfo(s);
      var list = s.decisions.slice(si.startDecision, s.settings.goal);
      var counts = Object.create(null);
      var perDay = Object.create(null);
      list.forEach(function (d) {
        counts[d.categoryName] = (counts[d.categoryName] || 0) + 1;
        var k = U.ymd(new Date(d.timestamp));
        perDay[k] = (perDay[k] || 0) + 1;
      });
      var last = list.length ? new Date(list[list.length - 1].timestamp) : new Date();
      var days = U.dayNumber(si.start, last);
      var bestDay = Object.keys(perDay).reduce(function (a, k) { return !a || perDay[k] > perDay[a] ? k : a; }, null);
      var results = list.filter(function (d) { return d.result && d.result.trim(); }).length;
      var cats = s.categories.map(function (c) { return { name: c.name, color: c.color, why: c.why, rank: c.priorityRank, count: counts[c.name] || 0 }; });
      Object.keys(counts).forEach(function (n) { if (!cats.some(function (c) { return c.name === n; })) cats.push({ name: n, color: '#8E949B', why: '', rank: 99, count: counts[n] }); });
      return {
        season: si.number,
        start: si.start,
        end: last,
        days: Math.max(1, days),
        decisions: list.length,
        activeDays: Object.keys(perDay).length,
        bestDay: bestDay ? { date: bestDay, count: perDay[bestDay] } : null,
        results: results,
        cats: cats,
        battles: BT.summary(s.battles, new Date()),
        firsts: s.firsts.length,
        lessons: s.lessons.length,
        bets: s.bets.length,
        pinned: s.lessons.filter(function (l) { return l.pinned; }).slice(0, 3)
      };
    }

    // ── The finale overlay ─────────────────────────────────────────────
    var root = null;
    var scene = 'reached';

    function open() {
      if (root) return;
      if (document.querySelector('.ritual')) return;
      if (document.getElementById('sheet').open) TD.closeSheet();
      root = document.createElement('div');
      root.className = 'finale td-overlay';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Chapter complete');
      document.body.appendChild(root);
      document.documentElement.classList.add('is-locked');
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      scene = 'reached';
      if (TD.state.settings.finaleShownFor < TD.state.settings.goal) {
        TD.state.settings.finaleShownFor = TD.state.settings.goal;
        TD.save();
      }
      paint();
    }

    function close() {
      if (!root) return;
      var r = root;
      root = null;
      r.classList.add('is-leaving');
      setTimeout(function () { r.remove(); if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked'); }, U.reducedMotion() ? 0 : 350);
      TD.render();
    }

    function paint() {
      var s = TD.state;
      var st = stats(s);
      var goal = s.settings.goal;
      var L = s.letter;
      var html = '';
      if (scene === 'reached') {
        html = '<p class="ritual__eyebrow">Season ' + st.season + ' · chapter complete</p>' +
          '<div class="finale__num" data-count="' + goal + '">' + fmtNum(goal) + '</div>' +
          '<h1 class="ritual__title ritual__title--sm">You did what you said you would.</h1>' +
          '<p class="ritual__lede">' + fmtNum(st.decisions) + ' decisions in ' + fmtNum(st.days) + ' ' + U.plural(st.days, 'day') + '. Not one of them was dramatic, and together they changed the direction.</p>' +
          '<dl class="finale__stats">' +
          stat('Days', fmtNum(st.days)) +
          stat('Days you showed up', fmtNum(st.activeDays)) +
          stat('Results written', fmtNum(st.results)) +
          stat('Battles won', fmtNum(st.battles.won)) +
          '</dl>' +
          '<div class="ritual__actions">' +
          (L ? '<button type="button" class="btn btn--brass btn--lg" data-f="letter">' + (L.openedAt ? 'Read your letter again' : 'Open your letter') + '</button>' : '') +
          '<button type="button" class="btn ' + (L ? 'btn--ghost-light' : 'btn--brass btn--lg') + '" data-f="built">See what you built</button></div>';
      } else if (scene === 'letter') {
        var opened = !!L.openedAt;
        html = '<p class="ritual__eyebrow">The letter · sealed ' + esc(longDate(L.sealedAt)) + '</p>' +
          '<div class="envelope' + (opened ? ' is-open' : '') + '">' +
          '<button type="button" class="envelope__seal" data-f="break" aria-label="Break the seal"' + (opened ? ' hidden' : '') + '><span>' + fmtNum(goal) + '</span></button>' +
          '<div class="envelope__paper">' +
          (opened ? '<p class="envelope__to">To the man who reached ' + fmtNum(goal) + ',</p><div class="envelope__text">' + esc(L.text).replace(/\n/g, '<br>') + '</div><p class="envelope__from">Written on Day 1, ' + esc(longDate(L.sealedAt)) + '</p>'
            : '<p class="envelope__closed">Written ' + Math.max(0, Math.round((Date.now() - Date.parse(L.sealedAt)) / DAY)) + ' days ago, by the man who started. Break the seal.</p>') +
          '</div></div>' +
          '<div class="ritual__actions">' + (opened ? '<button type="button" class="btn btn--brass btn--lg" data-f="built">Continue</button>' : '') + '<button type="button" class="btn btn--ghost-light" data-f="reached">Back</button></div>';
      } else {
        var max = Math.max.apply(null, st.cats.map(function (c) { return c.count; }).concat([1]));
        html = '<p class="ritual__eyebrow">Season ' + st.season + ' · ' + esc(longDate(st.start)) + ' to ' + esc(longDate(st.end)) + '</p>' +
          '<h1 class="ritual__title ritual__title--sm">What ' + fmtNum(st.decisions) + ' decisions built.</h1>' +
          '<div class="finale__bars">' + st.cats.filter(function (c) { return c.count; }).map(function (c) {
            return '<div class="finale__bar"><span class="finale__bar-name">' + esc(c.name) + '</span><span class="finale__bar-track"><i style="width:' + (c.count / max * 100).toFixed(1) + '%;background:' + c.color + '"></i></span><b>' + fmtNum(c.count) + '</b></div>';
          }).join('') + '</div>' +
          (st.pinned.length ? '<div class="finale__lessons"><p class="ritual__eyebrow">What you learned</p>' + st.pinned.map(function (l) { return '<blockquote>' + esc(l.text) + '</blockquote>'; }).join('') + '</div>' : '') +
          '<div class="finale__keep"><p class="ritual__eyebrow">Keep it</p><div class="ritual__actions">' +
          '<button type="button" class="btn btn--brass btn--lg" data-action="book-print">Print the Book</button>' +
          '<button type="button" class="btn btn--ghost-light" data-action="poster-save">Save the poster</button></div>' +
          '<p class="ritual__hint">The Book is your whole record, every decision included. Choose “Save as PDF” in the print window.</p></div>' +
          '<div class="finale__next"><div><b>Season ' + (st.season + 1) + '</b><span>The next ' + fmtNum(seasonInfo(s).step) + '. Same priorities, a new letter, the count keeps going.</span></div>' +
          '<button type="button" class="btn btn--brass" data-f="season">Start Season ' + (st.season + 1) + '</button></div>' +
          '<div class="ritual__actions"><button type="button" class="btn btn--ghost-light" data-f="close">Close</button></div>';
      }
      root.innerHTML = '<div class="ritual__inner finale__inner finale__inner--' + scene + '">' + html + '</div>';
      root.scrollTop = 0;
      var f = root.querySelector('[data-f="break"]:not([hidden]), .btn--brass');
      if (f) f.focus({ preventScroll: true });
      if (scene === 'reached') countUp(root.querySelector('.finale__num'));
    }

    function stat(label, value) { return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>'; }
    function longDate(x) {
      var d = typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? U.parseYmd(x) : new Date(x);
      return d.toLocaleDateString(TD.LOCALE, { month: 'long', day: 'numeric', year: 'numeric' });
    }

    function countUp(el) {
      if (!el || U.reducedMotion()) return;
      var to = +el.dataset.count, t0 = performance.now(), dur = 1600;
      (function frame(t) {
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = fmtNum(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1 && el.isConnected) requestAnimationFrame(frame);
      })(t0);
    }

    function onClick(e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      var f = b.dataset.f;
      if (f === 'letter' || f === 'reached' || f === 'built') { scene = f; paint(); }
      else if (f === 'close') close();
      else if (f === 'break') {
        var env = root.querySelector('.envelope');
        env.classList.add('is-breaking');
        setTimeout(function () {
          TD.state.letter.openedAt = new Date().toISOString();
          TD.save();
          paint();
        }, U.reducedMotion() ? 0 : 650);
      } else if (f === 'season') startSeason();
    }

    function startSeason() {
      var s = TD.state;
      var si = seasonInfo(s);
      var next = s.settings.goal + si.step;
      TD.confirm({
        title: 'Start Season ' + (si.number + 1) + '?',
        text: 'Season ' + si.number + ' is saved in your Book. Your goal moves to ' + fmtNum(next) + ' and you can seal a new letter. Nothing is deleted.',
        okLabel: 'Start Season ' + (si.number + 1)
      }).then(function (ok) {
        if (!ok) return;
        TD.commit(function (st) {
          var info = stats(st);
          st.seasons.push({
            number: si.number,
            startDate: si.start,
            endedAt: new Date().toISOString(),
            decisions: st.settings.goal,
            days: info.days,
            letter: st.letter ? st.letter.text : ''
          });
          st.settings.goal = next;
          st.settings.finaleShownFor = 0;
          st.letter = null;
        });
        close();
        TD.toast('Season ' + (si.number + 1) + '. The next ' + fmtNum(si.step) + ' starts now.', { actions: [{ label: 'Seal a new letter', run: function () { document.querySelector('[data-action="letter-write"]') ? document.querySelector('[data-action="letter-write"]').click() : null; } }] });
        TD.setView('record', true);
      });
    }

    // Auto-open once when the goal is reached.
    function check(v) {
      var s = TD.state;
      // Behind a PIN, the finale (letter, battles) waits until it's unlocked.
      if (v.total >= s.settings.goal && s.settings.finaleShownFor < s.settings.goal && s.onboarded && !root && !TD.isLocked()) setTimeout(open, 600);
    }
    TD.onRender(check);
    check(TD.derive());

    // ── The Book ───────────────────────────────────────────────────────
    function bookHtml() {
      var s = TD.state;
      var v = TD.derive();
      var st = stats(s);
      var name = s.settings.signature || '';
      var first = s.decisions[0], last = s.decisions[s.decisions.length - 1];
      var range = first ? longDate(first.timestamp) + ' — ' + longDate(last.timestamp) : longDate(new Date());
      var proof = I.proof(s.categories, s.decisions);
      var out = [];
      var ch = 0;
      function chapter(title, sub) { ch++; return '<section class="book__chapter"><p class="book__ch">Chapter ' + ch + '</p><h2>' + esc(title) + '</h2>' + (sub ? '<p class="book__sub">' + sub + '</p>' : ''); }

      out.push('<section class="book__cover"><div class="book__mark">' + new Array(10).join('<i></i>') + '</div>' +
        '<p class="book__eyebrow">1000 Decisions</p><h1>The Book<br>of the Grind</h1>' +
        '<p class="book__big">' + fmtNum(v.total) + '</p><p class="book__cap">decisions, one at a time</p>' +
        '<p class="book__meta">' + esc(range) + (name ? '<br>' + esc(name) : '') + (s.seasons.length ? '<br>' + s.seasons.length + ' ' + U.plural(s.seasons.length, 'season') + ' complete' : '') + '</p></section>');

      // 1. Priorities and whys
      var counts = Object.create(null);
      s.decisions.forEach(function (d) { counts[d.categoryName] = (counts[d.categoryName] || 0) + 1; });
      var maxC = Math.max.apply(null, s.categories.map(function (c) { return counts[c.name] || 0; }).concat([1]));
      out.push(chapter('What mattered, and why', 'Your priorities in the order you ranked them, with the reason you gave.') +
        '<table class="book__table"><tbody>' + s.categories.map(function (c) {
          return '<tr><td class="book__rank">#' + c.priorityRank + '</td><td><b>' + esc(c.name) + '</b>' + (c.why ? '<div class="book__why">' + esc(c.why) + '</div>' : '') + '</td>' +
            '<td class="book__barcell"><span class="book__bar"><i style="width:' + ((counts[c.name] || 0) / maxC * 100).toFixed(1) + '%;background:' + c.color + '"></i></span></td><td class="book__n">' + fmtNum(counts[c.name] || 0) + '</td></tr>';
        }).join('') + '</tbody></table></section>');

      // 2. The numbers
      var months = Object.create(null);
      s.decisions.forEach(function (d) { var k = U.ymd(new Date(d.timestamp)).slice(0, 7); months[k] = (months[k] || 0) + 1; });
      var mk = Object.keys(months).sort();
      if (mk.length) {
        // Fill quiet months so the chart shows the gaps honestly.
        var all = [], y = +mk[0].slice(0, 4), m = +mk[0].slice(5, 7), endK = mk[mk.length - 1];
        for (var guard = 0; guard < 600; guard++) {
          var key = y + '-' + (m < 10 ? '0' : '') + m;
          all.push(key);
          if (key === endK) break;
          if (++m > 12) { m = 1; y++; }
        }
        mk = all;
      }
      var maxM = Math.max.apply(null, mk.map(function (k) { return months[k] || 0; }).concat([1]));
      out.push(chapter('The numbers') +
        '<div class="book__stats">' +
        bstat(fmtNum(v.total), 'decisions') + bstat(fmtNum(v.day), 'days since Day 1') + bstat(fmtNum(st.activeDays + 0), 'days you showed up this season') + bstat(st.bestDay ? fmtNum(st.bestDay.count) : '0', 'on your best day' + (st.bestDay ? ', ' + esc(longDate(st.bestDay.date)) : '')) +
        '</div>' +
        (mk.length ? '<h3>Month by month</h3><div class="book__months">' + mk.map(function (k) {
          return '<div><span>' + new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 15).toLocaleDateString(TD.LOCALE, { month: 'short', year: '2-digit' }) + '</span><i style="height:' + ((months[k] || 0) / maxM * 100).toFixed(1) + '%"></i><b>' + (months[k] || 0) + '</b></div>';
        }).join('') + '</div>' : '') +
        (s.seasons.length ? '<h3>Seasons</h3><table class="book__table"><tbody>' + s.seasons.map(function (x) {
          return '<tr><td class="book__rank">' + x.number + '</td><td>Season ' + x.number + '</td><td>' + esc(longDate(x.startDate || x.endedAt)) + ' — ' + esc(longDate(x.endedAt)) + '</td><td class="book__n">' + fmtNum(x.days) + ' days</td></tr>';
        }).join('') + '</tbody></table>' : '') + '</section>');

      // 3. Proof
      if (proof.total) {
        out.push(chapter('Proof', 'What the decisions actually produced, in your own words.') +
          '<table class="book__table"><tbody>' + proof.rows.filter(function (r) { return r.count; }).map(function (r) {
            return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.headline) + '</td><td class="book__n">' + r.count + '</td></tr>';
          }).join('') + '</tbody></table>' +
          '<h3>Selected results</h3><ul class="book__list">' + proof.results.slice(0, 40).map(function (d) {
            return '<li><span class="book__date">' + esc(shortDate(d.timestamp)) + '</span><b>' + esc(d.result) + '</b> — ' + esc(d.text) + '</li>';
          }).join('') + '</ul></section>');
      }

      // 4. Battles
      var done = BT.closed(s.battles);
      if (s.battles.length) {
        var bs = BT.summary(s.battles, new Date());
        out.push(chapter('Battles', fmtNum(bs.fought) + ' fought · ' + fmtNum(bs.won) + ' won' + (bs.avgDays ? ' · ' + bs.avgDays + ' days on average' : '')) +
          '<ul class="book__list">' + done.concat(BT.active(s.battles)).map(function (b) {
            var st2 = b.status === 'active' ? 'still open' : BT.STATUSES[b.status].long;
            return '<li><span class="book__date">' + esc(shortDate(b.startedAt)) + '</span><b>' + esc(b.title) + '</b> · ' + esc(b.area) + ' · ' + BT.days(b, new Date()) + ' days · ' + esc(String(st2)) + (b.note ? '<div class="book__why">' + esc(b.note) + '</div>' : '') + '</li>';
          }).join('') + '</ul></section>');
      }

      // 5. Big bets
      if (s.bets.length) {
        var j = R.judgment(s.bets);
        out.push(chapter('Big bets', fmtNum(j.made) + ' made' + (j.rate !== null ? ' · ' + Math.round(j.rate * 100) + '% right so far' : '')) +
          '<ul class="book__list">' + s.bets.map(function (b) {
            var vd = R.latestVerdict(b);
            return '<li><span class="book__date">' + esc(shortDate(b.madeAt)) + '</span><b>' + esc(b.title) + '</b>' + (vd ? ' · <em>' + esc(R.VERDICTS[vd].label) + '</em>' : ' · not reviewed yet') +
              (b.why ? '<div class="book__why">Why: ' + esc(b.why) + '</div>' : '') + (b.expect ? '<div class="book__why">Expected: ' + esc(b.expect) + '</div>' : '') + '</li>';
          }).join('') + '</ul></section>');
      }

      // 6. Firsts
      if (s.firsts.length) {
        out.push(chapter('Firsts') + R.firstsByYear(s.firsts).map(function (g) {
          return '<h3>' + g.year + '</h3><ul class="book__list">' + g.items.map(function (f) {
            return '<li><span class="book__date">' + esc(shortDate(f.date)) + '</span><b>' + esc(f.title) + '</b>' + (f.note ? '<div class="book__why">' + esc(f.note) + '</div>' : '') + '</li>';
          }).join('') + '</ul>';
        }).join('') + '</section>');
      }

      // 7. Lessons
      if (s.lessons.length) {
        var lv = R.lessonsView(s.lessons);
        out.push(chapter('Lessons') +
          (lv.pinned.length ? lv.pinned.map(function (l) { return '<blockquote class="book__quote">' + esc(l.text) + '</blockquote>'; }).join('') : '') +
          lv.areas.map(function (a) { return '<h3>' + esc(a.area) + '</h3><ul class="book__list">' + a.items.map(function (l) { return '<li>' + esc(l.text) + '</li>'; }).join('') + '</ul>'; }).join('') + '</section>');
      }

      // 8. Letters
      var letters = s.seasons.filter(function (x) { return x.letter; }).map(function (x) { return { season: x.number, text: x.letter, open: true }; });
      if (s.letter) letters.push({ season: seasonInfo(s).number, text: s.letter.text, open: !!s.letter.openedAt, sealedAt: s.letter.sealedAt });
      if (letters.length) {
        out.push(chapter('Letters') + letters.map(function (l) {
          return '<h3>Season ' + l.season + '</h3>' + (l.open ? '<div class="book__letter">' + esc(l.text).replace(/\n/g, '<br>') + '</div>' : '<p class="book__sub">Still sealed. It opens at decision ' + fmtNum(s.settings.goal) + '.</p>');
        }).join('') + '</section>');
      }

      // Appendix: every decision
      var rows = [];
      var lastDay = null;
      s.decisions.forEach(function (d, i) {
        var dt = new Date(d.timestamp);
        var k = U.ymd(dt);
        if (k !== lastDay) {
          lastDay = k;
          rows.push('<li class="book__day">Day ' + U.dayNumber(s.settings.startDate, dt) + ' · ' + esc(dt.toLocaleDateString(TD.LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) + '</li>');
        }
        rows.push('<li><span class="book__num">#' + (i + 1) + '</span><span class="book__cat">' + esc(d.categoryName) + '</span><span>' + esc(d.text) + (d.result ? ' <em>→ ' + esc(d.result) + '</em>' : '') + '</span></li>');
      });
      out.push('<section class="book__chapter"><p class="book__ch">Appendix</p><h2>Every decision</h2><ol class="book__log">' + rows.join('') + '</ol></section>');
      out.push('<p class="book__end">Printed ' + esc(longDate(new Date())) + ' from 1000 Decisions.</p>');
      return out.join('');
    }
    function bstat(n, label) { return '<div><b>' + n + '</b><span>' + label + '</span></div>'; }
    function shortDate(x) {
      var d = /^\d{4}-\d{2}-\d{2}$/.test(x) ? U.parseYmd(x) : new Date(x);
      return d.toLocaleDateString(TD.LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function printBook() {
      var book = document.getElementById('book');
      if (!book) {
        book = document.createElement('div');
        book.id = 'book';
        book.className = 'book';
        document.body.appendChild(book);
      }
      book.innerHTML = bookHtml();
      document.documentElement.classList.add('is-printing-book');
      var done = function () { document.documentElement.classList.remove('is-printing-book'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(function () {
        try { window.print(); } catch (e) { TD.toast('Printing is blocked here. Open the app in your browser to print.', { tone: 'error' }); }
        setTimeout(done, 1000);
      }, 50);
    }

    // ── The poster ─────────────────────────────────────────────────────
    function posterCanvas() {
      var s = TD.state;
      var W = 1800, Hh = 2400, PAD = 140;
      var c = document.createElement('canvas');
      c.width = W; c.height = Hh;
      var ctx = c.getContext('2d');
      var UI = 'Archivo, system-ui, sans-serif';
      var DISPLAY = '"Archivo Condensed", "Arial Narrow", Archivo, sans-serif';
      ctx.fillStyle = '#0F1113';
      ctx.fillRect(0, 0, W, Hh);
      var g = ctx.createRadialGradient(W * 0.9, 0, 0, W * 0.9, 0, W);
      g.addColorStop(0, 'rgba(176,141,60,0.22)');
      g.addColorStop(1, 'rgba(176,141,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Hh);

      var si = seasonInfo(s);
      var goal = s.settings.goal;
      var reached = Math.min(s.decisions.length, goal);
      var list = s.decisions.slice(si.startDecision, Math.max(si.startDecision, reached));
      var n = goal - si.startDecision;
      var color = Object.create(null);
      s.categories.forEach(function (c2) { color[c2.name] = c2.color; });

      ctx.fillStyle = '#C9A45A';
      ctx.font = '700 34px ' + UI;
      ctx.fillText(spaced('1000 DECISIONS · SEASON ' + si.number), PAD, PAD + 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 250px ' + DISPLAY;
      ctx.fillText(fmtNum(list.length), PAD - 8, PAD + 270);
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = '600 40px ' + UI;
      var first = list[0], last = list[list.length - 1];
      var line = first ? shortDate(first.timestamp) + '  —  ' + shortDate(last.timestamp) + '   ·   ' + fmtNum(U.dayNumber(si.start, new Date(last.timestamp))) + ' days' : 'Day 1';
      ctx.fillText(line, PAD, PAD + 350);

      // The grid: one square per decision, in order.
      var cols = n <= 1000 ? 40 : Math.ceil(Math.sqrt(n * 1.6));
      var rows = Math.ceil(n / cols);
      var gridW = W - PAD * 2;
      var gap = cols > 60 ? 2 : 6;
      var cell = (gridW - gap * (cols - 1)) / cols;
      var top = PAD + 440;
      var maxGridH = Hh - top - 520;
      if (rows * (cell + gap) > maxGridH) { cell = (maxGridH / rows) - gap; }
      for (var i = 0; i < n; i++) {
        var x = PAD + (i % cols) * (cell + gap);
        var y = top + Math.floor(i / cols) * (cell + gap);
        var d = list[i];
        ctx.fillStyle = d ? (color[d.categoryName] || '#8E949B') : 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, cell, cell);
      }
      var gy = top + rows * (cell + gap) + 70;

      // Legend
      var counts = Object.create(null);
      list.forEach(function (d2) { counts[d2.categoryName] = (counts[d2.categoryName] || 0) + 1; });
      var lx = PAD, ly = gy;
      ctx.font = '700 36px ' + UI;
      s.categories.filter(function (c2) { return counts[c2.name]; }).forEach(function (c2) {
        var label = c2.name + '  ' + fmtNum(counts[c2.name]);
        var w = ctx.measureText(label).width + 90;
        if (lx + w > W - PAD) { lx = PAD; ly += 66; }
        ctx.fillStyle = c2.color;
        ctx.fillRect(lx, ly - 28, 30, 30);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(label, lx + 46, ly);
        lx += w;
      });

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 32px ' + UI;
      ctx.fillText('One square = one decision. In the order they were made.', PAD, Hh - PAD - 60);
      if (s.settings.signature) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 40px ' + UI;
        ctx.fillText(s.settings.signature, PAD, Hh - PAD);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#C9A45A';
      ctx.font = '900 64px ' + DISPLAY;
      ctx.fillText(fmtNum(n), W - PAD, Hh - PAD);
      ctx.textAlign = 'left';
      return c;
    }
    function spaced(t) { return t.split('').join(String.fromCharCode(8202)); }

    function savePoster() {
      var fonts = window.TDCard && window.TDCard.ensureFonts ? window.TDCard.ensureFonts() : Promise.resolve();
      fonts.then(function () {
        posterCanvas().toBlob(function (blob) {
          TD.downloadBlob(blob, '1000-decisions-season-' + seasonInfo().number + '.png').then(function (ok) { if (ok !== false) TD.toast('Poster saved', { sub: '1800 × 2400 PNG, ready to print' }); });
        }, 'image/png');
      });
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      var a = b.dataset.action;
      if ((a === 'finale-open' || a === 'book-print') && TD.isLocked()) { TD.toast('Unlock Battles and Record with your PIN first.'); return; }
      if (a === 'finale-open') open();
      else if (a === 'book-print') printBook();
      else if (a === 'poster-save') savePoster();
    });

    window.TDFinale = { open: open, stats: stats, bookHtml: bookHtml, printBook: printBook, posterCanvas: posterCanvas, seasonInfo: seasonInfo };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
