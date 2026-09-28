/*
 * 1000 Decisions — health algorithm.
 *
 * Pure functions, no DOM. Loaded in the browser as `window.TDHealth` and in
 * Node (tests) via `require('./js/health.js')`.
 *
 * The rules are fixed on purpose. There are no knobs:
 *   weight       = N - priorityRank + 1
 *   targetShare  = weight / sum(weights)
 *   actualShare  = category decisions in last 7 days / all decisions in last 7 days
 *   ratio r      = actualShare / targetShare
 *   0.8 <= r <= 1.3  -> balanced (green)
 *   r < 0.8          -> neglected (red, deeper as r falls)
 *   r > 1.3          -> over-invested (amber)
 *   nothing logged in the last 7 days -> idle (grey) for every category
 *
 * "Last 7 days" is today plus the six calendar days before it, in local time.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TDHealth = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WINDOW_DAYS = 7;
  var BAND_LOW = 0.8;
  var BAND_HIGH = 1.3;

  // Status colors. Health always wins over a category's own accent color.
  var COLORS = {
    balanced: { fill: '#12883F', track: '#E2F3E7', onFill: '#FFFFFF', ink: '#0B6B30' },
    over: { fill: '#F5A524', track: '#FDF0D8', onFill: '#16130F', ink: '#8A5A00' },
    neglected: { fill: '#D92D20', track: '#FCE8E6', onFill: '#FFFFFF', ink: '#B42318' },
    neglectedDeep: { fill: '#8C1313', track: '#F6CFCB', onFill: '#FFFFFF', ink: '#8C1313' },
    idle: { fill: '#A7ACB4', track: '#EEF0F2', onFill: '#16130F', ink: '#5C636E' }
  };

  function startOfDay(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Local midnight at the start of the rolling 7-day window (today counts as day 7). */
  function windowStart(now) {
    var d = startOfDay(now || new Date());
    d.setDate(d.getDate() - (WINDOW_DAYS - 1));
    return d;
  }

  function round6(x) {
    return Math.round(x * 1e6) / 1e6;
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16); });
  }

  function mixHex(a, b, t) {
    var x = hexToRgb(a);
    var y = hexToRgb(b);
    return '#' + x.map(function (v, i) {
      var c = Math.round(v + (y[i] - v) * t);
      return (c < 16 ? '0' : '') + c.toString(16);
    }).join('').toUpperCase();
  }

  /**
   * Compute health for every category.
   * @param {Array<{name:string, priorityRank:number}>} categories
   * @param {Array<{categoryName:string, timestamp:string|number}>} decisions
   * @param {Date} [now]
   */
  function computeHealth(categories, decisions, now) {
    now = now || new Date();
    var n = categories.length;
    var weightSum = (n * (n + 1)) / 2;
    var since = windowStart(now).getTime();

    var totals = Object.create(null);
    var recent = Object.create(null);
    categories.forEach(function (c) {
      totals[c.name] = 0;
      recent[c.name] = 0;
    });

    var total7 = 0;
    for (var i = 0; i < decisions.length; i++) {
      var d = decisions[i];
      if (!(d.categoryName in totals)) continue;
      totals[d.categoryName]++;
      var t = typeof d.timestamp === 'number' ? d.timestamp : Date.parse(d.timestamp);
      if (t >= since) {
        recent[d.categoryName]++;
        total7++;
      }
    }

    var list = categories.map(function (c) {
      var weight = n - c.priorityRank + 1;
      var targetShare = weightSum ? weight / weightSum : 0;
      var count7 = recent[c.name];
      var actualShare = total7 ? count7 / total7 : 0;
      var ratio = total7 && targetShare ? round6(actualShare / targetShare) : null;

      var status;
      var severity = 0;
      if (!total7) status = 'idle';
      else if (ratio < BAND_LOW) {
        status = 'neglected';
        severity = clamp((BAND_LOW - ratio) / BAND_LOW, 0, 1);
      } else if (ratio > BAND_HIGH) status = 'over';
      else status = 'balanced';

      return {
        name: c.name,
        priorityRank: c.priorityRank,
        weight: weight,
        targetShare: targetShare,
        total: totals[c.name],
        count7: count7,
        actualShare: actualShare,
        ratio: ratio,
        status: status,
        severity: severity,
        urgent: status === 'neglected' && c.priorityRank === 1
      };
    });

    var byName = Object.create(null);
    list.forEach(function (h) { byName[h.name] = h; });

    return { list: list, byName: byName, total7: total7, windowStart: new Date(since) };
  }

  /** Colors for a health entry. Neglected deepens from red toward crimson as the ratio falls. */
  function colorsFor(h) {
    if (!h || h.status === 'idle') return COLORS.idle;
    if (h.status === 'balanced') return COLORS.balanced;
    if (h.status === 'over') return COLORS.over;
    var t = h.severity;
    return {
      fill: mixHex(COLORS.neglected.fill, COLORS.neglectedDeep.fill, t),
      track: mixHex(COLORS.neglected.track, COLORS.neglectedDeep.track, t),
      onFill: '#FFFFFF',
      ink: mixHex(COLORS.neglected.ink, COLORS.neglectedDeep.ink, t)
    };
  }

  function ordinalRank(rank) {
    return '#' + rank;
  }

  /** Plain-language status. `label` is short; `detail` explains the numbers. */
  function describe(h) {
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    if (!h) return { label: '', detail: '' };
    if (h.status === 'idle') {
      return {
        short: 'No recent data',
        label: 'No decisions in the last 7 days',
        detail: 'Health turns on as soon as you log a decision. Until then every bar stays grey.'
      };
    }
    var share = pct(h.actualShare) + ' of this week’s decisions';
    var target = 'target ' + pct(h.targetShare);
    if (h.status === 'balanced') {
      return {
        short: 'Balanced',
        label: 'Balanced',
        detail: 'Getting ' + share + ' against a ' + target + '. That is the right amount of attention for your ' + ordinalRank(h.priorityRank) + ' priority.'
      };
    }
    if (h.status === 'over') {
      return {
        short: 'Over-invested',
        label: 'Over-invested — possibly avoiding something harder',
        detail: 'Getting ' + share + ' against a ' + target + '. Easy wins here can hide a harder priority that is waiting.'
      };
    }
    if (h.urgent) {
      return {
        short: 'Neglected',
        label: 'Neglected — this is your #1 priority',
        detail: h.count7 === 0
          ? 'Nothing logged here in 7 days. Your most important priority should get ' + pct(h.targetShare) + ' of your decisions.'
          : 'Only ' + share + ' against a ' + target + '. Your most important priority is falling behind.'
      };
    }
    return {
      short: h.severity >= 0.5 ? 'Badly neglected' : 'Neglected',
      label: (h.severity >= 0.5 ? 'Badly neglected' : 'Neglected') + ' — your ' + ordinalRank(h.priorityRank) + ' priority is falling behind',
      detail: h.count7 === 0
        ? 'Nothing logged here in 7 days, against a ' + target + '.'
        : 'Only ' + share + ' against a ' + target + '.'
    };
  }

  return {
    WINDOW_DAYS: WINDOW_DAYS,
    BAND_LOW: BAND_LOW,
    BAND_HIGH: BAND_HIGH,
    COLORS: COLORS,
    windowStart: windowStart,
    startOfDay: startOfDay,
    computeHealth: computeHealth,
    colorsFor: colorsFor,
    describe: describe,
    mixHex: mixHex
  };
});
