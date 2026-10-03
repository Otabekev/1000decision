/*
 * 1000 Decisions — Day 1 ritual and the sealed letter.
 *
 * First run: a short guided setup instead of an empty page.
 *   Welcome → priorities (in order) → a why for each → sealed letter
 *   → first decision → "Day 1."
 * The letter can only be read once the goal (decision 1000) is reached.
 */
(function () {
  'use strict';

  function boot() {
    var TD = window.TD;
    var U = TD.util;
    var $ = U.$, $$ = U.$$, esc = U.esc;

    var WHY_HINTS = [
      [/gym|train|fit|workout|sport|run|body/i, 'so I’m still strong at 60'],
      [/money|financ|spend|save|budget|wealth/i, 'so I never depend on anyone'],
      [/work|deep|focus|business|career|study|learn|read/i, 'so my work speaks for itself'],
      [/family|kid|son|daughter|wife|partner|friend|love/i, 'so they remember me as present'],
      [/health|sleep|food|diet|eat/i, 'so I have energy for what matters'],
      [/peace|calm|mind|mental|stress/i, 'so I respond instead of react']
    ];
    function whyHint(name) {
      for (var i = 0; i < WHY_HINTS.length; i++) if (WHY_HINTS[i][0].test(name)) return 'e.g. ' + WHY_HINTS[i][1];
      return 'e.g. so I become the man I said I would be';
    }

    // ── The ritual ─────────────────────────────────────────────────────
    var STEPS = ['welcome', 'priorities', 'whys', 'letter', 'first', 'done'];
    var draft = { step: 0, priorities: [], whys: {}, letter: '', first: { cat: null, text: '' } };
    var root = null;

    function open() {
      if (root) return;
      root = document.createElement('div');
      root.className = 'ritual td-overlay';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Set up 1000 Decisions');
      document.body.appendChild(root);
      document.documentElement.classList.add('is-locked');
      root.addEventListener('click', onClick);
      root.addEventListener('keydown', onKey);
      paint();
    }

    function close() {
      if (!root) return;
      root.classList.add('is-leaving');
      var r = root;
      root = null;
      setTimeout(function () { r.remove(); if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked'); }, U.reducedMotion() ? 0 : 350);
    }

    function progress() {
      var n = draft.step;
      if (n === 0 || n === STEPS.length - 1) return '';
      return '<div class="ritual__progress" aria-label="Step ' + n + ' of 4">' + [1, 2, 3, 4].map(function (i) {
        return '<i class="' + (i < n ? 'done' : i === n ? 'now' : '') + '"></i>';
      }).join('') + '<span>Step ' + n + ' of 4</span></div>';
    }

    function paint() {
      var step = STEPS[draft.step];
      var html = '';
      if (step === 'welcome') {
        html = '<div class="ritual__mark" aria-hidden="true">' + new Array(10).join('<i></i>') + '</div>' +
          '<p class="ritual__eyebrow">1000 Decisions</p>' +
          '<h1 class="ritual__title">One decision at a time.<br>A thousand of them.</h1>' +
          '<p class="ritual__lede">No goals to fail, no streaks to break. You log the small acts of discipline you actually make, and you watch what they turn you into.</p>' +
          '<p class="ritual__lede">The next three minutes are Day 1.</p>' +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="next">Begin</button>' +
          '<button type="button" class="btn btn--ghost-light" data-r="skip">I’ll set it up myself</button></div>';
      } else if (step === 'priorities') {
        var used = draft.priorities.map(function (p) { return p.toLowerCase(); });
        html = progress() +
          '<h2 class="ritual__title ritual__title--sm">What are you taking control of?</h2>' +
          '<p class="ritual__lede">Pick the areas of your life where you want better decisions, <b>most important first</b>. Your #1 should get the biggest share of your attention.</p>' +
          '<div class="ritual__chips">' + TD.SUGGESTED.concat(['Discipline', 'Business']).filter(function (x, i, a) { return a.indexOf(x) === i; }).map(function (name) {
            var idx = used.indexOf(name.toLowerCase());
            return '<button type="button" class="r-chip" data-r="pick" data-name="' + esc(name) + '" aria-pressed="' + (idx !== -1) + '">' + (idx !== -1 ? '<b>' + (idx + 1) + '</b>' : '') + esc(name) + '</button>';
          }).join('') + '</div>' +
          '<form class="ritual__add" data-r-form="custom"><input class="input" name="custom" maxlength="24" placeholder="Or type your own" autocomplete="off"><button class="btn btn--ghost-light" type="submit">Add</button></form>' +
          (draft.priorities.length ? '<ol class="ritual__order">' + draft.priorities.map(function (p, i) {
            return '<li><span class="ritual__rank">#' + (i + 1) + '</span><span class="ritual__name">' + esc(p) + '</span>' +
              '<button type="button" class="r-mini" data-r="up" data-i="' + i + '" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
              '<button type="button" class="r-mini" data-r="down" data-i="' + i + '" aria-label="Move down"' + (i === draft.priorities.length - 1 ? ' disabled' : '') + '>↓</button>' +
              '<button type="button" class="r-mini" data-r="remove" data-i="' + i + '" aria-label="Remove">×</button></li>';
          }).join('') + '</ol>' : '') +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="next"' + (draft.priorities.length ? '' : ' disabled') + '>Continue</button>' +
          '<span class="ritual__hint">' + (draft.priorities.length ? draft.priorities.length + ' ' + U.plural(draft.priorities.length, 'priority', 'priorities') + '. 3 to 5 works best.' : 'Pick at least one.') + '</span></div>';
      } else if (step === 'whys') {
        html = progress() +
          '<h2 class="ritual__title ritual__title--sm">Why does each one matter?</h2>' +
          '<p class="ritual__lede">One honest line each. You’ll only see it when that area starts falling behind, which is exactly when you need it.</p>' +
          '<div class="ritual__whys">' + draft.priorities.map(function (p, i) {
            return '<label class="ritual__why"><span>#' + (i + 1) + ' ' + esc(p) + '</span><input class="input" data-why="' + esc(p) + '" maxlength="80" placeholder="' + esc(whyHint(p)) + '" value="' + esc(draft.whys[p] || '') + '"></label>';
          }).join('') + '</div>' +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="next">Continue</button><button type="button" class="btn btn--ghost-light" data-r="back">Back</button></div>';
      } else if (step === 'letter') {
        html = progress() +
          '<h2 class="ritual__title ritual__title--sm">Write to the man who reaches 1000.</h2>' +
          '<p class="ritual__lede">Where are you right now? What are you tired of? What do you hope he did? It will be <b>sealed</b>, and it only opens when you log decision 1000.</p>' +
          '<textarea class="input ritual__letter" data-letter maxlength="8000" placeholder="Today I’m starting because…">' + esc(draft.letter) + '</textarea>' +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="seal">Seal the letter</button><button type="button" class="btn btn--ghost-light" data-r="next">Write it later</button><button type="button" class="btn btn--ghost-light" data-r="back">Back</button></div>';
      } else if (step === 'first') {
        if (!draft.first.cat) draft.first.cat = draft.priorities[0];
        html = progress() +
          '<h2 class="ritual__title ritual__title--sm">Your first decision.</h2>' +
          '<p class="ritual__lede">Something you already chose today, however small. Skipped the snooze, took the stairs, closed the app. It counts.</p>' +
          '<div class="ritual__chips">' + draft.priorities.map(function (p) {
            return '<button type="button" class="r-chip" data-r="firstcat" data-name="' + esc(p) + '" aria-pressed="' + (draft.first.cat === p) + '">' + esc(p) + '</button>';
          }).join('') + '</div>' +
          '<input class="input" data-first maxlength="140" placeholder="What did you do?" value="' + esc(draft.first.text) + '" autocomplete="off">' +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="finish">Log it and start</button><button type="button" class="btn btn--ghost-light" data-r="finish-skip">Not yet</button></div>';
      } else {
        var n = TD.state.decisions.length;
        var left = Math.max(0, TD.state.settings.goal - n);
        html = '<div class="ritual__grid" aria-hidden="true">' + Array.from({ length: 100 }, function (_, i) { return '<i class="' + (i < Math.min(n, 100) ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
          '<p class="ritual__eyebrow">' + new Date().toLocaleDateString(TD.LOCALE, { weekday: 'long', month: 'long', day: 'numeric' }) + '</p>' +
          '<h1 class="ritual__title ritual__title--xl">Day ' + U.fmtNum(TD.derive().day) + '.</h1>' +
          '<p class="ritual__lede">' + (n === 1 ? 'Decision #1 is logged. ' : '') + draft.priorities.length + ' ' + U.plural(draft.priorities.length, 'priority', 'priorities') + ' ranked' + (draft.letter.trim() ? ', a letter sealed' : '') + '. ' + U.fmtNum(left) + ' to go. You don’t need a perfect day, just the next decision.</p>' +
          '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-r="enter">Enter</button><button type="button" class="btn btn--ghost-light" data-r="enter-playbook">Read the Playbook first · 3 min</button></div>';
      }
      root.innerHTML = '<div class="ritual__inner ritual__inner--' + step + '">' + html + '</div>';
      var focus = root.querySelector('[data-letter], [data-first], [data-why], [name="custom"], [data-r="next"], [data-r="enter"]');
      if (focus) focus.focus({ preventScroll: true });
    }

    function collect() {
      if (!root) return;
      $$('[data-why]', root).forEach(function (el) { draft.whys[el.dataset.why] = el.value.trim(); });
      var l = $('[data-letter]', root);
      if (l) draft.letter = l.value;
      var f = $('[data-first]', root);
      if (f) draft.first.text = f.value;
    }

    function go(delta) {
      collect();
      draft.step = Math.max(0, Math.min(STEPS.length - 1, draft.step + delta));
      // A letter already sealed stays sealed; re-running setup doesn't replace it.
      if (STEPS[draft.step] === 'letter' && TD.state.letter && !TD.state.letter.openedAt) draft.step += delta > 0 ? 1 : -1;
      paint();
    }

    function addPriority(name) {
      name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
      if (!name) return;
      var i = draft.priorities.map(function (p) { return p.toLowerCase(); }).indexOf(name.toLowerCase());
      if (i !== -1) draft.priorities.splice(i, 1);
      else if (draft.priorities.length < 8) draft.priorities.push(name);
      paint();
    }

    function finish(withDecision) {
      collect();
      TD.commit(function (s) {
        var hadData = s.decisions.length > 0;
        draft.priorities.forEach(function (name) {
          var cat = TD.findCategory(s.categories, name) || TD.addCategory(name);
          if (draft.whys[name]) cat.why = draft.whys[name].slice(0, 80);
        });
        // The ritual's order is the priority order; anything else keeps its place after.
        var order = draft.priorities.map(function (p) { return p.toLowerCase(); });
        var rank = function (c) { var i = order.indexOf(c.name.toLowerCase()); return i === -1 ? 100 + c.priorityRank : i; };
        s.categories.sort(function (a, b) { return rank(a) - rank(b); });
        s.categories.forEach(function (c, i) { c.priorityRank = i + 1; });
        if (draft.letter.trim()) s.letter = { text: draft.letter.trim(), sealedAt: new Date().toISOString(), openedAt: null, season: (s.seasons.length || 0) + 1 };
        if (!hadData) s.settings.startDate = U.ymd(new Date());
        if (withDecision && draft.first.text.trim() && draft.first.cat) {
          var c = TD.findCategory(s.categories, draft.first.cat);
          s.decisions.push({ id: U.uid(), categoryName: c.name, text: draft.first.text.trim().slice(0, 140), result: '', timestamp: new Date().toISOString() });
        }
        s.onboarded = true;
      });
      draft.step = STEPS.length - 1;
      paint();
    }

    function onClick(e) {
      var b = e.target.closest('[data-r]');
      if (!b || b.disabled) return;
      var r = b.dataset.r;
      if (r === 'next') go(1);
      else if (r === 'back') go(-1);
      else if (r === 'skip') {
        TD.commit(function (s) { s.onboarded = true; });
        close();
      } else if (r === 'pick') addPriority(b.dataset.name);
      else if (r === 'up' || r === 'down') {
        var i = +b.dataset.i, j = i + (r === 'up' ? -1 : 1);
        var t = draft.priorities[i];
        draft.priorities[i] = draft.priorities[j];
        draft.priorities[j] = t;
        paint();
      } else if (r === 'remove') {
        draft.priorities.splice(+b.dataset.i, 1);
        paint();
      } else if (r === 'seal') {
        collect();
        if (!draft.letter.trim()) { var ta = $('[data-letter]', root); ta.classList.add('is-invalid'); ta.focus(); return; }
        root.querySelector('.ritual__inner').classList.add('is-sealing');
        setTimeout(function () { go(1); }, U.reducedMotion() ? 0 : 700);
      } else if (r === 'firstcat') {
        collect();
        draft.first.cat = b.dataset.name;
        paint();
      } else if (r === 'finish') {
        collect();
        if (!draft.first.text.trim()) { var inp = $('[data-first]', root); inp.classList.add('is-invalid'); inp.focus(); return; }
        finish(true);
      } else if (r === 'finish-skip') finish(false);
      else if (r === 'enter') close();
      else if (r === 'enter-playbook') { close(); if (window.TDPlaybook) window.TDPlaybook.open(); }
    }

    function onKey(e) {
      if (e.key === 'Escape' && STEPS[draft.step] === 'done') close();
      if (e.key === 'Enter' && e.target.matches('[data-first]')) { e.preventDefault(); root.querySelector('[data-r="finish"]').click(); }
    }

    document.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-r-form="custom"]')) return;
      e.preventDefault();
      var input = e.target.elements.namedItem('custom');
      addPriority(input.value);
    });

    if (!TD.state.onboarded) open();

    // ── Sealed letter card in the Record tab ───────────────────────────
    function letterCard(v) {
      var host = $('#record-body');
      if (!host) return;
      var card = $('#letter-card');
      if (!card) {
        card = document.createElement('section');
        card.id = 'letter-card';
        card.className = 'panel letter';
        host.insertBefore(card, host.children[1] || null);
      }
      var s = TD.state;
      var goal = s.settings.goal;
      var L = s.letter;
      if (!L) {
        card.innerHTML = '<div class="letter__seal letter__seal--open" aria-hidden="true">' + U.fmtNum(goal) + '</div><div class="letter__body"><p class="eyebrow">Sealed letter</p>' +
          '<h2 class="panel__title">Write to the man who reaches ' + U.fmtNum(goal) + '</h2>' +
          '<p class="panel__lede">It stays sealed until you log decision ' + U.fmtNum(goal) + '. Then it opens, and you get to meet who you were today.</p>' +
          '<button type="button" class="btn btn--primary" data-action="letter-write">Write the letter</button></div>';
      } else if (!L.openedAt) {
        var left = Math.max(0, goal - v.total);
        card.innerHTML = '<div class="letter__seal" aria-hidden="true">' + U.fmtNum(goal) + '</div><div class="letter__body"><p class="eyebrow">Sealed letter</p>' +
          '<h2 class="panel__title">Sealed on ' + esc(U.fmtDate(L.sealedAt)) + '</h2>' +
          '<p class="panel__lede">' + (left ? 'Opens at decision ' + U.fmtNum(goal) + '. <b>' + U.fmtNum(left) + ' to go.</b>' : 'Ready to open.') + '</p>' +
          (left ? '<div class="letter__bar"><i style="width:' + Math.min(100, (v.total / goal) * 100).toFixed(1) + '%"></i></div>' : '<button type="button" class="btn btn--brass" data-action="finale-open">Open it</button>') +
          '</div>';
      } else {
        card.innerHTML = '<div class="letter__seal letter__seal--broken" aria-hidden="true">' + U.fmtNum(goal) + '</div><div class="letter__body"><p class="eyebrow">Letter · opened ' + esc(U.fmtDate(L.openedAt)) + '</p>' +
          '<div class="letter__text">' + esc(L.text).replace(/\n/g, '<br>') + '</div>' +
          '<p class="letter__sign">Written ' + esc(U.fmtDate(L.sealedAt)) + '</p></div>';
      }
    }
    TD.onRender(letterCard);
    letterCard(TD.derive());

    function openLetterEditor() {
      TD.openSheet(function (body) {
        body.innerHTML = TD.sheetHead('Sealed letter', 'Opens at decision ' + U.fmtNum(TD.state.settings.goal) + '. You can’t read it before then.') +
          '<form class="add-form" novalidate><label class="field"><span class="field__label">To the man who reaches ' + U.fmtNum(TD.state.settings.goal) + '</span>' +
          '<textarea class="input ritual__letter ritual__letter--light" name="letter" maxlength="8000" placeholder="Today I’m starting because…"></textarea></label>' +
          '<button class="btn btn--primary btn--lg btn--block" type="submit">Seal it</button></form>';
        $('form', body).addEventListener('submit', function (e) {
          e.preventDefault();
          var text = U.fld(e.target, 'letter').value.trim();
          if (!text) return;
          TD.commit(function (s) { s.letter = { text: text, sealedAt: new Date().toISOString(), openedAt: null, season: (s.seasons.length || 0) + 1 }; });
          TD.closeSheet();
          TD.toast('Sealed. See you at ' + U.fmtNum(TD.state.settings.goal) + '.');
        });
      }, { className: 'sheet--battle', label: 'Sealed letter', focus: function () { $('textarea', document.getElementById('sheet-body')).focus(); } });
    }

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action="letter-write"]');
      if (b) openLetterEditor();
      if (e.target.closest('[data-action="ritual-open"]')) { draft = { step: 0, priorities: TD.state.categories.map(function (c) { return c.name; }), whys: {}, letter: '', first: { cat: null, text: '' } }; open(); }
    });

    window.TDOnboarding = { open: open };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
