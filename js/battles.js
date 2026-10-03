/*
 * 1000 Decisions — Battles (pure, no DOM).
 *
 * A battle is a hard thing you're going through. It starts when you add it
 * and ends when you mark it finished. Dates are never typed by hand.
 *
 *   { id, title, area, weight (1-5), step, startedAt, status, endedAt,
 *     helped: [], note, updates: [{ at, weight, note }] }
 *   status: 'active' | 'won' | 'passed' | 'accepted'
 *
 * Browser: window.TDBattles. Node (tests): require('./js/battles.js').
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TDBattles = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var AREAS = ['Money', 'Work', 'Health', 'Family', 'Relationships', 'Mind', 'Other'];
  var STATUSES = {
    won: { label: 'Won', long: 'Solved it' },
    passed: { label: 'Passed', long: 'It passed with time' },
    accepted: { label: 'Accepted', long: 'Learned to live with it' }
  };
  var HELPED = [
    ['action', 'Took action'], ['talked', 'Talked to someone'], ['sport', 'Gym / sport'], ['sleep', 'Sleep'],
    ['time', 'Time'], ['faith', 'Faith / prayer'], ['plan', 'Made a plan'], ['money', 'Money fix']
  ];
  var STOP = { the: 1, and: 1, with: 1, from: 1, that: 1, this: 1, have: 1, about: 1, again: 1, still: 1, into: 1, over: 1, they: 1, them: 1, their: 1, what: 1, when: 1, my: 1, me: 1 };

  function t(x) { return typeof x === 'number' ? x : Date.parse(x); }
  function dayIndex(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }

  /** Whole days a battle has lasted (or has lasted so far). Day 1 = the day it started. */
  function days(b, now) {
    var end = b.status === 'active' ? (now || new Date()) : new Date(t(b.endedAt));
    return Math.max(1, dayIndex(end) - dayIndex(new Date(t(b.startedAt))) + 1);
  }

  function words(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9À-ɏ\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length >= 4 && !STOP[w]; })
      .map(function (w) { return w.replace(/(ing|ed|es|s)$/, ''); });
  }

  function similarTitle(a, b) {
    var wa = words(a), wb = words(b);
    return wa.some(function (w) { return wb.indexOf(w) !== -1; });
  }

  function avg(list) { return list.length ? list.reduce(function (s, x) { return s + x; }, 0) / list.length : 0; }

  function closed(battles) { return battles.filter(function (b) { return b.status !== 'active'; }); }
  function active(battles) {
    return battles.filter(function (b) { return b.status === 'active'; }).sort(function (a, b) { return t(b.startedAt) - t(a.startedAt); });
  }

  /** Typical length in days for an area, falling back to all closed battles. */
  function typicalDays(battles, area) {
    var done = closed(battles);
    var same = done.filter(function (b) { return b.area === area; });
    var pool = same.length >= 1 ? same : done;
    if (!pool.length) return null;
    return { days: Math.round(avg(pool.map(function (b) { return days(b); }))), basis: same.length ? 'area' : 'all', count: pool.length };
  }

  /** "You've been here before": closed battles in the same area or with similar words. */
  function beenHere(battles, area, title, excludeId) {
    return closed(battles)
      .filter(function (b) { return b.id !== excludeId && (b.area === area || (title && similarTitle(title, b.title))); })
      .sort(function (a, b) {
        var sa = (b.area === area ? 2 : 0) + (similarTitle(title, b.title) ? 1 : 0);
        var sb = (a.area === area ? 2 : 0) + (similarTitle(title, a.title) ? 1 : 0);
        return sa - sb || t(b.endedAt) - t(a.endedAt);
      })
      .slice(0, 2);
  }

  /** Areas with 3+ battles started in the last ~6 months. */
  function repeats(battles, now) {
    now = now || new Date();
    var from = t(now) - 183 * DAY;
    var by = Object.create(null);
    battles.forEach(function (b) {
      if (t(b.startedAt) < from) return;
      (by[b.area] = by[b.area] || []).push(b);
    });
    return Object.keys(by).filter(function (a) { return by[a].length >= 3; }).map(function (a) {
      var list = by[a].sort(function (x, y) { return t(y.startedAt) - t(x.startedAt); });
      return {
        area: a,
        count: list.length,
        avgDays: Math.round(avg(list.map(function (b) { return days(b, now); }))),
        titles: list.slice(0, 3).map(function (b) { return b.title; })
      };
    }).sort(function (x, y) { return y.count - x.count; });
  }

  /** What helped, ranked by how fast those battles ended (needs 2+ battles per tag). */
  function whatWorks(battles) {
    var done = closed(battles);
    var out = HELPED.map(function (h) {
      var list = done.filter(function (b) { return (b.helped || []).indexOf(h[0]) !== -1; });
      return { key: h[0], label: h[1], count: list.length, avgDays: list.length ? Math.round(avg(list.map(function (b) { return days(b); }))) : null };
    }).filter(function (x) { return x.count >= 2; });
    return out.sort(function (a, b) { return a.avgDays - b.avgDays; });
  }

  function summary(battles, now) {
    var done = closed(battles);
    var won = done.filter(function (b) { return b.status === 'won'; }).length;
    return {
      fought: battles.length,
      over: done.length,
      won: won,
      open: battles.length - done.length,
      avgDays: done.length ? Math.round(avg(done.map(function (b) { return days(b); }))) : null,
      longest: done.length ? Math.max.apply(null, done.map(function (b) { return days(b); })) : null,
      now: now
    };
  }

  /**
   * Decisions per day while at least one battle was open vs. the rest of the
   * time since the first battle started.
   */
  function disciplineUnderFire(battles, decisions, now) {
    now = now || new Date();
    if (!battles.length) return null;
    var first = Math.min.apply(null, battles.map(function (b) { return dayIndex(new Date(t(b.startedAt))); }));
    var today = dayIndex(now);
    var hard = Object.create(null);
    battles.forEach(function (b) {
      var s = dayIndex(new Date(t(b.startedAt)));
      var e = b.status === 'active' ? today : dayIndex(new Date(t(b.endedAt)));
      for (var d = s; d <= e; d++) hard[d] = true;
    });
    var counts = Object.create(null);
    decisions.forEach(function (x) {
      var d = dayIndex(new Date(t(x.timestamp)));
      if (d >= first && d <= today) counts[d] = (counts[d] || 0) + 1;
    });
    var hardDays = 0, hardN = 0, calmDays = 0, calmN = 0;
    for (var d = first; d <= today; d++) {
      if (hard[d]) { hardDays++; hardN += counts[d] || 0; } else { calmDays++; calmN += counts[d] || 0; }
    }
    if (hardDays < 3 || calmDays < 3) return null;
    var hardRate = hardN / hardDays, calmRate = calmN / calmDays;
    return { hardRate: hardRate, calmRate: calmRate, ratio: calmRate ? hardRate / calmRate : null };
  }

  /** Decisions logged since a battle started. */
  function decisionsSince(b, decisions) {
    var s = t(b.startedAt);
    var e = b.status === 'active' ? Infinity : t(b.endedAt);
    return decisions.filter(function (d) { var x = t(d.timestamp); return x >= s && x <= e; }).length;
  }

  /** Current weight (latest update wins). */
  function weightNow(b) {
    var u = (b.updates || []).filter(function (x) { return x.weight; });
    return u.length ? u[u.length - 1].weight : b.weight;
  }

  /** Check-in is due every `everyDays` since the last battle added or check-in. */
  function checkinDue(battles, checkins, now, everyDays) {
    now = now || new Date();
    everyDays = everyDays || 14;
    var last = 0;
    battles.forEach(function (b) { last = Math.max(last, t(b.startedAt)); });
    (checkins || []).forEach(function (c) { last = Math.max(last, t(c.at)); });
    if (!last) return true;
    return dayIndex(now) - dayIndex(new Date(last)) >= everyDays;
  }

  /** A calm line for heavy battles running longer than usual. */
  function careLine(b, battles, now) {
    if (b.status !== 'active' || weightNow(b) < 5) return null;
    var typ = typicalDays(battles, b.area);
    var limit = typ ? Math.max(10, Math.round(typ.days * 1.25)) : 21;
    if (days(b, now) < limit) return null;
    return 'This one is lasting longer than usual. Talking to someone you trust has helped people get through it faster.';
  }

  return {
    AREAS: AREAS,
    STATUSES: STATUSES,
    HELPED: HELPED,
    days: days,
    active: active,
    closed: closed,
    typicalDays: typicalDays,
    beenHere: beenHere,
    repeats: repeats,
    whatWorks: whatWorks,
    summary: summary,
    disciplineUnderFire: disciplineUnderFire,
    decisionsSince: decisionsSince,
    weightNow: weightNow,
    checkinDue: checkinDue,
    careLine: careLine,
    similarTitle: similarTitle
  };
});
