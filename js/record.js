/*
 * 1000 Decisions — Record (pure, no DOM): Big Bets, Firsts, Lessons.
 *
 * Big bet: { id, title, area, why, expect, regret, confidence (1-5), madeAt,
 *            reviews: [{ at, checkpoint (3|6|12), verdict ('right'|'mixed'|'wrong'), note }] }
 * First:   { id, title, area, date (YYYY-MM-DD), note }
 * Lesson:  { id, text, area, pinned, at, source: { type: 'battle'|'bet'|'manual', id } }
 *
 * Browser: window.TDRecord. Node (tests): require('./js/record.js').
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TDRecord = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var CHECKPOINTS = [{ months: 3, days: 91 }, { months: 6, days: 182 }, { months: 12, days: 365 }];
  var VERDICTS = {
    right: { label: 'Right call', short: 'Right' },
    mixed: { label: 'Mixed', short: 'Mixed' },
    wrong: { label: 'Wrong call', short: 'Wrong' }
  };

  function t(x) { return typeof x === 'number' ? x : Date.parse(x); }
  function dayIndex(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  function daysSince(iso, now) { return dayIndex(now || new Date()) - dayIndex(new Date(t(iso))); }

  /** The next review checkpoint for a bet, with whether it is due now. */
  function nextReview(bet, now) {
    var done = (bet.reviews || []).map(function (r) { return r.checkpoint; });
    var age = daysSince(bet.madeAt, now);
    for (var i = 0; i < CHECKPOINTS.length; i++) {
      var c = CHECKPOINTS[i];
      if (done.indexOf(c.months) !== -1) continue;
      return { months: c.months, due: age >= c.days, inDays: Math.max(0, c.days - age) };
    }
    return null;
  }

  /** Bets with a review due now, oldest first. */
  function dueReviews(bets, now) {
    return bets.filter(function (b) { var n = nextReview(b, now); return n && n.due; })
      .sort(function (a, b) { return t(a.madeAt) - t(b.madeAt); });
  }

  function latestVerdict(bet) {
    var r = (bet.reviews || []).slice().sort(function (a, b) { return a.checkpoint - b.checkpoint; });
    return r.length ? r[r.length - 1].verdict : null;
  }

  /** How your judgment holds up: share of reviewed bets whose latest verdict is right. */
  function judgment(bets) {
    var reviewed = bets.filter(function (b) { return latestVerdict(b); });
    var count = { right: 0, mixed: 0, wrong: 0 };
    reviewed.forEach(function (b) { count[latestVerdict(b)]++; });
    // Confidence calibration: average confidence of right vs wrong calls.
    function avgConf(v) {
      var l = reviewed.filter(function (b) { return latestVerdict(b) === v; });
      return l.length ? l.reduce(function (s, b) { return s + (b.confidence || 3); }, 0) / l.length : null;
    }
    return {
      made: bets.length,
      reviewed: reviewed.length,
      right: count.right,
      mixed: count.mixed,
      wrong: count.wrong,
      rate: reviewed.length ? count.right / reviewed.length : null,
      confRight: avgConf('right'),
      confWrong: avgConf('wrong')
    };
  }

  /** Firsts sorted newest first and grouped by year. */
  function firstsByYear(firsts) {
    var sorted = firsts.slice().sort(function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
    var groups = [];
    sorted.forEach(function (f) {
      var y = f.date.slice(0, 4);
      var g = groups[groups.length - 1];
      if (!g || g.year !== y) groups.push(g = { year: y, items: [] });
      g.items.push(f);
    });
    return groups;
  }

  /** Lessons: pinned first, then grouped by area (areas ordered by size). */
  function lessonsView(lessons) {
    var pinned = lessons.filter(function (l) { return l.pinned; }).sort(function (a, b) { return t(b.at) - t(a.at); });
    var by = Object.create(null);
    lessons.filter(function (l) { return !l.pinned; }).forEach(function (l) { (by[l.area || 'General'] = by[l.area || 'General'] || []).push(l); });
    var areas = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length || (a < b ? -1 : 1); }).map(function (a) {
      return { area: a, items: by[a].sort(function (x, y) { return t(y.at) - t(x.at); }) };
    });
    return { pinned: pinned, areas: areas };
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
  }

  return {
    CHECKPOINTS: CHECKPOINTS,
    VERDICTS: VERDICTS,
    MAX_PINNED: 10,
    nextReview: nextReview,
    dueReviews: dueReviews,
    latestVerdict: latestVerdict,
    judgment: judgment,
    firstsByYear: firstsByYear,
    lessonsView: lessonsView,
    daysSince: daysSince,
    fmtDuration: fmtDuration
  };
});
