/*
 * 1000 Decisions — insights (pure, no DOM).
 *
 * Proof: totals of money and time found in "what happened" results.
 * Patterns: your rhythm, quiet periods, category silences and risk days,
 * learned only from the timestamps you already log. Nothing else is tracked.
 *
 * Browser: window.TDInsights. Node (tests): require('./js/insights.js').
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TDInsights = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var READY_DAYS = 14;
  var READY_DECISIONS = 50;
  var RHYTHM_DAYS = 28;
  var DAY = 86400000;
  var WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

  function dayIndex(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  function ts(d) { return typeof d.timestamp === 'number' ? d.timestamp : Date.parse(d.timestamp); }
  function minutesOfDay(date) { return date.getHours() * 60 + date.getMinutes(); }

  // ── Proof ─────────────────────────────────────────────────────────────

  var CURRENCIES = [
    { code: 'USD', symbol: '$', re: /(?:\$|usd\b|dollars?\b)/i },
    { code: 'EUR', symbol: '€', re: /(?:€|eur\b|euros?\b)/i },
    { code: 'GBP', symbol: '£', re: /(?:£|gbp\b|pounds?\b)/i },
    { code: 'UZS', symbol: ' so‘m', re: /(?:so['ʻ‘’`]?m\b|sum\b|uzs\b)/i },
    { code: 'RUB', symbol: ' ₽', re: /(?:₽|rub\b|rubles?\b|roubles?\b)/i }
  ];
  var NEGATIVE = /\b(spent|spend|lost|lose|paid|cost|wasted|owe)\b/i;

  function toNumber(raw, suffix) {
    var n = parseFloat(String(raw).replace(/[,\s]/g, ''));
    if (!isFinite(n)) return null;
    if (suffix && /k/i.test(suffix)) n *= 1000;
    if (suffix && /m/i.test(suffix) && !/min/i.test(suffix)) n *= 1000000;
    return n;
  }

  /** Money in a result, e.g. "Saved $40", "40 000 so'm", "€12". Losses are ignored. */
  function parseMoney(text) {
    if (!text || NEGATIVE.test(text)) return null;
    var num = '(\\d[\\d,]*(?:\\.\\d+)?(?:\\s\\d{3})*)\\s?(k|mln|m)?\\b';
    for (var i = 0; i < CURRENCIES.length; i++) {
      var c = CURRENCIES[i];
      var cur = c.re.source;
      var before = new RegExp('(?:' + cur + ')\\s?' + num, 'i').exec(text);
      var after = new RegExp(num + '\\s?(?:' + cur + ')', 'i').exec(text);
      var m = before || after;
      if (m) {
        var val = toNumber(m[1], m[2]);
        if (val) return { currency: c.code, amount: val };
      }
    }
    return null;
  }

  /** Time in a result, e.g. "Got 90 minutes back", "2 hours", "1.5h". Returns minutes. */
  function parseMinutes(text) {
    if (!text || NEGATIVE.test(text)) return 0;
    var total = 0;
    var re = /(\d+(?:\.\d+)?)\s?(hours?|hrs?|h\b|minutes?|mins?\b)/gi;
    var m;
    while ((m = re.exec(text))) {
      var n = parseFloat(m[1]);
      total += /^h/i.test(m[2]) ? n * 60 : n;
    }
    return Math.round(total);
  }

  function formatMoney(code, amount) {
    var c = CURRENCIES.filter(function (x) { return x.code === code; })[0];
    var n = Math.round(amount).toLocaleString('en-US');
    return c.symbol.charAt(0) === ' ' ? n + c.symbol : c.symbol + n;
  }

  function formatMinutes(min) {
    if (min < 60) return min + ' min';
    var h = min / 60;
    return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + ' h';
  }

  /**
   * Per-category proof: result count, money and time totals, latest result.
   * Categories keep their priority order.
   */
  function proof(categories, decisions) {
    var by = Object.create(null);
    categories.forEach(function (c) { by[c.name] = { name: c.name, count: 0, money: Object.create(null), minutes: 0, latest: null }; });
    var results = [];
    decisions.forEach(function (d) {
      var p = by[d.categoryName];
      if (!p || !d.result || !d.result.trim()) return;
      p.count++;
      var money = parseMoney(d.result);
      if (money) p.money[money.currency] = (p.money[money.currency] || 0) + money.amount;
      p.minutes += parseMinutes(d.result);
      if (!p.latest || ts(d) >= ts(p.latest)) p.latest = d;
      results.push(d);
    });
    results.sort(function (a, b) { return ts(b) - ts(a); });
    var rows = categories.map(function (c) {
      var p = by[c.name];
      var headline;
      var codes = Object.keys(p.money).sort(function (a, b) { return p.money[b] - p.money[a]; });
      if (codes.length) headline = formatMoney(codes[0], p.money[codes[0]]) + ' saved';
      else if (p.minutes) headline = formatMinutes(p.minutes) + ' back';
      else headline = p.count + ' ' + (p.count === 1 ? 'result' : 'results');
      p.headline = headline;
      return p;
    });
    return { rows: rows, results: results, total: results.length };
  }

  // ── Patterns ──────────────────────────────────────────────────────────

  function median(list) {
    if (!list.length) return 0;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function hourLabel(h) {
    var hh = ((h % 24) + 24) % 24;
    var suffix = hh < 12 ? 'am' : 'pm';
    var n = hh % 12 === 0 ? 12 : hh % 12;
    return n + suffix;
  }

  function rangeLabel(start, len) {
    var a = hourLabel(start), b = hourLabel(start + len);
    if (a.slice(-2) === b.slice(-2)) a = a.slice(0, -2);
    return a + '–' + b;
  }

  /**
   * Learn the user's rhythm.
   * @param {Array} categories  [{name, priorityRank}]
   * @param {Array} decisions   [{categoryName, timestamp}]
   * @param {Date} now
   * @param {Array} [reasons]   one-tap answers [{date, answer}]
   */
  function patterns(categories, decisions, now, reasons) {
    now = now || new Date();
    reasons = reasons || [];
    var todayIdx = dayIndex(now);
    var list = decisions.map(function (d) {
      var date = new Date(ts(d));
      return { name: d.categoryName, date: date, day: dayIndex(date), min: minutesOfDay(date) };
    }).filter(function (d) { return isFinite(d.day); });

    var firstDay = list.length ? Math.min.apply(null, list.map(function (d) { return d.day; })) : todayIdx;
    var daysOfData = list.length ? todayIdx - firstDay + 1 : 0;
    var ready = daysOfData >= READY_DAYS && list.length >= READY_DECISIONS;

    // Past days only (today is still in progress), limited to the rhythm window.
    var fromDay = Math.max(firstDay, todayIdx - RHYTHM_DAYS);
    var past = list.filter(function (d) { return d.day >= fromDay && d.day < todayIdx; });
    var pastDays = Math.max(1, todayIdx - fromDay);

    // Heatmap: weekday (0 = Monday) × hour, last 8 weeks including today.
    var heat = [];
    for (var w = 0; w < 7; w++) { heat.push(new Array(24).fill(0)); }
    var heatFrom = todayIdx - 55;
    list.forEach(function (d) {
      if (d.day < heatFrom) return;
      heat[(d.date.getDay() + 6) % 7][d.date.getHours()]++;
    });

    // Strongest 3-hour window from the hour histogram.
    var hours = new Array(24).fill(0);
    past.forEach(function (d) { hours[d.date.getHours()]++; });
    var best = { start: 0, count: -1 };
    for (var h = 0; h < 24; h++) {
      var c3 = hours[h] + hours[(h + 1) % 24] + hours[(h + 2) % 24];
      if (c3 > best.count) best = { start: h, count: c3 };
    }
    var strongest = past.length ? { start: best.start, label: rangeLabel(best.start, 3), share: best.count / past.length } : null;

    // Quietest waking window (6am–midnight) among hours you do use at all.
    var quiet = null;
    if (past.length) {
      var q = { start: -1, count: Infinity };
      for (var s = 6; s <= 21; s++) {
        var cq = hours[s] + hours[s + 1] + hours[s + 2];
        if (cq < q.count) q = { start: s, count: cq };
      }
      quiet = { start: q.start, label: rangeLabel(q.start, 3), share: q.count / past.length };
    }

    // Expected count by this time of day, from past active days.
    var nowMin = minutesOfDay(now);
    var activeDays = Object.create(null);
    var beforeNow = 0;
    past.forEach(function (d) {
      activeDays[d.day] = true;
      if (d.min <= nowMin) beforeNow++;
    });
    var expectedByNow = beforeNow / pastDays;
    var todaySoFar = list.filter(function (d) { return d.day === todayIdx; }).length;
    var dailyAvg = past.length / pastDays;

    // Category silence and risk weekdays.
    var cats = categories.map(function (c) {
      var mine = list.filter(function (d) { return d.name === c.name; });
      var days = Object.keys(mine.reduce(function (acc, d) { acc[d.day] = true; return acc; }, {})).map(Number).sort(function (a, b) { return a - b; });
      var gaps = [];
      for (var i = 1; i < days.length; i++) if (days[i] >= todayIdx - 60) gaps.push(days[i] - days[i - 1]);
      var usualGap = Math.max(1, median(gaps));
      var last = days.length ? days[days.length - 1] : null;
      var quietDays = last === null ? null : todayIdx - last;
      var longest = gaps.length ? Math.max.apply(null, gaps) - 1 : 0;

      // Risk weekday: of the last 8 same weekdays, how many had nothing here.
      var risk = null;
      var activeShare = days.filter(function (d) { return d >= todayIdx - 56 && d < todayIdx; }).length / Math.min(56, Math.max(1, todayIdx - firstDay));
      if (activeShare >= 0.35) {
        for (var wd = 0; wd < 7; wd++) {
          var seen = 0, empty = 0;
          for (var back = 1; back <= 56; back++) {
            var di = todayIdx - back;
            if (di < firstDay) break;
            if (new Date(di * DAY).getUTCDay() !== wd) continue;
            seen++;
            if (days.indexOf(di) === -1) empty++;
          }
          if (seen >= 3 && empty / seen >= 0.75 && (!risk || empty / seen > risk.rate)) risk = { weekday: wd, label: WEEKDAYS[wd], empty: empty, seen: seen, rate: empty / seen };
        }
      }
      var today = mine.filter(function (d) { return d.day === todayIdx; }).length;
      return {
        name: c.name,
        priorityRank: c.priorityRank,
        quietDays: quietDays,
        usualGap: usualGap,
        longestSilence: longest,
        silent: quietDays !== null && quietDays >= Math.max(3, Math.ceil(usualGap * 2)),
        risk: risk,
        today: today
      };
    });

    // Yesterday: did the evening (or the whole day) go quiet against your usual?
    var yIdx = todayIdx - 1;
    var yList = list.filter(function (d) { return d.day === yIdx; });
    var eveningUsual = past.filter(function (d) { return d.min >= 17 * 60 && d.day < yIdx; }).length / Math.max(1, pastDays - 1);
    var yEvening = yList.filter(function (d) { return d.min >= 17 * 60; }).length;
    var yesterdayQuiet = null;
    if (ready) {
      if (eveningUsual >= 1 && yEvening === 0) yesterdayQuiet = { window: 'evening', text: 'Yesterday evening went quiet.' };
      else if (dailyAvg >= 2 && yList.length < dailyAvg * 0.5) yesterdayQuiet = { window: 'day', text: 'Yesterday was quieter than usual.' };
    }

    // One-tap answers → what pulls you away most.
    var counts = Object.create(null);
    reasons.forEach(function (r) { if (r.answer && r.answer !== 'none') counts[r.answer] = (counts[r.answer] || 0) + 1; });
    var topReason = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var answered = reasons.filter(function (r) { return r.answer && r.answer !== 'none'; }).length;

    return {
      ready: ready,
      progress: { days: Math.min(daysOfData, READY_DAYS), needDays: READY_DAYS, decisions: Math.min(list.length, READY_DECISIONS), needDecisions: READY_DECISIONS },
      heat: heat,
      strongest: strongest,
      quietest: quiet,
      expectedByNow: expectedByNow,
      todaySoFar: todaySoFar,
      dailyAvg: dailyAvg,
      categories: cats,
      yesterdayQuiet: yesterdayQuiet,
      reasons: topReason ? { top: topReason, count: counts[topReason], of: answered } : null
    };
  }

  /**
   * The single most useful line for the top of the page, or null.
   * Order: risk day now > #1 priority silence > quiet day > positive rhythm.
   */
  function topLine(p, now) {
    if (!p || !p.ready) return null;
    now = now || new Date();
    var byRank = p.categories.slice().sort(function (a, b) { return a.priorityRank - b.priorityRank; });
    var weekday = now.getDay();

    for (var i = 0; i < byRank.length; i++) {
      var c = byRank[i];
      if (c.risk && c.risk.weekday === weekday && c.today === 0 && c.priorityRank <= 3) {
        return {
          tone: 'heads-up', category: c.name,
          label: 'Heads up',
          text: c.risk.label + ' are when ' + c.name + ' goes quiet (' + c.risk.empty + ' of the last ' + c.risk.seen + '). One decision today keeps it moving.'
        };
      }
    }
    var first = byRank[0];
    if (first && first.silent && first.today === 0) {
      return {
        tone: 'heads-up', category: first.name,
        label: first.name + ': ' + first.quietDays + ' days quiet',
        text: 'Your usual gap is ' + (first.usualGap <= 1 ? '1 day' : Math.round(first.usualGap) + ' days') + '. One ' + first.name + ' decision restarts it.'
      };
    }
    var hour = now.getHours();
    if (hour >= 11 && p.expectedByNow >= 2 && p.todaySoFar < p.expectedByNow / 3) {
      return {
        tone: 'quiet', label: 'Quieter than usual today',
        text: 'You’re usually at ' + Math.round(p.expectedByNow) + ' by now. One is enough to restart.'
      };
    }
    if (p.strongest && p.strongest.share >= 0.25) {
      var inWindow = hour >= p.strongest.start && hour < p.strongest.start + 3;
      return {
        tone: 'good', label: inWindow ? 'Your window is now' : 'Your window',
        text: p.strongest.label + ' is when you make ' + Math.round(p.strongest.share * 100) + '% of your decisions.'
      };
    }
    return null;
  }

  return {
    READY_DAYS: READY_DAYS,
    READY_DECISIONS: READY_DECISIONS,
    parseMoney: parseMoney,
    parseMinutes: parseMinutes,
    formatMoney: formatMoney,
    formatMinutes: formatMinutes,
    proof: proof,
    patterns: patterns,
    topLine: topLine,
    hourLabel: hourLabel
  };
});
