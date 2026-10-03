/*
 * 1000 Decisions — the Playbook and the Hard moment.
 *
 * Playbook: the method in short chapters, each linked to the part of the
 * app that does it. Open with the book icon in the top bar, or "?".
 *
 * Hard moment (H): for the minute you're about to break. It shows your own
 * words back to you (the why of the priority falling furthest behind, a
 * voice note from a good day, a lesson you pinned) and asks for one thing:
 * make the next decision. Each use is counted, nothing else is stored.
 */
(function () {
  'use strict';

  var CHAPTERS = [
    {
      id: 'why-1000', title: 'Why a thousand',
      body: [
        'Big changes are made of small decisions that nobody sees: the snooze you skipped, the purchase you didn’t make, the hour you protected. They feel too small to matter, so most people never count them, and never notice they’re winning.',
        'A thousand is far enough to change who you are and close enough to finish. At three a day it takes about a year. You don’t need a perfect day. You need the next decision.'
      ]
    },
    {
      id: 'what-counts', title: 'What counts',
      body: [
        'A decision counts when an easier option was right there and you chose the better one. Trained instead of scrolling. Cooked instead of ordering. Closed the laptop and went to your kid.',
        'It doesn’t count if it just happened to you, or if it cost you nothing. Be honest. The number only means something if every square was earned.'
      ],
      tip: 'Log it right after you make it. Ten seconds, while it still feels like a win.'
    },
    {
      id: 'priorities', title: 'Rank what matters',
      body: [
        'Your priorities are ranked, and the order is the point. Your #1 should get the biggest share of your decisions, your #2 the next, and so on. The bars compare the last 7 days against that share.',
        '<b>Green</b> means on track. <b>Amber</b> means one area is taking more than its share. <b>Red</b> means a priority is falling behind, and it deepens the further it falls. <b>Grey</b> means no decisions in 7 days.'
      ],
      links: [['view:decisions#priorities', 'Reorder priorities']]
    },
    {
      id: 'why', title: 'Write the why',
      body: [
        'Give each priority one honest line: who it’s for, what it protects. “So I’m still strong at 60.” “So they remember me as present.”',
        'You won’t see it every day. It shows up when that area starts falling behind, which is exactly when you need it. Concrete beats inspiring: a person, a number, a place.'
      ],
      links: [['view:decisions#priorities', 'Edit a priority']]
    },
    {
      id: 'logging', title: 'Ten-second logging',
      body: [
        'Press <kbd>N</kbd> anywhere. Pick the area, type what you did, press Enter. If there was a result, type it and press Enter again. That’s it.',
        'Don’t save decisions up for the evening. Memory makes them smaller. The moment you log it is part of the reward.'
      ],
      links: [['action:add', 'Log one now']]
    },
    {
      id: 'proof', title: 'Results are proof',
      body: [
        'The result field is optional, but it’s where the value shows. Write it plainly: “Saved $40”, “Got 90 minutes back”, “Slept deeper”.',
        'Money and time are added up automatically on the Proof wall. On a bad day, that wall is a better argument than any motivation.'
      ],
      links: [['view:decisions#proof', 'See the Proof wall']]
    },
    {
      id: 'quiet', title: 'Quiet days are data',
      body: [
        'There are no streaks to break here. A quiet day isn’t a failure, it’s information. After two weeks the app shows when you go quiet: which days, which hours, which areas.',
        'If it asks “What pulled you away?”, tap one answer. That’s all. Over time you’ll see the real enemy, and it’s rarely the one you’d guess.'
      ],
      links: [['view:decisions#patterns', 'See your patterns']]
    },
    {
      id: 'hard-moment', title: 'The hard moment',
      body: [
        'Every slide starts in a single minute: the craving, the scroll, the “just this once”. That minute is the only one that matters.',
        'Press <kbd>H</kbd> or the Hard moment button. You’ll see your own words, not a quote from a stranger: the why of the area you’re neglecting most, a voice note you recorded on a good day, a lesson you pinned. Then one ask: make the next decision.'
      ],
      links: [['action:hard-moment', 'Try it now']]
    },
    {
      id: 'battles', title: 'Fight on paper',
      body: [
        'A battle is anything hard you’re going through: a breakup, a debt, an injury, a slump. Name it, rate how heavy it feels, and write the next small step. No dates to pick, no plans to fill.',
        'Every two weeks the app checks in. When it’s over, mark it won, passed or accepted, and note what helped. Next time something similar hits, it shows you: you’ve been here before, and this is what worked.'
      ],
      links: [['view:battles', 'Open Battles']]
    },
    {
      id: 'bets', title: 'Big bets',
      body: [
        'Quitting, moving, hiring, investing, ending something: write it down before you know how it turns out. Why you did it, what you expect, how sure you are.',
        'At 3, 6 and 12 months the app brings it back for an honest verdict. You’ll learn whether your confidence means anything, which is worth more than any single call.'
      ],
      links: [['view:record', 'Open the Record']]
    },
    {
      id: 'record', title: 'Firsts, lessons, voice',
      body: [
        '<b>Firsts</b> are the milestones you’ll forget you hit: first $10k month, first marathon, first time you said no to your boss.',
        '<b>Lessons</b> are short and earned. Pin the ten that matter most. <b>Voice notes</b> are for the nights you need to hear yourself. Record one on a good day, tag it “Good day”, and the Hard moment will play it back when you need it.'
      ],
      links: [['action:voice-new', 'Record a voice note']]
    },
    {
      id: 'finish', title: 'The finish line',
      body: [
        'On Day 1 you sealed a letter to the man who reaches 1000. It stays sealed until you get there. Then it opens, and you meet who you were when you started.',
        'You’ll get the Book of the Grind, every decision in print, and a poster of all thousand squares. Then Season 2, if you want it. The app is built to end, which is why it works.'
      ],
      links: [['view:record', 'See your letter']]
    },
    {
      id: 'safety', title: 'Keep it safe',
      body: [
        'Everything stays on this computer. No account, no cloud. That’s private, and it means backups are your job, so the app does most of it for you.',
        'A snapshot is saved every day, with one-click restore. For a copy that survives a broken laptop, pick a backup folder in Settings (one in Dropbox, iCloud or OneDrive is ideal), or export a file now and then. Battles and Record can sit behind a PIN.'
      ],
      links: [['view:decisions#settings', 'Open Settings']]
    }
  ];

  function boot() {
    var TD = window.TD;
    var U = TD.util;
    var $ = U.$, esc = U.esc, fmtNum = U.fmtNum;
    var R = window.TDRecord, BT = window.TDBattles;

    // ── Playbook ───────────────────────────────────────────────────────
    var pb = null;
    var current = 0;

    function openPlaybook(id) {
      var idx = Math.max(0, CHAPTERS.findIndex(function (c) { return c.id === id; }));
      if (!pb) {
        pb = document.createElement('div');
        pb.className = 'playbook td-overlay';
        pb.setAttribute('role', 'dialog');
        pb.setAttribute('aria-modal', 'true');
        pb.setAttribute('aria-label', 'The Playbook');
        document.body.appendChild(pb);
        document.documentElement.classList.add('is-locked');
        pb.addEventListener('click', onPbClick);
        pb.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') closePlaybook();
          if (e.target.closest('input, textarea')) return;
          if (e.key === 'ArrowRight' && current < CHAPTERS.length - 1) show(current + 1);
          if (e.key === 'ArrowLeft' && current > 0) show(current - 1);
        });
        pb.innerHTML = '<div class="playbook__frame">' +
          '<aside class="playbook__nav"><div class="playbook__brand"><p class="eyebrow">1000 Decisions</p><h2 class="panel__title">The Playbook</h2></div>' +
          '<ol>' + CHAPTERS.map(function (c, i) { return '<li><button type="button" data-ch="' + i + '"><span>' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span>' + esc(c.title) + '</button></li>'; }).join('') + '</ol></aside>' +
          '<article class="playbook__page" tabindex="-1"></article>' +
          '<button type="button" class="icon-btn playbook__close" data-pb="close" aria-label="Close the Playbook">' + TD.icon('close') + '</button></div>';
      }
      show(idx);
    }

    function show(i) {
      current = i;
      var c = CHAPTERS[i];
      var page = pb.querySelector('.playbook__page');
      page.innerHTML = '<p class="eyebrow">Chapter ' + (i + 1) + ' of ' + CHAPTERS.length + '</p>' +
        '<h1 class="playbook__title">' + esc(c.title) + '</h1>' +
        c.body.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
        (c.tip ? '<p class="playbook__tip">' + c.tip + '</p>' : '') +
        (c.links ? '<div class="playbook__links">' + c.links.map(function (l) { return '<button type="button" class="btn btn--primary" data-go="' + l[0] + '">' + esc(l[1]) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="playbook__pager">' +
        (i > 0 ? '<button type="button" class="btn btn--soft" data-ch="' + (i - 1) + '">← ' + esc(CHAPTERS[i - 1].title) + '</button>' : '<span></span>') +
        (i < CHAPTERS.length - 1 ? '<button type="button" class="btn btn--soft" data-ch="' + (i + 1) + '">' + esc(CHAPTERS[i + 1].title) + ' →</button>' : '<button type="button" class="btn btn--soft" data-pb="close">Close</button>') +
        '</div>';
      U.$$('.playbook__nav [data-ch]', pb).forEach(function (b) { b.setAttribute('aria-current', String(+b.dataset.ch === i)); });
      page.scrollTop = 0;
      page.focus({ preventScroll: true });
    }

    function closePlaybook() {
      if (!pb) return;
      var p = pb;
      pb = null;
      p.remove();
      if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked');
    }

    function onPbClick(e) {
      var ch = e.target.closest('[data-ch]');
      if (ch) return show(+ch.dataset.ch);
      if (e.target.closest('[data-pb="close"]')) return closePlaybook();
      var go = e.target.closest('[data-go]');
      if (!go) return;
      e.stopPropagation();
      var target = go.dataset.go;
      closePlaybook();
      if (target.indexOf('action:') === 0) {
        var a = target.slice(7);
        if (a === 'hard-moment') return openHard();
        var btn = document.createElement('button');
        btn.dataset.action = a;
        btn.hidden = true;
        document.body.appendChild(btn);
        btn.click();
        btn.remove();
      } else {
        var parts = target.slice(5).split('#');
        TD.setView(parts[0], true);
        if (parts[1]) {
          var el = document.getElementById(parts[1]);
          if (el) {
            if (el.tagName === 'DETAILS' || el.querySelector('details')) (el.tagName === 'DETAILS' ? el : el.querySelector('details')).open = true;
            setTimeout(function () { el.scrollIntoView({ behavior: U.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); }, 60);
          }
        }
      }
    }

    // ── Hard moment ────────────────────────────────────────────────────
    var hm = null;

    function pickWhy() {
      var s = TD.state;
      var v = TD.derive();
      var withWhy = s.categories.filter(function (c) { return c.why; });
      if (!withWhy.length) return null;
      // The priority falling furthest behind, else your #1.
      var ranked = withWhy.map(function (c) { return { c: c, h: v.health.byName[c.name] }; }).sort(function (a, b) {
        var sa = a.h && a.h.status === 'neglected' ? 2 + (a.h.severity || 0) : a.h && a.h.status === 'idle' ? 1 : 0;
        var sb = b.h && b.h.status === 'neglected' ? 2 + (b.h.severity || 0) : b.h && b.h.status === 'idle' ? 1 : 0;
        return sb - sa || a.c.priorityRank - b.c.priorityRank;
      });
      var top = ranked[0];
      return { cat: top.c, behind: !!(top.h && (top.h.status === 'neglected' || top.h.status === 'idle')) };
    }

    function pickRandom(list) { return list.length ? list[Math.floor(Math.random() * list.length)] : null; }

    function openHard() {
      if (hm) return;
      if (document.getElementById('sheet').open) TD.closeSheet();
      var s = TD.state;
      var hidden = TD.hiddenNow();
      var why = pickWhy();
      var voice = hidden ? null : pickRandom(s.voice.filter(function (n) { return n.tag === 'good'; })) || null;
      var lesson = hidden ? null : pickRandom(s.lessons.filter(function (l) { return l.pinned; })) || pickRandom(s.lessons);
      var won = hidden ? 0 : BT.summary(s.battles, new Date()).won;
      var n = s.decisions.length + 1;
      var past = s.hardMoments.length;
      var held = s.hardMoments.filter(function (h) { return h.outcome === 'logged'; }).length;

      hm = document.createElement('div');
      hm.className = 'hard td-overlay';
      hm.setAttribute('role', 'dialog');
      hm.setAttribute('aria-modal', 'true');
      hm.setAttribute('aria-label', 'Hard moment');
      var cards = [];
      if (why) cards.push('<div class="hard__card hard__card--why"><p class="hard__label">' + (why.behind ? esc(why.cat.name) + ' is the one slipping' : 'Your #' + why.cat.priorityRank + ', ' + esc(why.cat.name)) + '</p><p class="hard__quote">“' + esc(why.cat.why) + '”</p><p class="hard__sub">You wrote that. You meant it.</p></div>');
      if (voice) cards.push('<div class="hard__card"><p class="hard__label">From a good day · ' + esc(U.fmtDate(voice.at)) + '</p><button type="button" class="hard__play" data-hm="play" data-id="' + esc(voice.id) + '">▶</button><b class="hard__voice">' + esc(voice.title || 'Voice note') + '</b><p class="hard__sub">Listen to the man who had it together. He’s still you.</p></div>');
      if (lesson) cards.push('<div class="hard__card"><p class="hard__label">A lesson you paid for</p><p class="hard__quote hard__quote--sm">' + esc(lesson.text) + '</p></div>');
      if (won) cards.push('<div class="hard__card"><p class="hard__label">Track record</p><p class="hard__quote hard__quote--sm">You’ve won ' + won + ' ' + U.plural(won, 'battle') + ' already. This minute is smaller than those.</p></div>');
      if (!cards.length) cards.push('<div class="hard__card"><p class="hard__label">Tip</p><p class="hard__quote hard__quote--sm">Give your priorities a why, pin a lesson, record a voice note on a good day. Next time, this screen will show them to you.</p></div>');

      hm.innerHTML = '<div class="hard__inner">' +
        '<p class="ritual__eyebrow">Hard moment</p>' +
        '<h1 class="ritual__title ritual__title--sm">Stop. Breathe out slowly.<br>This minute decides it.</h1>' +
        '<div class="hard__breath" aria-hidden="true"><i></i></div>' +
        '<div class="hard__cards">' + cards.join('') + '</div>' +
        '<div class="hard__ask"><p>You don’t have to win the day. Just make the next one.</p>' +
        '<div class="ritual__actions"><button type="button" class="btn btn--brass btn--lg" data-hm="log">Make it decision #' + fmtNum(n) + '</button>' +
        '<button type="button" class="btn btn--ghost-light" data-hm="close">I’m OK now</button></div></div>' +
        (past ? '<p class="ritual__hint hard__count">Hard moments faced: ' + fmtNum(past) + '. You logged a decision after ' + fmtNum(held) + ' of them.</p>' : '') +
        '</div>';
      document.body.appendChild(hm);
      document.documentElement.classList.add('is-locked');
      hm.addEventListener('click', function (e) {
        var b = e.target.closest('[data-hm]');
        if (!b) return;
        if (b.dataset.hm === 'play') TD.playVoice(b.dataset.id, b);
        else if (b.dataset.hm === 'log') { closeHard('logged'); TD.openAdd(why && why.behind ? { categoryName: why.cat.name } : {}); }
        else closeHard('closed');
      });
      hm.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeHard('closed'); });
      var f = hm.querySelector('[data-hm="log"]');
      if (f) f.focus({ preventScroll: true });
    }

    function closeHard(outcome) {
      if (!hm) return;
      var h = hm;
      hm = null;
      h.remove();
      var playing = h.querySelector('.hard__play');
      if (playing && playing.textContent === '■') playing.click();
      if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked');
      TD.commit(function (s) { s.hardMoments.push({ at: new Date().toISOString(), outcome: outcome }); });
    }

    // ── Wiring ─────────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'playbook') openPlaybook(b.dataset.chapter);
      else if (b.dataset.action === 'hard-moment') openHard();
    });

    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('.td-overlay') || document.getElementById('sheet').open || document.getElementById('confirm').open) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.key === 'h' || e.key === 'H') { e.preventDefault(); openHard(); }
      else if (e.key === '?') { e.preventDefault(); openPlaybook(); }
    });

    window.TDPlaybook = { open: openPlaybook, hard: openHard, chapters: CHAPTERS };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
