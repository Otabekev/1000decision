/*
 * 1000 Decisions — app.
 *
 * One page, no backend. Everything lives in localStorage under a single key:
 *   { version, categories[], decisions[], settings{} }
 * Categories: { id, name, color, priorityRank }   (priorityRank 1 = highest)
 * Decisions:  { id, categoryName, text, result, timestamp (ISO) }
 * Settings:   { goal, startDate (YYYY-MM-DD), signature, lastBackupAt }
 */
(function () {
  'use strict';

  var H = window.TDHealth;
  var I = window.TDInsights;
  var Card = window.TDCard;

  var STORAGE_KEY = 'thousand-decisions:v1';
  var LOCALE = 'en-US';
  // Category identity colors: muted and distinct from the health colors.
  var PALETTE = ['#2F5D8A', '#6B7A3A', '#9A6A3A', '#4E5A67', '#3D7F7A', '#6A4C7A', '#243B5A', '#8A7A55', '#50663F', '#7A5C48', '#5B6F86', '#2F3437'];
  var SUGGESTED = ['Gym', 'Money', 'Deep work', 'Health', 'Learning', 'Family', 'Sleep', 'Peace'];
  var DOT_INK = '#1C1F22';
  var DOT_TODAY = '#B08D3C';
  var HISTORY_PAGE = 20;
  var MAX_NAME = 24;
  var MAX_TEXT = 140;
  var MAX_RESULT = 200;
  var MAX_WHY = 80;
  var REASONS = [['phone', 'Phone'], ['tired', 'Tired'], ['stress', 'Stress'], ['busy', 'Busy'], ['none', 'Just didn’t log']];

  // ── Icons ──────────────────────────────────────────────────────────────
  var ICON = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    up: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
    down: '<path d="M12 5v14m0 0-6-6m6 6 6-6"/>',
    dash: '<path d="M6 12h12"/>',
    alert: '<path d="M12 6.5v7.5"/><circle cx="12" cy="18" r="1.25" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    edit: '<path d="M4 20h4L18.6 9.4a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 8.5l3 3"/>',
    trash: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    swap: '<path d="M7 7h11l-3-3m3 13H6l3 3"/>',
    download: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
    share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    grip: '<circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/>'
  };
  var STATUS_ICON = { balanced: 'check', over: 'up', neglected: 'down', idle: 'dash' };

  function icon(name, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  // ── Utils ──────────────────────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function fmtNum(n) { return n < 10000 ? String(n) : n.toLocaleString(LOCALE); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function plural(n, one, many) { return n === 1 ? one : many || one + 's'; }
  /** Look up a form control by name. (Never use form.name / form.when: those collide with built-in properties.) */
  function fld(form, name) { return form.elements.namedItem(name); }
  function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function validColor(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : null; }

  // ── Dates (local time) ─────────────────────────────────────────────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? null : d;
  }
  function dayIndex(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function dayNumber(startYmd, now) {
    var s = parseYmd(startYmd);
    return s ? dayIndex(now) - dayIndex(s) + 1 : 1;
  }
  function toLocalInput(d) {
    return ymd(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtTime(d) { return d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' }); }
  function fmtDayHeading(d, now) {
    var diff = dayIndex(now) - dayIndex(d);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return d.toLocaleDateString(LOCALE, { weekday: 'long' });
    var opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(LOCALE, opts);
  }
  function fmtShort(d, now) {
    var diff = dayIndex(now) - dayIndex(d);
    if (diff === 0) return 'Today, ' + fmtTime(d);
    if (diff === 1) return 'Yesterday';
    var opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(LOCALE, opts);
  }
  function fmtLong(d) {
    return d.toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + fmtTime(d);
  }

  // ── State ──────────────────────────────────────────────────────────────
  var storageOK = true;

  function defaults() {
    return {
      version: 1,
      categories: [],
      decisions: [],
      settings: { goal: 1000, startDate: ymd(new Date()), signature: '', lastBackupAt: null, showWhyOnCard: false },
      // One-tap answers to "What pulled you away?" and when the question was last shown.
      reasons: [],
      prompt: { lastAsked: null, ignored: 0, pausedUntil: null }
    };
  }

  function nextColor(categories) {
    var used = categories.map(function (c) { return c.color; });
    for (var i = 0; i < PALETTE.length; i++) if (used.indexOf(PALETTE[i]) === -1) return PALETTE[i];
    return PALETTE[categories.length % PALETTE.length];
  }

  function findCategory(categories, name) {
    var key = String(name).trim().toLowerCase();
    for (var i = 0; i < categories.length; i++) if (categories[i].name.toLowerCase() === key) return categories[i];
    return null;
  }

  /** Validate and repair any stored or imported data. Never throws. */
  function normalize(raw) {
    var out = defaults();
    if (!raw || typeof raw !== 'object') return out;
    var src = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : raw;

    var s = src.settings && typeof src.settings === 'object' ? src.settings : {};
    var goal = parseInt(s.goal, 10);
    out.settings.goal = isFinite(goal) && goal >= 1 ? Math.min(goal, 100000) : 1000;
    if (parseYmd(s.startDate)) out.settings.startDate = s.startDate;
    out.settings.signature = typeof s.signature === 'string' ? s.signature.slice(0, 40) : '';
    out.settings.lastBackupAt = typeof s.lastBackupAt === 'string' ? s.lastBackupAt : null;
    out.settings.showWhyOnCard = s.showWhyOnCard === true;

    if (Array.isArray(src.reasons)) {
      out.reasons = src.reasons.filter(function (r) {
        return r && parseYmd(r.date) && REASONS.some(function (x) { return x[0] === r.answer; });
      }).map(function (r) { return { date: r.date, window: r.window === 'day' ? 'day' : 'evening', answer: r.answer }; }).slice(-400);
    }
    var pr = src.prompt && typeof src.prompt === 'object' ? src.prompt : {};
    out.prompt = {
      lastAsked: parseYmd(pr.lastAsked) ? pr.lastAsked : null,
      ignored: Math.max(0, parseInt(pr.ignored, 10) || 0),
      pausedUntil: parseYmd(pr.pausedUntil) ? pr.pausedUntil : null,
      askedFor: parseYmd(pr.askedFor) ? pr.askedFor : null,
      dismissedOn: parseYmd(pr.dismissedOn) ? pr.dismissedOn : null
    };

    var ids = Object.create(null);
    function freshId(id) {
      var v = typeof id === 'string' && id && !ids[id] ? id : uid();
      ids[v] = true;
      return v;
    }

    var cats = Array.isArray(src.categories) ? src.categories : [];
    cats
      .map(function (c, i) { return { c: c, i: i }; })
      .filter(function (x) { return x.c && typeof x.c.name === 'string' && x.c.name.trim(); })
      .sort(function (a, b) {
        var ra = Number(a.c.priorityRank), rb = Number(b.c.priorityRank);
        ra = isFinite(ra) ? ra : 1e9;
        rb = isFinite(rb) ? rb : 1e9;
        return ra - rb || a.i - b.i;
      })
      .forEach(function (x) {
        var name = x.c.name.trim().slice(0, MAX_NAME);
        if (findCategory(out.categories, name)) return;
        out.categories.push({
          id: freshId(x.c.id),
          name: name,
          color: validColor(x.c.color) || nextColor(out.categories),
          priorityRank: out.categories.length + 1,
          why: typeof x.c.why === 'string' ? x.c.why.trim().slice(0, MAX_WHY) : ''
        });
      });

    var decs = Array.isArray(src.decisions) ? src.decisions : [];
    decs.forEach(function (d) {
      if (!d || typeof d.text !== 'string' || !d.text.trim()) return;
      if (typeof d.categoryName !== 'string' || !d.categoryName.trim()) return;
      var t = typeof d.timestamp === 'number' ? d.timestamp : Date.parse(d.timestamp);
      if (!isFinite(t)) return;
      var cat = findCategory(out.categories, d.categoryName);
      if (!cat) {
        cat = { id: uid(), name: d.categoryName.trim().slice(0, MAX_NAME), color: nextColor(out.categories), priorityRank: out.categories.length + 1, why: '' };
        out.categories.push(cat);
      }
      out.decisions.push({
        id: freshId(d.id),
        categoryName: cat.name,
        text: d.text.trim().slice(0, 1000),
        result: typeof d.result === 'string' ? d.result.trim().slice(0, 1000) : '',
        timestamp: new Date(t).toISOString()
      });
    });
    sortDecisions(out.decisions);
    return out;
  }

  function sortDecisions(list) {
    list.sort(function (a, b) { return Date.parse(a.timestamp) - Date.parse(b.timestamp); });
  }

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOK = false;
      return defaults();
    }
    if (!raw) return null;
    try {
      return normalize(JSON.parse(raw));
    } catch (e) {
      // Keep the unreadable copy instead of silently overwriting it.
      try { localStorage.setItem(STORAGE_KEY + ':corrupt:' + Date.now(), raw); } catch (_) {}
      return defaults();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOK = true;
      return true;
    } catch (e) {
      storageOK = false;
      toast('Couldn’t save. This browser is blocking or out of storage.', { tone: 'error' });
      return false;
    }
  }

  var state = load();
  var firstRun = !state;
  if (!state) {
    state = defaults();
    save(); // pins the start date to the first day the app was opened
  }

  var ui = {
    historyFilter: null,
    historyLimit: HISTORY_PAGE,
    openEntries: Object.create(null),
    cardPick: null,
    introDone: false,
    proofAll: false
  };

  // ── Derived view data ──────────────────────────────────────────────────
  function derive() {
    var now = new Date();
    var health = H.computeHealth(state.categories, state.decisions, now);
    var catByName = Object.create(null);
    state.categories.forEach(function (c) { catByName[c.name] = c; });
    var todayIdx = dayIndex(now);
    var today = 0;
    var numberOf = Object.create(null);
    state.decisions.forEach(function (d, i) {
      numberOf[d.id] = i + 1;
      if (dayIndex(new Date(d.timestamp)) === todayIdx) today++;
    });
    return {
      now: now,
      health: health,
      catByName: catByName,
      today: today,
      numberOf: numberOf,
      total: state.decisions.length,
      day: dayNumber(state.settings.startDate, now),
      patterns: I.patterns(state.categories, state.decisions, now, state.reasons)
    };
  }

  function catColor(v, name) {
    var c = v.catByName[name];
    return c ? c.color : '#A39B8F';
  }

  // ── Mutations ──────────────────────────────────────────────────────────
  function commit(mutate, opts) {
    mutate(state);
    save();
    render(opts || {});
  }

  function addCategory(name, color, rank) {
    var cat = { id: uid(), name: name, color: color || nextColor(state.categories), priorityRank: 0, why: '' };
    var index = clamp((rank || state.categories.length + 1) - 1, 0, state.categories.length);
    state.categories.splice(index, 0, cat);
    reRank();
    return cat;
  }

  function reRank() {
    state.categories.forEach(function (c, i) { c.priorityRank = i + 1; });
  }

  function moveCategory(id, toIndex) {
    var from = state.categories.findIndex(function (c) { return c.id === id; });
    if (from < 0) return;
    var cat = state.categories.splice(from, 1)[0];
    state.categories.splice(clamp(toIndex, 0, state.categories.length), 0, cat);
    reRank();
  }

  function renameCategory(cat, newName) {
    var old = cat.name;
    if (old === newName) return;
    cat.name = newName;
    state.decisions.forEach(function (d) { if (d.categoryName === old) d.categoryName = newName; });
    if (ui.historyFilter === old) ui.historyFilter = newName;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render(opts) {
    opts = opts || {};
    var v = derive();
    renderHero(v, opts);
    renderBalance(v, opts);
    renderPriorities(v);
    renderStats(v);
    renderPulse(v);
    renderProof(v);
    renderPatterns(v);
    renderHistory(v, opts);
    renderSettings();
    scheduleThumb();
    $('.fab').classList.toggle('is-attn', v.today === 0 && state.categories.length > 0);
  }

  function renderHero(v, opts) {
    var goal = state.settings.goal;
    var dayPill = $('#day-pill');
    if (v.day >= 1) dayPill.textContent = 'Day ' + fmtNum(v.day);
    else dayPill.textContent = 'Starts in ' + (1 - v.day) + ' ' + plural(1 - v.day, 'day');
    $('#hero-date').textContent = v.now.toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });

    animateNumber($('#hero-total'), v.total);
    $('#hero-goal').textContent = '/' + fmtNum(goal);
    $('#hero-sr').textContent = v.total + ' of ' + goal + ' decisions';

    var caption;
    if (v.total >= goal) caption = '<b>Goal reached.</b> ' + (v.total > goal ? '+' + fmtNum(v.total - goal) + ' beyond ' + fmtNum(goal) + '.' : 'Every single one counted.');
    else caption = 'decisions made · <b>' + Math.floor((v.total / goal) * 100) + '%</b> of the way · ' + fmtNum(goal - v.total) + ' to go';
    $('#hero-caption').innerHTML = caption;

    $('#topbar-total').textContent = fmtNum(v.total) + '/' + fmtNum(goal);
    $('#topbar-day').textContent = v.day >= 1 ? 'Day ' + fmtNum(v.day) : 'Soon';

    renderDots(v, opts);
    renderKpis(v);
  }

  /** Per-day counts for the last `n` days (oldest first), optionally split by category. */
  function dailySeries(v, n) {
    var todayIdx = dayIndex(v.now);
    var days = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(v.now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d, total: 0, by: Object.create(null) });
    }
    state.decisions.forEach(function (dec) {
      var slot = n - 1 - (todayIdx - dayIndex(new Date(dec.timestamp)));
      if (slot < 0 || slot >= n) return;
      days[slot].total++;
      days[slot].by[dec.categoryName] = (days[slot].by[dec.categoryName] || 0) + 1;
    });
    return days;
  }

  function renderKpis(v) {
    var goal = state.settings.goal;
    var elapsed = Math.max(1, v.day);
    var week = dailySeries(v, 7);
    var active = Object.create(null);
    var startIdx = dayIndex(parseYmd(state.settings.startDate) || v.now);
    state.decisions.forEach(function (d) {
      var k = dayIndex(new Date(d.timestamp));
      if (k >= startIdx) active[k] = true;
    });
    var activeDays = Object.keys(active).length;
    var avg = v.total / elapsed;
    var pace7 = v.health.total7 / 7;
    var remaining = Math.max(0, goal - v.total);
    var finish;
    if (!remaining) finish = { value: 'Done', note: 'Goal reached' };
    else if (!pace7) finish = { value: '—', note: 'Log decisions this week to get a projection' };
    else {
      var daysLeft = Math.ceil(remaining / pace7);
      var date = new Date(v.now);
      date.setDate(date.getDate() + daysLeft);
      finish = {
        value: date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: date.getFullYear() !== v.now.getFullYear() ? 'numeric' : undefined }),
        note: daysLeft + ' days at your 7-day pace of ' + pace7.toFixed(1) + ' a day'
      };
    }
    var maxWeek = Math.max(1, week.reduce(function (m, d) { return Math.max(m, d.total); }, 0));
    var spark = week.map(function (d, i) {
      return '<i class="' + (d.total ? (i === 6 ? 't' : '') : 'z') + '" style="height:' + Math.max(8, (d.total / maxWeek) * 100).toFixed(0) + '%" title="' + d.total + '"></i>';
    }).join('');
    var todayNote = v.today >= Math.ceil(pace7 || 1) ? '<p class="kpi__note is-good">On pace</p>' : '<p class="kpi__note">' + (v.today ? 'Pace is ' + pace7.toFixed(1) + ' a day' : 'One starts the day') + '</p>';
    $('#kpis').innerHTML =
      '<div class="kpi"><dt>Today</dt><dd>' + v.today + '</dd>' + todayNote + '</div>' +
      '<div class="kpi"><dt>Last 7 days</dt><dd>' + v.health.total7 + '</dd><div class="kpi__spark" aria-hidden="true">' + spark + '</div></div>' +
      '<div class="kpi"><dt>Active days</dt><dd>' + activeDays + '<small>of ' + Math.max(0, v.day) + '</small></dd><p class="kpi__note">' + (v.day > 0 ? Math.round((activeDays / elapsed) * 100) + '% consistency' : 'Starts soon') + '</p></div>' +
      '<div class="kpi"><dt>Daily average</dt><dd>' + avg.toFixed(1) + '</dd><p class="kpi__note">since Day 1</p></div>' +
      '<div class="kpi kpi--wide"><dt>Projected finish</dt><dd>' + esc(finish.value) + '</dd><p class="kpi__note">' + esc(finish.note) + '</p></div>';
  }

  // ── Statistics ─────────────────────────────────────────────────────────
  function niceMax(n) {
    if (n <= 5) return Math.max(1, n);
    var steps = [5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= n) return steps[i];
    return Math.ceil(n / 50) * 50;
  }

  function renderStats(v) {
    var daily = $('#chart-daily');
    var share = $('#chart-share');
    if (!state.categories.length || !v.total) {
      daily.innerHTML = '<p class="chart-empty">Your daily record appears here after your first decision.</p>';
      share.innerHTML = '<p class="chart-empty">Shows each priority’s share of the week against its target.</p>';
      return;
    }
    // Stacked columns, last 30 days.
    var days = dailySeries(v, 30);
    var W = 640, CH = 220, L = 30, R = 8, T = 10, B = 26;
    var max = niceMax(days.reduce(function (m, d) { return Math.max(m, d.total); }, 0));
    var cw = (W - L - R) / days.length;
    var bw = Math.max(4, cw * 0.66);
    function y(val) { return T + (CH - T - B) * (1 - val / max); }
    var out = [];
    [0, 0.5, 1].forEach(function (f) {
      var val = Math.round(max * f);
      out.push('<line class="' + (f ? 'grid' : 'axis') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(val).toFixed(1) + '" y2="' + y(val).toFixed(1) + '"/>');
      out.push('<text x="' + (L - 8) + '" y="' + (y(val) + 4).toFixed(1) + '" text-anchor="end">' + val + '</text>');
    });
    days.forEach(function (d, i) {
      var x = L + i * cw + (cw - bw) / 2;
      var acc = 0;
      state.categories.forEach(function (c) {
        var n = d.by[c.name] || 0;
        if (!n) return;
        var y1 = y(acc + n), y0 = y(acc);
        out.push('<rect x="' + x.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y0 - y1 - 1).toFixed(1) + '" fill="' + c.color + '"><title>' + esc(c.name) + ': ' + n + '</title></rect>');
        acc += n;
      });
      var isToday = i === days.length - 1;
      if (i % 5 === 4 || isToday || i === 0) {
        out.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (CH - 8) + '" text-anchor="middle"' + (isToday ? ' style="fill:var(--ink);font-weight:700"' : '') + '>' + (isToday ? 'Today' : d.date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })) + '</text>');
      }
    });
    var avg7 = v.health.total7 / 7;
    if (avg7 > 0) {
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(avg7).toFixed(1) + '" y2="' + y(avg7).toFixed(1) + '" stroke="#B08D3C" stroke-width="2" stroke-dasharray="6 4"/>');
      out.push('<text x="' + (W - R) + '" y="' + (y(avg7) - 6).toFixed(1) + '" text-anchor="end" style="fill:#8C6A24;font-weight:700">7-day avg ' + avg7.toFixed(1) + '</text>');
    }
    daily.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + CH + '" role="img" aria-label="Decisions per day for the last 30 days, stacked by category">' + out.join('') + '</svg>' +
      '<div class="chart__legend">' + state.categories.map(function (c) { return '<span><i style="background:' + c.color + '"></i>' + esc(c.name) + '</span>'; }).join('') + '</div>';

    // Attention vs target.
    if (!v.health.total7) {
      share.innerHTML = '<p class="chart-empty">No decisions in the last 7 days. Every priority is on hold.</p>';
      return;
    }
    var top = Math.min(1, Math.max.apply(null, v.health.list.map(function (h) { return Math.max(h.actualShare, h.targetShare * H.BAND_HIGH); })) * 1.1);
    share.innerHTML = '<div class="share-rows">' + state.categories.map(function (c) {
      var h = v.health.byName[c.name];
      var col = H.colorsFor(h);
      return '<div class="share-row" style="--c:' + c.color + ';--fill:' + col.fill + '">' +
        '<div class="share-row__head"><span><i></i><b>' + esc(c.name) + '</b></span><em>' + pct(h.actualShare) + ' <span style="color:var(--ink-4);font-weight:600">/ ' + pct(h.targetShare) + '</span></em></div>' +
        '<div class="share-row__track"><div class="share-row__fill" style="width:' + ((h.actualShare / top) * 100).toFixed(1) + '%"></div><div class="share-row__target" style="left:' + ((h.targetShare / top) * 100).toFixed(1) + '%"></div></div>' +
        '</div>';
    }).join('') + '</div>' +
      '<div class="chart__legend"><span><i style="background:var(--ink-2)"></i>Actual share (colored by health)</span><span><i class="target" style="width:2px;height:12px;border:0;background:var(--ink)"></i>Target</span></div>';
  }

  // ── Pulse: one insight line + the optional one-tap question ───────────
  function questionFor(v) {
    var q = v.patterns.yesterdayQuiet;
    if (!q) return null;
    var today = ymd(v.now);
    var y = new Date(v.now);
    y.setDate(y.getDate() - 1);
    var yKey = ymd(y);
    var pr = state.prompt;
    if (pr.pausedUntil && pr.pausedUntil > today) return null;
    if (state.reasons.some(function (r) { return r.date === yKey; })) return null;
    if (pr.dismissedOn === today) return null;
    if (pr.lastAsked !== today) {
      // A new day: count the previous question as ignored if it went unanswered.
      if (pr.lastAsked && pr.askedFor && pr.dismissedOn !== pr.lastAsked && !state.reasons.some(function (r) { return r.date === pr.askedFor; })) pr.ignored++;
      if (pr.ignored >= 3) {
        var until = new Date(v.now);
        until.setDate(until.getDate() + 7);
        pr.pausedUntil = ymd(until);
        pr.ignored = 0;
        save();
        return null;
      }
      pr.lastAsked = today;
      pr.askedFor = yKey;
      save();
    }
    return { date: yKey, window: q.window, text: q.text };
  }

  function renderPulse(v) {
    var el = $('#pulse');
    var line = I.topLine(v.patterns, v.now);
    var q = questionFor(v);
    if (!line && !q) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var html = '';
    if (line) {
      var cat = line.category && v.catByName[line.category];
      html += '<div class="pulse__line pulse__line--' + line.tone + '">' +
        '<span class="pulse__mark" aria-hidden="true"></span>' +
        '<p><b>' + esc(line.label) + '.</b> ' + esc(line.text) +
        (cat && cat.why ? ' <em>“' + esc(cat.why) + '”</em>' : '') + '</p>' +
        (cat ? '<button type="button" class="btn btn--soft pulse__cta" data-action="log-category" data-name="' + esc(cat.name) + '">Log ' + esc(cat.name) + '</button>' : '') +
        '</div>';
    }
    if (q) {
      html += '<div class="pulse__ask" data-date="' + q.date + '" data-window="' + q.window + '">' +
        '<p>' + esc(q.text) + ' <span>What pulled you away?</span></p>' +
        '<div class="pulse__answers">' + REASONS.map(function (r) {
          return '<button type="button" class="chip" data-action="reason" data-answer="' + r[0] + '">' + esc(r[1]) + '</button>';
        }).join('') +
        '<button type="button" class="icon-btn" data-action="reason-dismiss" aria-label="Dismiss">' + icon('close') + '</button></div>' +
        '</div>';
    }
    el.innerHTML = html;
    el.hidden = false;
  }

  // ── Proof wall ─────────────────────────────────────────────────────────
  function renderProof(v) {
    var body = $('#proof-body');
    var p = I.proof(state.categories, state.decisions);
    $('#proof-count').textContent = fmtNum(p.total);
    if (!p.total) {
      body.innerHTML = '<p class="chart-empty">Results appear here. Next time you log a decision, add what happened. That’s the proof.</p>';
      return;
    }
    var rows = p.rows.filter(function (r) { return r.count; });
    var shown = p.results.slice(0, ui.proofAll ? 40 : 5);
    body.innerHTML =
      '<div class="proof__rows">' + rows.map(function (r) {
        var c = v.catByName[r.name];
        return '<div class="proof__row" style="--c:' + (c ? c.color : '#999') + '">' +
          '<span class="proof__cat"><i></i>' + esc(r.name) + '</span>' +
          '<span class="proof__big">' + esc(r.headline) + '</span>' +
          '<span class="proof__sub">' + (r.headline.indexOf('result') === -1 ? 'from ' + r.count + ' ' + plural(r.count, 'result') : '“' + esc(r.latest.result) + '”') + '</span>' +
          '</div>';
      }).join('') + '</div>' +
      '<p class="proof__label">Latest</p>' +
      '<ul class="proof__list">' + shown.map(function (d) {
        return '<li><span class="proof__result">→ ' + esc(d.result) + '</span><span class="proof__meta">' + esc(d.categoryName) + ' · ' + esc(fmtShort(new Date(d.timestamp), v.now)) + '</span></li>';
      }).join('') + '</ul>' +
      (p.total > 5 ? '<button type="button" class="btn btn--soft btn--block" data-action="proof-toggle">' + (ui.proofAll ? 'Show less' : 'Show all ' + fmtNum(p.total) + ' results') + '</button>' : '');
  }

  // ── Patterns ───────────────────────────────────────────────────────────
  var REASON_LABEL = { phone: 'Phone', tired: 'Tired', stress: 'Stress', busy: 'Busy' };

  function heatmapSvg(pt) {
    var H0 = 6, cols = 18, cw = 26, ch = 22, gap = 3, left = 38, top = 4;
    var max = 0;
    pt.heat.forEach(function (row) { for (var h = H0; h < 24; h++) max = Math.max(max, row[h]); });
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var W = left + cols * (cw + gap), Hh = top + 7 * (ch + gap) + 20;
    var out = [];
    pt.heat.forEach(function (row, r) {
      out.push('<text x="0" y="' + (top + r * (ch + gap) + ch * 0.7) + '">' + days[r] + '</text>');
      for (var h = H0; h < 24; h++) {
        var n = row[h];
        var a = n ? 0.15 + 0.85 * (n / max) : 0;
        out.push('<rect x="' + (left + (h - H0) * (cw + gap)) + '" y="' + (top + r * (ch + gap)) + '" width="' + cw + '" height="' + ch + '" rx="2" fill="' + (n ? 'rgba(17,19,21,' + a.toFixed(2) + ')' : 'var(--surface-3)') + '"><title>' + days[r] + ' ' + I.hourLabel(h) + ': ' + n + '</title></rect>');
      }
    });
    if (pt.strongest && pt.ready) {
      var sx = left + (Math.max(H0, pt.strongest.start) - H0) * (cw + gap) - 2;
      out.push('<rect x="' + sx + '" y="' + (top - 2) + '" width="' + (3 * (cw + gap) + 1) + '" height="' + (7 * (ch + gap) + 1) + '" fill="none" stroke="#B08D3C" stroke-width="2.5" rx="3"/>');
    }
    [6, 9, 12, 15, 18, 21].forEach(function (h) {
      out.push('<text x="' + (left + (h - H0) * (cw + gap)) + '" y="' + (Hh - 4) + '">' + I.hourLabel(h) + '</text>');
    });
    return '<svg class="heat" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Decisions by weekday and hour, last 8 weeks">' + out.join('') + '</svg>';
  }

  function renderPatterns(v) {
    var body = $('#patterns-body');
    var pt = v.patterns;
    if (!state.decisions.length) {
      body.innerHTML = '<p class="chart-empty">After two weeks of logging, this shows your strongest hours, your quiet windows and what pulls you away.</p>';
      return;
    }
    var html = '';
    if (!pt.ready) {
      var pd = pt.progress;
      html += '<div class="learning"><p class="learning__title">Learning your rhythm</p>' +
        '<div class="learning__row"><span>Days</span><span class="learning__bar"><i style="width:' + (pd.days / pd.needDays * 100).toFixed(0) + '%"></i></span><b>' + pd.days + ' of ' + pd.needDays + '</b></div>' +
        '<div class="learning__row"><span>Decisions</span><span class="learning__bar"><i style="width:' + (pd.decisions / pd.needDecisions * 100).toFixed(0) + '%"></i></span><b>' + pd.decisions + ' of ' + pd.needDecisions + '</b></div>' +
        '<p class="learning__note">Insights stay off until then, so they’re based on your real rhythm, not a guess.</p></div>';
    }
    html += '<div class="heat-wrap">' + heatmapSvg(pt) + '</div>';
    if (pt.ready) {
      var silences = pt.categories.slice().sort(function (a, b) { return a.priorityRank - b.priorityRank; }).slice(0, 3)
        .map(function (c) { return esc(c.name) + ' ' + (c.longestSilence ? c.longestSilence + ' ' + plural(c.longestSilence, 'day') : 'none'); }).join(' · ');
      html += '<dl class="facts">' +
        (pt.strongest ? '<div><dt>Strongest hours</dt><dd>' + esc(pt.strongest.label) + '</dd><p>' + Math.round(pt.strongest.share * 100) + '% of your decisions</p></div>' : '') +
        (pt.quietest ? '<div><dt>Quietest window</dt><dd>' + esc(pt.quietest.label) + '</dd><p>' + Math.round(pt.quietest.share * 100) + '% of your decisions</p></div>' : '') +
        '<div><dt>Longest silence</dt><dd class="facts__small">' + silences + '</dd><p>last 60 days, top priorities</p></div>' +
        '<div><dt>What pulls you away</dt><dd>' + (pt.reasons ? esc(REASON_LABEL[pt.reasons.top] || pt.reasons.top) : '—') + '</dd><p>' + (pt.reasons ? pt.reasons.count + ' of ' + pt.reasons.of + ' quiet periods' : 'Answer the one-tap question to learn this') + '</p></div>' +
        '</dl>';
    }
    body.innerHTML = html;
  }

  function renderDots(v, opts) {
    var goal = state.settings.goal;
    var host = $('#dots');
    var legend = $('#dots-legend');
    if (goal > 3000) {
      host.innerHTML = '<div class="progress" role="img" aria-label="' + v.total + ' of ' + goal + '"><i style="width:' + Math.min(100, (v.total / goal) * 100).toFixed(2) + '%"></i></div>';
      legend.innerHTML = '';
      return;
    }
    var width = 548;
    var grid = Card.dotGrid(goal, width, 12);
    var r = +(grid.pitch * 0.36).toFixed(2);
    var todayIdx = dayIndex(v.now);
    var n = Math.min(v.total, goal);
    var out = [];
    for (var i = 0; i < goal; i++) {
      var p = grid.position(i);
      var cx = +(p.x + grid.pitch / 2).toFixed(2);
      var cy = +(p.y + grid.pitch / 2).toFixed(2);
      if (i < n) {
        var d = state.decisions[i];
        var cls = [];
        if (opts.justAdded && d.id === opts.justAdded) cls.push('pop');
        var isToday = dayIndex(new Date(d.timestamp)) === todayIdx;
        out.push('<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="0.6" fill="' + (isToday ? DOT_TODAY : DOT_INK) + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '/>');
      } else {
        out.push('<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="0.6" class="e"/>');
      }
    }
    host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + grid.height.toFixed(2) + '" role="img" aria-label="' + n + ' of ' + goal + ' squares filled, one per decision">' + out.join('') + '</svg>';
    legend.innerHTML = '<span><i style="background:' + DOT_INK + '"></i>Logged</span><span><i style="background:' + DOT_TODAY + '"></i>Today</span><span>1 square = 1 decision · 100 per block</span>';
  }

  function animateNumber(el, to) {
    var from = Number(el.dataset.value) || 0;
    el.dataset.value = to;
    if (from === to || reducedMotion()) {
      el.textContent = fmtNum(to);
      return;
    }
    var t0 = performance.now();
    var dur = Math.min(900, 380 + Math.abs(to - from) * 4);
    cancelAnimationFrame(el._raf);
    function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtNum(Math.round(from + (to - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  }

  function whyOf(name) {
    var c = findCategory(state.categories, name);
    return c && c.why ? c.why : '';
  }

  function isRed(name) {
    var h = H.computeHealth(state.categories, state.decisions, new Date()).byName[name];
    return !!h && h.status === 'neglected';
  }

  function whyPlaceholder(name) {
    var n = (name || '').toLowerCase();
    if (/gym|train|fit|workout|sport|run|body/.test(n)) return 'e.g. so I’m still strong at 60';
    if (/money|financ|spend|save|budget|wealth/.test(n)) return 'e.g. so I never depend on anyone';
    if (/work|deep|focus|business|career|study|learn|read/.test(n)) return 'e.g. so my work speaks for itself';
    if (/family|kid|son|daughter|wife|partner|friend|love/.test(n)) return 'e.g. so they remember me as present';
    if (/health|sleep|food|diet|eat/.test(n)) return 'e.g. so I have energy for what matters';
    if (/peace|calm|mind|mental|stress/.test(n)) return 'e.g. so I respond instead of react';
    return 'e.g. so I become the man I said I would be';
  }

  // Balance: insight + bars
  function insightFor(v) {
    var list = v.health.list;
    if (!list.length) return null;
    if (!v.health.total7) {
      return {
        tone: 'idle', icon: 'clock',
        title: 'Nothing logged in the last 7 days',
        text: 'Every bar stays grey until your next decision. Log one and the record starts again.'
      };
    }
    var neglected = list.filter(function (h) { return h.status === 'neglected'; }).sort(function (a, b) { return a.priorityRank - b.priorityRank; });
    var over = list.filter(function (h) { return h.status === 'over'; }).sort(function (a, b) { return b.ratio - a.ratio; });
    var overNote = over.length ? ' Meanwhile ' + over[0].name + ' is at ' + pct(over[0].actualShare) + '.' : '';
    if (neglected.length && neglected[0].priorityRank === 1) {
      var u = neglected[0];
      return {
        tone: 'urgent', icon: 'alert',
        why: whyOf(u.name),
        title: u.name + ' is your #1 priority, and it’s being neglected',
        text: 'It got ' + pct(u.actualShare) + ' of this week’s decisions. It should get about ' + pct(u.targetShare) + '.' + overNote
      };
    }
    if (neglected.length) {
      var n = neglected[0];
      var more = neglected.length > 1 ? ' ' + (neglected.length - 1) + ' more ' + plural(neglected.length - 1, 'priority', 'priorities') + ' also behind.' : '';
      return {
        tone: 'neglected', icon: 'down',
        why: whyOf(n.name),
        title: n.name + ' (#' + n.priorityRank + ') is falling behind',
        text: pct(n.actualShare) + ' of this week’s decisions vs. a ' + pct(n.targetShare) + ' target.' + more + overNote
      };
    }
    if (over.length) {
      var o = over[0];
      return {
        tone: 'over', icon: 'up',
        title: o.name + ' is getting more than its share',
        text: pct(o.actualShare) + ' of this week’s decisions vs. a ' + pct(o.targetShare) + ' target. Is something harder being avoided?'
      };
    }
    return {
      tone: 'balanced', icon: 'check',
      title: 'Every priority is balanced',
      text: 'Your attention matches your priorities this week. Hold the line.'
    };
  }

  function barContent(c, h, rankLabel) {
    return '<span class="bar__dot" style="--c:' + c.color + '"></span>' +
      '<span class="bar__name">' + esc(c.name) + '</span>' +
      '<span class="bar__rank">' + rankLabel + '</span>' +
      '<span class="bar__count">' + fmtNum(h.total) + '</span>' +
      icon(STATUS_ICON[h.status], 'bar__icon');
  }

  function renderBalance(v, opts) {
    var bars = $('#bars');
    var insightEl = $('#insight');
    var legend = $('#legend');
    $('#balance-foot').hidden = !state.categories.length;
    if (!state.categories.length) {
      insightEl.hidden = true;
      legend.hidden = true;
      $('#suggest-more').hidden = true;
      bars.innerHTML =
        '<div class="onboard">' +
        '<p class="onboard__title">Start with your priorities</p>' +
        '<p class="onboard__text">Choose the areas of your life you intend to take control of. Add them in order of importance: the first becomes your #1 priority.</p>' +
        '<div class="suggest">' +
        SUGGESTED.map(function (name, i) {
          return '<button type="button" data-action="quick-category" data-name="' + esc(name) + '" style="--c:' + PALETTE[i % PALETTE.length] + '"><i></i>' + esc(name) + '</button>';
        }).join('') +
        '<button type="button" class="is-custom" data-action="new-category">+ Your own</button>' +
        '</div></div>';
      return;
    }
    legend.hidden = false;

    var ins = insightFor(v);
    if (ins) {
      var key = ins.tone + '|' + ins.title + '|' + ins.text + '|' + (ins.why || '');
      if (insightEl.dataset.key !== key) {
        insightEl.dataset.key = key;
        insightEl.className = 'insight insight--' + ins.tone;
        insightEl.innerHTML = '<span class="insight__icon">' + icon(ins.icon) + '</span><div><p class="insight__title">' + esc(ins.title) + '</p><p class="insight__text">' + esc(ins.text) + '</p>' + (ins.why ? '<p class="why">“' + esc(ins.why) + '”</p>' : '') + '</div>';
      }
      insightEl.hidden = false;
    } else insightEl.hidden = true;

    var max = v.health.list.reduce(function (m, h) { return Math.max(m, h.total); }, 0);
    $$('.onboard', bars).forEach(function (n) { n.remove(); });
    var existing = Object.create(null);
    $$('.bar', bars).forEach(function (b) { existing[b.dataset.id] = b; });
    state.categories.forEach(function (c, i) {
      var h = v.health.byName[c.name];
      var col = H.colorsFor(h);
      var d = H.describe(h);
      var el = existing[c.id];
      delete existing[c.id];
      if (!el) {
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.action = 'detail';
        el.dataset.id = c.id;
        el.innerHTML = '<span class="bar__row" aria-hidden="true"></span><span class="bar__row bar__row--fill" aria-hidden="true"></span>';
      }
      el.dataset.name = c.name;
      el.className = 'bar is-' + h.status + (h.urgent ? ' is-urgent' : '');
      var w = max ? (h.total / max) * 100 : 0;
      el.style.setProperty('--fill', col.fill);
      el.style.setProperty('--track', col.track);
      el.style.setProperty('--on', col.onFill);
      el.style.setProperty('--w', w.toFixed(2) + '%');
      el.style.setProperty('--minw', h.total ? '3.6rem' : '0px');
      el.style.setProperty('--i', i);
      el.setAttribute('aria-label', c.name + ', priority ' + c.priorityRank + ', ' + h.total + ' ' + plural(h.total, 'decision') + ' all time. ' + d.label + '. Open details.');
      var content = barContent(c, h, '#' + c.priorityRank);
      if (el.firstChild.innerHTML !== content) {
        el.firstChild.innerHTML = content;
        el.lastChild.innerHTML = content;
      }
      if (bars.children[i] !== el) bars.insertBefore(el, bars.children[i] || null);
    });
    Object.keys(existing).forEach(function (k) { existing[k].remove(); });

    if (!ui.introDone) {
      ui.introDone = true;
      bars.classList.add('is-intro');
      setTimeout(function () { bars.classList.remove('is-intro'); }, 1800);
    }

    var more = $('#suggest-more');
    var unused = SUGGESTED.filter(function (s) { return !findCategory(state.categories, s); });
    if (state.categories.length < 3 && unused.length) {
      more.hidden = false;
      more.innerHTML = '<p class="suggest-more__label">Add more priorities</p><div class="suggest">' +
        unused.slice(0, 5).map(function (name, i) {
          return '<button type="button" data-action="quick-category" data-name="' + esc(name) + '" style="--c:' + PALETTE[(state.categories.length + i) % PALETTE.length] + '"><i></i>' + esc(name) + '</button>';
        }).join('') +
        '<button type="button" class="is-custom" data-action="new-category">+ Your own</button></div>';
    } else {
      more.hidden = true;
      more.innerHTML = '';
    }
  }

  // Priorities
  function renderPriorities(v) {
    var list = $('#prio-list');
    var n = state.categories.length;
    var sum = (n * (n + 1)) / 2;
    if (!n) {
      list.innerHTML = '<li class="empty"><div class="empty__art" aria-hidden="true">' + new Array(15).join('<i></i>') + '</div><strong>No categories yet</strong><span>Create one to start logging decisions.</span></li>';
      return;
    }
    list.innerHTML = state.categories.map(function (c, i) {
      var h = v.health.byName[c.name];
      var col = H.colorsFor(h);
      var target = (n - i) / sum;
      return '<li class="prio__row" data-id="' + c.id + '">' +
        '<button type="button" class="prio__handle" aria-label="Reorder ' + esc(c.name) + '. Position ' + (i + 1) + ' of ' + n + '. Use arrow keys to move.">' + icon('grip') + '</button>' +
        '<span class="prio__rank">' + (i + 1) + '</span>' +
        '<div class="prio__main">' +
        '<span class="prio__name"><i class="prio__dot" style="--c:' + c.color + '"></i><span>' + esc(c.name) + '</span></span>' +
        '<span class="prio__target"><span class="prio__meter"><i style="width:' + (target * 100).toFixed(1) + '%"></i></span><span class="prio__pct">Target ' + pct(target) + '</span></span>' +
        '</div>' +
        '<span class="prio__status" style="background:' + col.fill + '" title="' + esc(H.describe(h).short) + '"></span>' +
        '<button type="button" class="icon-btn" data-action="edit-category" data-id="' + c.id + '" aria-label="Edit ' + esc(c.name) + '">' + icon('edit') + '</button>' +
        '</li>';
    }).join('');
  }

  /** While dragging, show the targets the new order would produce. */
  function previewTargets(rows, from, to) {
    var order = rows.slice();
    var moved = order.splice(from, 1)[0];
    order.splice(to, 0, moved);
    var n = order.length;
    var sum = (n * (n + 1)) / 2;
    order.forEach(function (row, k) {
      var target = (n - k) / sum;
      $('.prio__rank', row).textContent = k + 1;
      $('.prio__meter i', row).style.width = (target * 100).toFixed(1) + '%';
      $('.prio__pct', row).textContent = 'Target ' + pct(target);
    });
  }

  // History
  function renderHistory(v, opts) {
    var filters = $('#history-filters');
    var timeline = $('#timeline');
    var more = $('#history-more');
    $('#history-count').textContent = fmtNum(v.total);

    if (ui.historyFilter && !v.catByName[ui.historyFilter]) ui.historyFilter = null;

    var counts = Object.create(null);
    state.decisions.forEach(function (d) { counts[d.categoryName] = (counts[d.categoryName] || 0) + 1; });
    if (state.categories.length && v.total) {
      filters.hidden = false;
      filters.innerHTML =
        '<button type="button" class="chip" data-action="history-filter" data-name="" aria-pressed="' + (!ui.historyFilter) + '">All <b>' + fmtNum(v.total) + '</b></button>' +
        state.categories.map(function (c) {
          return '<button type="button" class="chip" data-action="history-filter" data-name="' + esc(c.name) + '" aria-pressed="' + (ui.historyFilter === c.name) + '" style="--c:' + c.color + '"><i></i>' + esc(c.name) + ' <b>' + fmtNum(counts[c.name] || 0) + '</b></button>';
        }).join('');
    } else {
      filters.hidden = true;
    }

    var items = [];
    for (var i = state.decisions.length - 1; i >= 0; i--) {
      var d = state.decisions[i];
      if (!ui.historyFilter || d.categoryName === ui.historyFilter) items.push(d);
    }

    if (!items.length) {
      timeline.innerHTML = '<div class="empty"><div class="empty__art" aria-hidden="true">' + new Array(16).join('<i></i>') + '</div><strong>' +
        (v.total ? 'Nothing in this category yet' : 'Your first decision will appear here') + '</strong><span>' +
        (v.total ? 'Log one with Log decision.' : 'Press N or click Log decision. It takes ten seconds.') + '</span></div>';
      more.hidden = true;
      return;
    }

    var shown = items.slice(0, ui.historyLimit);
    var perDay = Object.create(null);
    items.forEach(function (d) {
      var k = dayIndex(new Date(d.timestamp));
      perDay[k] = (perDay[k] || 0) + 1;
    });
    var html = '';
    var lastDay = null;
    var group = [];
    function flush() {
      if (!group.length) return;
      html += '<h3 class="day-head">' + esc(fmtDayHeading(new Date(group[0].timestamp), v.now)) + ' <b>' + perDay[lastDay] + '</b></h3><ul class="entries">' + group.map(function (d) { return entryHtml(d, v, opts); }).join('') + '</ul>';
      group = [];
    }
    shown.forEach(function (d) {
      var di = dayIndex(new Date(d.timestamp));
      if (di !== lastDay) {
        flush();
        lastDay = di;
      }
      group.push(d);
    });
    flush();
    timeline.innerHTML = html;
    more.hidden = items.length <= shown.length;
    if (!more.hidden) more.textContent = 'Show more (' + fmtNum(items.length - shown.length) + ' older)';
  }

  function entryHtml(d, v, opts) {
    var date = new Date(d.timestamp);
    var open = !!ui.openEntries[d.id];
    var isNew = opts.justAdded === d.id;
    return '<li class="entry' + (open ? ' is-open' : '') + (isNew ? ' is-new' : '') + '" data-id="' + d.id + '">' +
      '<button type="button" class="entry__main" data-action="toggle-entry" aria-expanded="' + open + '">' +
      '<span class="entry__bar" style="--c:' + catColor(v, d.categoryName) + '"></span>' +
      '<span class="entry__meta"><span class="entry__cat">' + esc(d.categoryName) + '</span><span>' + esc(fmtTime(date)) + '</span></span>' +
      '<span class="entry__num">#' + fmtNum(v.numberOf[d.id]) + '</span>' +
      '<span class="entry__text">' + esc(d.text) + '</span>' +
      (d.result ? '<span class="entry__result">' + esc(d.result) + '</span>' : '') +
      '</button>' +
      '<div class="entry__more">' +
      '<p class="entry__when">Decision #' + fmtNum(v.numberOf[d.id]) + ' · ' + esc(fmtLong(date)) + '</p>' +
      '<div class="entry__actions">' +
      '<button type="button" class="btn btn--soft" data-action="edit-decision" data-id="' + d.id + '">' + icon('edit') + 'Edit</button>' +
      '<button type="button" class="btn btn--danger-soft" data-action="delete-decision" data-id="' + d.id + '">' + icon('trash') + 'Delete</button>' +
      '</div></div></li>';
  }

  function renderSettings() {
    var form = $('#settings-form');
    var s = state.settings;
    var goal = fld(form, 'goal');
    var start = fld(form, 'startDate');
    var sig = fld(form, 'signature');
    fld(form, 'showWhyOnCard').checked = !!s.showWhyOnCard;
    if (document.activeElement !== goal) goal.value = s.goal;
    if (document.activeElement !== start) start.value = s.startDate;
    if (document.activeElement !== sig) sig.value = s.signature;
    start.max = ymd(new Date(Date.now() + 365 * 86400000));
    var hint = $('#backup-hint');
    if (!storageOK) hint.textContent = 'Storage is blocked in this browser, so nothing will be kept after you close it. Export a backup now.';
    else if (s.lastBackupAt) {
      var days = dayIndex(new Date()) - dayIndex(new Date(s.lastBackupAt));
      hint.textContent = 'Your data lives only in this browser. Last backup: ' + (days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago') + '.';
    } else hint.textContent = 'Your data lives only in this browser. Export a backup now and then, and before switching phones.';
  }

  // ── Share thumbnail ────────────────────────────────────────────────────
  var thumbTimer = 0;
  var thumbVisible = false;
  function scheduleThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(function () {
      if (!thumbVisible) return;
      Card.ensureFonts().then(function () { Card.render($('#share-thumb'), cardModel(derive(), null)); });
    }, 250);
  }

  function cardModel(v, pickId) {
    var todayIdx = dayIndex(v.now);
    var todays = state.decisions.filter(function (d) { return dayIndex(new Date(d.timestamp)) === todayIdx; });
    var pick = pickId ? todays.find(function (d) { return d.id === pickId; }) : null;
    if (!pick) pick = autoStandout(todays, v);
    return {
      day: v.day >= 1 ? v.day : null,
      dateLabel: v.now.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' }),
      total: v.total,
      goal: state.settings.goal,
      todayCount: v.today,
      dots: state.decisions.slice(0, Math.min(state.settings.goal, 1000)).map(function (d) { return dayIndex(new Date(d.timestamp)) === todayIdx ? DOT_TODAY : DOT_INK; }),
      bars: state.categories.map(function (c) {
        var h = v.health.byName[c.name];
        var col = H.colorsFor(h);
        return { name: c.name, color: c.color, total: h.total, status: h.status, fill: col.fill, track: col.track, onFill: col.onFill };
      }),
      standout: pick ? { id: pick.id, text: pick.text, result: pick.result, categoryName: pick.categoryName, color: catColor(v, pick.categoryName), number: v.numberOf[pick.id], why: state.settings.showWhyOnCard ? whyOf(pick.categoryName) : '' } : null,
      signature: (state.settings.signature || '').trim()
    };
  }

  /** Today's standout: prefer decisions with a result, then higher priority, then the latest. */
  function autoStandout(todays, v) {
    function rank(d) { var c = v.catByName[d.categoryName]; return c ? c.priorityRank : 99; }
    return todays.slice().sort(function (a, b) {
      return (b.result ? 1 : 0) - (a.result ? 1 : 0) || rank(a) - rank(b) || Date.parse(b.timestamp) - Date.parse(a.timestamp);
    })[0] || null;
  }

  // ── Toasts & announcements ─────────────────────────────────────────────
  var toastTimer = 0;
  function toast(message, opts) {
    opts = opts || {};
    var host = $('#toasts');
    clearTimeout(toastTimer);
    host.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast' + (opts.tone ? ' toast--' + opts.tone : '');
    if (opts.color) el.style.setProperty('--c', opts.color);
    el.innerHTML = (opts.color ? '<span class="toast__dot"></span>' : '') +
      '<span class="toast__msg">' + esc(message) + (opts.sub ? '<small>' + esc(opts.sub) + '</small>' : '') + '</span>' +
      '';
    var actions = opts.actions || (opts.action ? [opts.action] : []);
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.label;
      b.addEventListener('click', function () {
        dismiss();
        a.run();
      });
      el.appendChild(b);
    });
    if (actions.length) opts.action = actions[0];
    host.appendChild(el);
    function dismiss() {
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }
    toastTimer = setTimeout(dismiss, opts.duration || (opts.action ? 5200 : 3200));
  }

  var srLive;
  function announce(msg) {
    if (!srLive) {
      srLive = document.createElement('div');
      srLive.className = 'sr-only';
      srLive.setAttribute('aria-live', 'assertive');
      document.body.appendChild(srLive);
    }
    srLive.textContent = '';
    setTimeout(function () { srLive.textContent = msg; }, 30);
  }

  // ── Sheet (bottom sheet / modal) ───────────────────────────────────────
  var sheetEl = $('#sheet');
  var sheetBody = $('#sheet-body');
  var sheetReturnFocus = null;
  var sheetCloseTimer = 0;
  var sheetOnClose = null;

  var sheetClosing = false;

  function openSheet(build, opts) {
    opts = opts || {};
    clearTimeout(sheetCloseTimer);
    sheetClosing = false;
    if (!sheetEl.open) sheetReturnFocus = document.activeElement;
    sheetEl.className = 'sheet ' + (opts.className || '');
    sheetEl.setAttribute('aria-label', opts.label || 'Panel');
    sheetOnClose = opts.onClose || null;
    sheetBody.innerHTML = '';
    build(sheetBody);
    if (!sheetEl.open) {
      sheetEl.showModal();
      document.documentElement.classList.add('is-locked');
      $('.sheet__panel', sheetEl).scrollTop = 0;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { sheetEl.classList.add('is-open'); });
      });
    } else sheetEl.classList.add('is-open');
    if (opts.focus) opts.focus();
  }

  function closeSheet() {
    if (!sheetEl.open || sheetClosing) return;
    sheetClosing = true;
    sheetEl.classList.remove('is-open');
    sheetEl.style.removeProperty('--drag');
    var cb = sheetOnClose;
    sheetOnClose = null;
    sheetCloseTimer = setTimeout(function () {
      sheetClosing = false;
      sheetEl.close();
      document.documentElement.classList.remove('is-locked');
      sheetBody.innerHTML = '';
      if (sheetReturnFocus && document.contains(sheetReturnFocus)) {
        try { sheetReturnFocus.focus({ preventScroll: true }); } catch (e) {}
      }
      if (cb) cb();
    }, reducedMotion() ? 0 : 320);
  }

  sheetEl.addEventListener('cancel', function (e) {
    e.preventDefault();
    closeSheet();
  });
  sheetEl.addEventListener('click', function (e) {
    if (e.target.closest('[data-close], [data-sheet="close"]')) closeSheet();
  });

  // Swipe down on the grab handle / header to dismiss (touch).
  (function initSheetDrag() {
    var startY = 0, dy = 0, dragging = false, target = null;
    sheetEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (!e.target.closest('.sheet__grab, .sheet__head')) return;
      if (e.target.closest('button, input, select, textarea, a')) return;
      if ($('.sheet__panel', sheetEl).scrollTop > 0) return;
      dragging = true;
      startY = e.clientY;
      dy = 0;
      target = e.target;
      try { target.setPointerCapture(e.pointerId); } catch (_) {}
      sheetEl.classList.add('is-dragging');
    });
    sheetEl.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheetEl.style.setProperty('--drag', dy + 'px');
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      sheetEl.classList.remove('is-dragging');
      if (dy > 110) closeSheet();
      else sheetEl.style.removeProperty('--drag');
    }
    sheetEl.addEventListener('pointerup', end);
    sheetEl.addEventListener('pointercancel', end);
  })();

  // Keep sheets above the on-screen keyboard (iOS Safari).
  if (window.visualViewport) {
    var vv = window.visualViewport;
    var updateKb = function () {
      var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', (kb > 60 ? kb : 0) + 'px');
    };
    vv.addEventListener('resize', updateKb);
    vv.addEventListener('scroll', updateKb);
  }

  function sheetHead(title, sub, opts) {
    opts = opts || {};
    return '<div class="sheet__head">' +
      (opts.back ? '<button type="button" class="icon-btn back" data-sheet="back" aria-label="Back">' + icon('back') + '</button>' : '') +
      '<div class="sheet__titles">' + (opts.eyebrow ? '<p class="eyebrow">' + opts.eyebrow + '</p>' : '') + '<h2 class="sheet__title">' + title + '</h2>' + (sub ? '<p class="sheet__sub">' + sub + '</p>' : '') + '</div>' +
      '<button type="button" class="icon-btn" data-sheet="close" aria-label="Close">' + icon('close') + '</button>' +
      '</div>';
  }

  // ── Confirm dialog ─────────────────────────────────────────────────────
  var confirmEl = $('#confirm');
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var body = $('#confirm-body');
      body.innerHTML =
        '<div class="sheet__grab" aria-hidden="true"></div>' +
        '<h2 class="confirm__title">' + esc(opts.title) + '</h2>' +
        (opts.text ? '<p class="confirm__text">' + esc(opts.text) + '</p>' : '') +
        (opts.html || '') +
        '<div class="confirm__actions">' +
        '<button type="button" class="btn btn--soft" data-confirm="cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
        '<button type="button" class="btn ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" data-confirm="ok">' + esc(opts.okLabel || 'OK') + '</button>' +
        '</div>';
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        var data = {};
        $$('input, select', body).forEach(function (el) {
          if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
          else data[el.name] = el.value;
        });
        confirmEl.classList.remove('is-open');
        setTimeout(function () {
          confirmEl.close();
          if (!sheetEl.open) document.documentElement.classList.remove('is-locked');
          resolve(ok ? data : null);
        }, reducedMotion() ? 0 : 300);
      }
      body.onclick = function (e) {
        var b = e.target.closest('[data-confirm]');
        if (b) finish(b.dataset.confirm === 'ok');
      };
      confirmEl.onclick = function (e) { if (e.target.closest('[data-close]')) finish(false); };
      confirmEl.oncancel = function (e) { e.preventDefault(); finish(false); };
      confirmEl.showModal();
      document.documentElement.classList.add('is-locked');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { confirmEl.classList.add('is-open'); });
      });
      // Destructive dialogs start on Cancel so a stray Enter never deletes anything.
      $(opts.danger ? '[data-confirm="cancel"]' : '[data-confirm="ok"]', body).focus();
    });
  }

  // ── Add / edit decision ────────────────────────────────────────────────
  function openAdd(opts) {
    opts = opts || {};
    if (!state.categories.length) {
      openCategoryEditor({ afterSave: function (cat) { openAdd({ categoryName: cat.name }); } });
      return;
    }
    var editing = opts.editId ? state.decisions.find(function (d) { return d.id === opts.editId; }) : null;
    var draft = opts.draft || {
      categoryName: null,
      text: editing ? editing.text : '',
      result: editing ? editing.result : '',
      when: editing ? new Date(editing.timestamp) : null
    };
    draft.categoryName = opts.categoryName || draft.categoryName || (editing ? editing.categoryName : null);
    if (draft.categoryName && !findCategory(state.categories, draft.categoryName)) draft.categoryName = null;

    openSheet(function (body) {
      if (draft.categoryName) addStep2(body, draft, editing, !opts.categoryName);
      else addStep1(body, draft, editing);
    }, {
      className: 'sheet--add',
      label: editing ? 'Edit decision' : 'Log a decision',
      focus: function () {
        var input = $('input[name="' + (opts.focus === 'result' ? 'result' : 'text') + '"]', sheetBody);
        if (input) focusEnd(input);
      }
    });
  }

  function focusEnd(input) {
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
  }

  function addStep1(body, draft, editing) {
    var v = derive();
    var needs = v.health.list.filter(function (h) { return h.status === 'neglected'; }).sort(function (a, b) { return a.priorityRank - b.priorityRank; })[0];
    body.innerHTML =
      sheetHead(editing ? 'Change category' : 'Log a decision', editing ? 'Move this decision to another category.' : 'Pick a category. Most important first.', { back: !!editing, eyebrow: editing ? '' : 'Decision #' + fmtNum(v.total + 1) }) +
      '<div class="tiles" role="list">' +
      state.categories.map(function (c, i) {
        var h = v.health.byName[c.name];
        var col = H.colorsFor(h);
        var tag = needs && needs.name === c.name ? '<span class="tile__tag">Behind</span>' : '';
        return '<button type="button" role="listitem" class="tile" data-pick="' + esc(c.name) + '" style="--c:' + c.color + ';--h:' + col.fill + ';--i:' + i + '" aria-label="' + esc(c.name + ', priority ' + c.priorityRank + '. ' + H.describe(h).short) + '">' +
          tag +
          '<span class="tile__top"><span class="tile__dot"></span><span class="tile__rank">#' + c.priorityRank + '</span><span class="tile__health"></span></span>' +
          '<span class="tile__name">' + esc(c.name) + '</span>' +
          '</button>';
      }).join('') +
      '<button type="button" class="tile tile--new" data-sheet="new-category" style="--i:' + state.categories.length + '">' + icon('plus') + 'New category</button>' +
      '</div>';

    body.onclick = function (e) {
      var pick = e.target.closest('[data-pick]');
      if (pick) {
        draft.categoryName = pick.dataset.pick;
        addStep2(body, draft, editing, true);
        focusEnd($('input[name="text"]', body)); // synchronous: keeps the keyboard up on iOS
        return;
      }
      var a = e.target.closest('[data-sheet]');
      if (!a) return;
      if (a.dataset.sheet === 'close') closeSheet();
      else if (a.dataset.sheet === 'back') {
        addStep2(body, draft, editing, true);
      } else if (a.dataset.sheet === 'new-category') {
        openCategoryEditor({ afterSave: function (cat) { openAdd({ categoryName: cat.name, editId: editing && editing.id, draft: draft }); } });
      }
    };
  }

  function addStep2(body, draft, editing, canGoBack) {
    var v = derive();
    var c = findCategory(state.categories, draft.categoryName);
    var number = editing ? v.numberOf[editing.id] : v.total + 1;
    body.innerHTML =
      sheetHead(editing ? 'Edit decision' : 'Log a decision', '', { back: !editing && canGoBack, eyebrow: 'Decision #' + fmtNum(number) }) +
      '<button type="button" class="cat-chip" data-sheet="back" style="--c:' + c.color + '" aria-label="Category: ' + esc(c.name) + '. Change category"><i></i><span>' + esc(c.name) + '</span><small>#' + c.priorityRank + ' priority</small>' + icon('swap') + '</button>' +
      '<form class="add-form" novalidate autocomplete="off">' +
      (c.why && isRed(c.name) ? '<p class="why why--note">“' + esc(c.why) + '”</p>' : '') +
      '<label class="field"><span class="field__label">What did you do?</span>' +
      '<input class="input" name="text" type="text" maxlength="' + MAX_TEXT + '" enterkeyhint="next" placeholder="' + esc(placeholderFor(c.name)) + '" value="' + esc(draft.text) + '" required></label>' +
      '<label class="field"><span class="field__label">What happened as a result? <em>Optional</em></span>' +
      '<input class="input" name="result" type="text" maxlength="' + MAX_RESULT + '" enterkeyhint="done" placeholder="e.g. Felt sharp all afternoon" value="' + esc(draft.result) + '"></label>' +
      (editing ? '<label class="field"><span class="field__label">When</span><input class="input" name="when" type="datetime-local" value="' + toLocalInput(draft.when) + '" max="' + toLocalInput(new Date()) + '"></label>' : '') +
      '<button class="btn btn--primary btn--lg btn--block" type="submit">' + icon('check') + (editing ? 'Save changes' : 'Save decision') + '</button>' +
      (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">' + icon('trash') + 'Delete decision</button>' : '<p class="kbd-hint">Enter to continue · Enter again to save</p>') +
      '</form>';

    var form = $('form', body);
    var text = fld(form, 'text');
    var result = fld(form, 'result');
    var whenInput = fld(form, 'when');

    text.addEventListener('input', function () {
      draft.text = text.value;
      text.classList.remove('is-invalid');
    });
    result.addEventListener('input', function () { draft.result = result.value; });
    if (whenInput) whenInput.addEventListener('input', function () { if (whenInput.value) draft.when = new Date(whenInput.value); });
    text.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) submit();
      else if (!text.value.trim()) invalid();
      else result.focus();
    });

    function invalid() {
      text.classList.remove('is-invalid');
      void text.offsetWidth;
      text.classList.add('is-invalid');
      text.focus();
    }

    function submit() {
      var t = text.value.trim();
      if (!t) return invalid();
      var r = result.value.trim();
      var cat = findCategory(state.categories, draft.categoryName);
      if (!cat) return;
      if (editing) {
        // Only touch the timestamp when the user actually changed "When" (the input has minute precision).
        var when = new Date(editing.timestamp);
        if (whenInput && whenInput.value && whenInput.value !== toLocalInput(when)) {
          var picked = new Date(whenInput.value);
          if (!isNaN(picked)) when = picked;
        }
        commit(function () {
          editing.text = t;
          editing.result = r;
          editing.categoryName = cat.name;
          editing.timestamp = when.toISOString();
          sortDecisions(state.decisions);
        });
        closeSheet();
        toast('Decision updated', { color: cat.color });
        return;
      }
      var d = { id: uid(), categoryName: cat.name, text: t, result: r, timestamp: new Date().toISOString() };
      var gap = daysSinceCategory(cat.name);
      commit(function (s) { s.decisions.push(d); }, { justAdded: d.id });
      closeSheet();
      if (navigator.vibrate) navigator.vibrate(12);
      var n = state.decisions.length;
      var actions = [{ label: 'Undo', run: function () { removeDecision(d.id, true); } }];
      if (!r) actions.push({ label: 'Add result', run: function () { openAdd({ editId: d.id, focus: 'result' }); } });
      toast(momentumMessage(cat.name, gap), {
        color: cat.color,
        sub: 'Decision #' + fmtNum(n) + ' · ' + cat.name + (n === state.settings.goal ? ' · Goal reached' : ''),
        actions: actions
      });
      requestPersistence();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit();
    });

    body.onclick = function (e) {
      var a = e.target.closest('[data-sheet]');
      if (!a) return;
      if (a.dataset.sheet === 'close') closeSheet();
      else if (a.dataset.sheet === 'back') {
        addStep1(body, draft, editing);
        var first = $('.tile', body);
        if (first) first.focus({ preventScroll: true });
      } else if (a.dataset.sheet === 'delete') {
        confirmDelete(editing.id);
      }
    };
  }

  /** Whole days since this category's previous decision, or null if none. */
  function daysSinceCategory(name) {
    for (var i = state.decisions.length - 1; i >= 0; i--) {
      if (state.decisions[i].categoryName === name) return dayIndex(new Date()) - dayIndex(new Date(state.decisions[i].timestamp));
    }
    return null;
  }

  /** Light, forward-looking wording after a save. Never mentions what's missing. */
  function momentumMessage(catName, gapBefore) {
    var n = state.decisions.length;
    if (n % 100 === 0 || n === state.settings.goal) return 'Milestone: ' + fmtNum(n) + ' decisions';
    if (gapBefore !== null && gapBefore >= 3) return 'Back. ' + catName + ' is moving again.';
    var now = new Date();
    var todayIdx = dayIndex(now);
    var perDay = Object.create(null);
    state.decisions.forEach(function (d) {
      var k = dayIndex(new Date(d.timestamp));
      perDay[k] = (perDay[k] || 0) + 1;
    });
    var today = perDay[todayIdx] || 0;
    var best = 0;
    for (var k = todayIdx - 7; k >= todayIdx - 364; k -= 7) best = Math.max(best, perDay[k] || 0);
    var weekday = now.toLocaleDateString(LOCALE, { weekday: 'long' });
    if (best && today > best) return today + ' today. Best ' + weekday + ' so far.';
    return today + ' today. One more?';
  }

  function placeholderFor(name) {
    var n = name.toLowerCase();
    if (/gym|train|fit|workout|sport|run/.test(n)) return 'e.g. Trained at 6am instead of snoozing';
    if (/money|finance|spend|save|budget/.test(n)) return 'e.g. Skipped the impulse buy, saved $40';
    if (/peace|calm|mind|mental|stress/.test(n)) return 'e.g. Walked away from the argument';
    if (/focus|work|deep|study|learn|read/.test(n)) return 'e.g. Phone in another room for 2 hours';
    if (/health|food|diet|eat|sleep/.test(n)) return 'e.g. Water instead of soda';
    if (/family|friend|love|relation|kid/.test(n)) return 'e.g. Called my mom instead of scrolling';
    return 'e.g. Chose the harder, better option';
  }

  function removeDecision(id, quiet) {
    var idx = state.decisions.findIndex(function (d) { return d.id === id; });
    if (idx < 0) return null;
    var removed = state.decisions[idx];
    commit(function (s) { s.decisions.splice(idx, 1); });
    delete ui.openEntries[id];
    if (quiet) toast('Removed', { duration: 1800 });
    return removed;
  }

  function confirmDelete(id) {
    var d = state.decisions.find(function (x) { return x.id === id; });
    if (!d) return;
    confirmDialog({
      title: 'Delete this decision?',
      text: '“' + d.text + '” will be removed from your ' + d.categoryName + ' count and your total.',
      okLabel: 'Delete',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      if (sheetEl.open) closeSheet();
      var removed = removeDecision(id);
      if (!removed) return;
      toast('Decision deleted', {
        action: {
          label: 'Undo',
          run: function () {
            commit(function (s) {
              s.decisions.push(removed);
              sortDecisions(s.decisions);
              if (!findCategory(s.categories, removed.categoryName)) addCategory(removed.categoryName);
            });
          }
        }
      });
    });
  }

  // ── Category detail ────────────────────────────────────────────────────
  function openDetail(name) {
    openSheet(function (body) { buildDetail(body, name); }, { className: 'sheet--detail', label: name + ' details' });
  }

  function buildDetail(body, name) {
    var v = derive();
    var c = v.catByName[name];
    if (!c) return closeSheet();
    var h = v.health.byName[name];
    var col = H.colorsFor(h);
    var d = H.describe(h);

    // Per-day counts for the last 7 days (oldest → today).
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var day = new Date(v.now);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      days.push({ date: day, idx: dayIndex(day), count: 0 });
    }
    var recent = [];
    for (var k = state.decisions.length - 1; k >= 0; k--) {
      var dec = state.decisions[k];
      if (dec.categoryName !== name) continue;
      if (recent.length < 6) recent.push(dec);
      var di = dayIndex(new Date(dec.timestamp));
      var slot = 6 - (dayIndex(v.now) - di);
      if (slot >= 0 && slot < 7) days[slot].count++;
    }
    var maxDay = Math.max(1, days.reduce(function (m, x) { return Math.max(m, x.count); }, 0));

    // Share band: where actual sits against the balanced range.
    var lo = h.targetShare * H.BAND_LOW;
    var hi = h.targetShare * H.BAND_HIGH;
    var scaleMax = Math.min(1, Math.max(0.1, Math.ceil(Math.max(hi, h.actualShare) * 1.25 * 10) / 10));
    function x(val) { return clamp((val / scaleMax) * 100, 0, 100).toFixed(2) + '%'; }
    var hasWeek = v.health.total7 > 0;

    body.innerHTML =
      sheetHead(esc(c.name), '#' + c.priorityRank + ' priority · target ' + pct(h.targetShare) + ' of your decisions', { eyebrow: '<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:50%;background:' + c.color + ';display:inline-block"></i>Category</span>' }) +
      '<div class="detail__hero" style="--track:' + col.track + ';--fill:' + col.fill + ';--on:' + col.onFill + '">' +
      '<div class="detail__status"><span class="detail__badge">' + icon(STATUS_ICON[h.status]) + esc(d.short) + '</span></div>' +
      '<p class="detail__label">' + esc(d.label) + '</p>' +
      '<p class="detail__text">' + esc(d.detail) + '</p>' +
      (c.why && h.status === 'neglected' ? '<p class="why why--lg">“' + esc(c.why) + '”</p>' : '') +
      (!c.why ? '<button type="button" class="linkish" data-sheet="add-why">+ Add your why</button>' : '') +
      '</div>' +
      '<div class="stat-pair">' +
      '<div class="stat"><div class="stat__num">' + fmtNum(h.total) + '</div><div class="stat__label">All-time decisions</div></div>' +
      '<div class="stat"><div class="stat__num">' + fmtNum(h.count7) + '</div><div class="stat__label">Last 7 days (of ' + fmtNum(v.health.total7) + ')</div></div>' +
      '</div>' +
      '<div class="sheet__section"><p class="sheet__section-title"><span>Last 7 days</span></p>' +
      '<div class="week" style="--fill:' + col.fill + '">' +
      days.map(function (day, i) {
        var isToday = i === 6;
        return '<div class="week__col' + (isToday ? ' is-today' : '') + '"><span class="week__n">' + (day.count || '') + '</span>' +
          '<span class="week__track"><i style="--h:' + ((day.count / maxDay) * 100).toFixed(1) + '%;--i:' + i + '"></i></span>' +
          '<span class="week__d">' + (isToday ? 'Today' : day.date.toLocaleDateString(LOCALE, { weekday: 'narrow' })) + '</span></div>';
      }).join('') +
      '</div></div>' +
      '<div class="sheet__section"><p class="sheet__section-title"><span>Share of attention · 7 days</span></p>' +
      (hasWeek
        ? '<div class="band" style="--fill:' + col.fill + '">' +
          '<div class="band__track">' +
          '<div class="band__low" style="width:' + x(lo) + '"></div>' +
          '<div class="band__zone" style="left:' + x(lo) + ';width:calc(' + x(hi) + ' - ' + x(lo) + ')"></div>' +
          '<div class="band__target" style="left:' + x(h.targetShare) + '"></div>' +
          '<div class="band__actual" style="left:' + x(h.actualShare) + '"></div>' +
          '</div>' +
          '<div class="band__scale"><span>0%</span><span>' + pct(scaleMax) + '</span></div>' +
          '<div class="band__keys">' +
          '<div class="band__key"><b>' + pct(h.actualShare) + '</b><span><i style="background:' + col.fill + '"></i>Actual</span></div>' +
          '<div class="band__key"><b>' + pct(h.targetShare) + '</b><span><i class="t"></i>Target</span></div>' +
          '<div class="band__key"><b>' + Math.round(lo * 100) + '–' + pct(hi) + '</b><span><i style="background:var(--green)"></i>Balanced</span></div>' +
          '</div></div>'
        : '<p class="mini-empty">No decisions in the last 7 days, so there’s nothing to compare yet. Target: ' + pct(h.targetShare) + '.</p>') +
      '</div>' +
      '<div class="sheet__section"><p class="sheet__section-title"><span>Recent decisions</span>' + (h.total > recent.length ? '<span>' + fmtNum(h.total) + ' total</span>' : '') + '</p>' +
      (recent.length
        ? '<div class="mini-list">' + recent.map(function (r) {
            return '<div class="mini"><span class="mini__text">' + esc(r.text) + '</span><span class="mini__date">' + esc(fmtShort(new Date(r.timestamp), v.now)) + '</span>' + (r.result ? '<span class="mini__result">' + esc(r.result) + '</span>' : '') + '</div>';
          }).join('') + '</div>'
        : '<p class="mini-empty">Nothing logged here yet.</p>') +
      '</div>' +
      '<div class="sheet__actions">' +
      '<button type="button" class="btn btn--primary btn--lg btn--block" data-sheet="log">' + icon('plus') + 'Log a ' + esc(c.name) + ' decision</button>' +
      (h.total ? '<button type="button" class="btn btn--soft btn--block" data-sheet="history">See all in history</button>' : '') +
      '</div>';

    body.onclick = function (e) {
      var a = e.target.closest('[data-sheet]');
      if (!a) return;
      if (a.dataset.sheet === 'close') closeSheet();
      else if (a.dataset.sheet === 'add-why') {
        openCategoryEditor({ id: c.id, focusWhy: true });
      } else if (a.dataset.sheet === 'log') {
        openAdd({ categoryName: name });
      } else if (a.dataset.sheet === 'history') {
        ui.historyFilter = name;
        ui.historyLimit = HISTORY_PAGE;
        closeSheet();
        render();
        setTimeout(function () { $('#history').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }); }, 340);
      }
    };
  }

  // ── Category editor ────────────────────────────────────────────────────
  function openCategoryEditor(opts) {
    opts = opts || {};
    var editing = opts.id ? state.categories.find(function (c) { return c.id === opts.id; }) : null;
    var n = state.categories.length;
    var draft = {
      name: editing ? editing.name : (opts.name || ''),
      why: editing ? editing.why || '' : '',
      color: editing ? editing.color : nextColor(state.categories),
      rank: editing ? editing.priorityRank : n + 1
    };
    var slots = editing ? n : n + 1;

    openSheet(function (body) {
      var unused = SUGGESTED.filter(function (s) { return !findCategory(state.categories, s); }).slice(0, 6);
      body.innerHTML =
        sheetHead(editing ? 'Edit category' : 'New category', editing ? '' : 'An area where you want better decisions.') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<label class="field"><span class="field__label">Name</span>' +
        '<input class="input" name="name" type="text" maxlength="' + MAX_NAME + '" enterkeyhint="done" placeholder="e.g. Gym" value="' + esc(draft.name) + '" required></label>' +
        '<label class="field"><span class="field__label">Why does this matter? <em>Optional · one line · shown when this falls behind</em></span>' +
        '<input class="input" name="why" type="text" maxlength="' + MAX_WHY + '" enterkeyhint="done" placeholder="' + esc(whyPlaceholder(draft.name)) + '" value="' + esc(draft.why) + '"></label>' +
        (!editing && unused.length ? '<div class="suggest" style="margin-top:-6px">' + unused.map(function (s) { return '<button type="button" data-suggest="' + esc(s) + '" style="--c:' + draft.color + '"><i></i>' + esc(s) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="field"><span class="field__label">Color <em>Its identity. Health colors still show on the bars.</em></span>' +
        '<div class="swatches" role="radiogroup" aria-label="Color">' +
        PALETTE.map(function (p) {
          return '<button type="button" class="swatch" role="radio" data-color="' + p + '" style="--c:' + p + '" aria-checked="' + (p === draft.color) + '" aria-label="Color ' + p + '"></button>';
        }).join('') +
        '</div></div>' +
        '<div class="field"><span class="field__label">Priority</span>' +
        '<div class="positions" role="radiogroup" aria-label="Priority position">' +
        Array.from({ length: slots }, function (_, i) {
          return '<button type="button" class="position" role="radio" data-rank="' + (i + 1) + '" aria-checked="' + (i + 1 === draft.rank) + '">#' + (i + 1) + '</button>';
        }).join('') +
        '</div><p class="position-note" id="position-note"></p><div class="preview-bars" id="preview-bars"></div></div>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">' + icon('check') + (editing ? 'Save category' : 'Create category') + '</button>' +
        (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">' + icon('trash') + 'Delete category</button>' : '') +
        '</form>';

      var form = $('form', body);
      var input = fld(form, 'name');

      function refresh() {
        $$('.swatch[data-color]', body).forEach(function (s) {
          s.setAttribute('aria-checked', String(s.dataset.color === draft.color));
        });
        var custom = $('.swatch--custom', body);
        if (custom) {
          var isCustom = PALETTE.indexOf(draft.color) === -1;
          custom.setAttribute('aria-checked', String(isCustom));
          custom.style.background = isCustom ? draft.color : '';
        }
        $$('.suggest button', body).forEach(function (s) { s.style.setProperty('--c', draft.color); });
        $$('.position', body).forEach(function (p) { p.setAttribute('aria-checked', String(+p.dataset.rank === draft.rank)); });
        // Preview of the resulting order and targets.
        var order = state.categories.filter(function (c) { return !editing || c.id !== editing.id; }).map(function (c) { return { name: c.name, color: c.color, self: false }; });
        order.splice(draft.rank - 1, 0, { name: draft.name.trim() || (editing ? editing.name : 'New'), color: draft.color, self: true });
        var total = order.length;
        var sum = (total * (total + 1)) / 2;
        var t = (total - draft.rank + 1) / sum;
        $('#position-note', body).innerHTML = 'At <b>#' + draft.rank + '</b> of ' + total + ', this category should get about <b>' + pct(t) + '</b> of your decisions.';
        var maxT = total / sum;
        $('#preview-bars', body).innerHTML = order.map(function (o, i) {
          var share = (total - i) / sum;
          return '<div class="preview-bar' + (o.self ? ' is-self' : '') + '" style="--c:' + o.color + '"><span class="preview-bar__rank">' + (i + 1) + '</span><span class="preview-bar__track"><i style="width:' + ((share / maxT) * 100).toFixed(1) + '%">' + esc(o.name) + '</i></span><span class="preview-bar__pct">' + pct(share) + '</span></div>';
        }).join('');
      }
      var customColor = document.createElement('label');
      customColor.className = 'swatch swatch--custom';
      customColor.title = 'Custom color';
      customColor.innerHTML = '<input type="color" aria-label="Custom color" value="' + draft.color.toLowerCase() + '">';
      $('.swatches', body).appendChild(customColor);
      $('input', customColor).addEventListener('input', function (e) {
        draft.color = validColor(e.target.value) || draft.color;
        refresh();
      });

      refresh();

      var whyInput = fld(form, 'why');
      input.addEventListener('input', function () {
        draft.name = input.value;
        input.classList.remove('is-invalid');
        if (!whyInput.value) whyInput.placeholder = whyPlaceholder(draft.name);
        refresh();
      });

      function invalid(msg) {
        input.classList.remove('is-invalid');
        void input.offsetWidth;
        input.classList.add('is-invalid');
        input.focus();
        if (msg) toast(msg, { tone: 'error' });
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = input.value.trim().replace(/\s+/g, ' ');
        if (!name) return invalid();
        var clash = findCategory(state.categories, name);
        if (clash && (!editing || clash.id !== editing.id)) return invalid('You already have a category called ' + clash.name + '.');
        var saved;
        commit(function () {
          if (editing) {
            renameCategory(editing, name);
            editing.color = draft.color;
            editing.why = whyInput.value.trim().slice(0, MAX_WHY);
            moveCategory(editing.id, draft.rank - 1);
            saved = editing;
          } else {
            saved = addCategory(name, draft.color, draft.rank);
            saved.why = whyInput.value.trim().slice(0, MAX_WHY);
          }
        });
        if (opts.afterSave) opts.afterSave(saved);
        else {
          closeSheet();
          toast(editing ? 'Category saved' : name + ' added at #' + saved.priorityRank, { color: saved.color });
        }
      });

      body.onclick = function (e) {
        var sw = e.target.closest('[data-color]');
        if (sw) {
          draft.color = sw.dataset.color;
          refresh();
          return;
        }
        var pos = e.target.closest('[data-rank]');
        if (pos) {
          draft.rank = +pos.dataset.rank;
          refresh();
          return;
        }
        var sug = e.target.closest('[data-suggest]');
        if (sug) {
          input.value = draft.name = sug.dataset.suggest;
          refresh();
          input.focus();
          return;
        }
        var a = e.target.closest('[data-sheet]');
        if (!a) return;
        if (a.dataset.sheet === 'close') closeSheet();
        else if (a.dataset.sheet === 'delete') deleteCategory(editing);
      };
    }, {
      className: 'sheet--category',
      label: editing ? 'Edit category' : 'New category',
      focus: function () {
        if (opts.focusWhy) $('input[name="why"]', sheetBody).focus({ preventScroll: true });
        else if (!editing) $('input[name="name"]', sheetBody).focus({ preventScroll: true });
      }
    });
  }

  function deleteCategory(cat) {
    var count = state.decisions.filter(function (d) { return d.categoryName === cat.name; }).length;
    var others = state.categories.filter(function (c) { return c.id !== cat.id; });
    var html = '';
    if (count && others.length) {
      html = '<div class="confirm__options">' +
        '<label class="option"><input type="radio" name="mode" value="move" checked><span><span class="option__title">Move its ' + count + ' ' + plural(count, 'decision') + '</span><span class="option__text">Your total stays the same.</span>' +
        '<select class="select" name="target">' + others.map(function (o) { return '<option value="' + esc(o.name) + '">to ' + esc(o.name) + '</option>'; }).join('') + '</select></span></label>' +
        '<label class="option"><input type="radio" name="mode" value="delete"><span><span class="option__title">Delete them too</span><span class="option__text">Your total drops by ' + count + '.</span></span></label>' +
        '</div>';
    }
    confirmDialog({
      title: 'Delete “' + cat.name + '”?',
      text: count ? (others.length ? 'It has ' + count + ' ' + plural(count, 'decision') + '. What should happen to them?' : 'Its ' + count + ' ' + plural(count, 'decision') + ' will be deleted too, and your total drops by ' + count + '.') : 'It has no decisions yet.',
      html: html,
      okLabel: 'Delete category',
      danger: true
    }).then(function (res) {
      if (!res) return;
      commit(function (s) {
        if (count) {
          if (res.mode === 'move' && res.target && findCategory(s.categories, res.target)) {
            var target = findCategory(s.categories, res.target).name;
            s.decisions.forEach(function (d) { if (d.categoryName === cat.name) d.categoryName = target; });
          } else {
            s.decisions = s.decisions.filter(function (d) { return d.categoryName !== cat.name; });
          }
        }
        s.categories = s.categories.filter(function (c) { return c.id !== cat.id; });
        reRank();
      });
      closeSheet();
      toast('Deleted ' + cat.name);
    });
  }

  function quickCategory(name) {
    if (findCategory(state.categories, name)) return;
    var cat;
    commit(function () { cat = addCategory(name); });
    toast(name + ' is #' + cat.priorityRank, { color: cat.color, sub: state.categories.length === 1 ? 'Add a few more, or tap + to log your first decision.' : 'Drag in Priorities to reorder anytime.' });
  }

  // ── Share sheet ────────────────────────────────────────────────────────
  var shareBlob = null;

  function openShare() {
    shareBlob = null;
    openSheet(function (body) {
      var v = derive();
      var todayIdx = dayIndex(v.now);
      var todays = state.decisions.filter(function (d) { return dayIndex(new Date(d.timestamp)) === todayIdx; }).reverse();
      var auto = autoStandout(todays, v);
      if (!ui.cardPick || !todays.some(function (d) { return d.id === ui.cardPick; })) ui.cardPick = auto ? auto.id : null;
      var canShare = !!(navigator.canShare && window.File);

      body.innerHTML =
        sheetHead('Today’s card', v.day >= 1 ? 'Day ' + fmtNum(v.day) + ' · 1080×1920 · Instagram story' : '1080×1920 · Instagram story') +
        '<div class="share-view">' +
        '<div class="share-view__stage"><img id="share-img" width="1080" height="1920" alt="Today’s card: Day ' + v.day + ', ' + v.total + ' of ' + state.settings.goal + ' decisions"></div>' +
        '<p class="share-view__hint">Tip: long-press the card to save it straight to Photos.</p>' +
        (todays.length > 1
          ? '<div><p class="sheet__section-title"><span>Standout decision</span></p><div class="picks">' + todays.map(function (d) {
              return '<label class="pick" style="--c:' + catColor(v, d.categoryName) + '"><input type="radio" name="pick" value="' + d.id + '"' + (d.id === ui.cardPick ? ' checked' : '') + '><span><span class="pick__text">' + esc(d.text) + '</span><span class="pick__meta"><i></i>' + esc(d.categoryName) + ' · ' + esc(fmtTime(new Date(d.timestamp))) + (d.result ? ' · has result' : '') + '</span></span></label>';
            }).join('') + '</div></div>'
          : todays.length === 0 ? '<p class="mini-empty">No decision logged today yet. Log one and it becomes the standout on your card.</p>' : '') +
        '<div class="share-view__buttons">' +
        '<button type="button" class="btn btn--primary btn--lg" data-sheet="download">' + icon('download') + 'Download PNG</button>' +
        (canShare ? '<button type="button" class="btn btn--soft btn--lg" data-sheet="share" hidden>' + icon('share') + 'Share</button>' : '') +
        '</div></div>';

      // Render offscreen, then show the result as a real <img>: phones can long-press it to save.
      var canvas = document.createElement('canvas');
      var img = $('#share-img', body);
      function draw() {
        shareBlob = null;
        Card.ensureFonts().then(function () {
          Card.render(canvas, cardModel(derive(), ui.cardPick));
          canvas.toBlob(function (blob) {
            if (!blob) return;
            shareBlob = blob;
            if (img._url) URL.revokeObjectURL(img._url);
            img._url = URL.createObjectURL(blob);
            img.src = img._url;
            var shareBtn = $('[data-sheet="share"]', body);
            if (shareBtn) {
              var file = new File([blob], fileName(), { type: 'image/png' });
              try { shareBtn.hidden = !navigator.canShare({ files: [file] }); } catch (e) { shareBtn.hidden = true; }
            }
          }, 'image/png');
        });
      }
      draw();

      body.onchange = function (e) {
        if (e.target.name === 'pick') {
          ui.cardPick = e.target.value;
          draw();
        }
      };
      body.onclick = function (e) {
        var a = e.target.closest('[data-sheet]');
        if (!a) return;
        if (a.dataset.sheet === 'close') closeSheet();
        else if (a.dataset.sheet === 'download') downloadCard(canvas);
        else if (a.dataset.sheet === 'share') shareCard();
      };
    }, { className: 'sheet--share', label: 'Today’s card' });
  }

  function fileName() {
    var v = derive();
    return '1000-decisions-' + (v.day >= 1 ? 'day-' + v.day : ymd(v.now)) + '.png';
  }

  function downloadCard(canvas) {
    function go(blob) {
      if (!blob) return toast('Couldn’t create the image.', { tone: 'error' });
      var name = fileName();
      downloadBlob(blob, name).then(function (ok) { if (ok) toast('Card saved', { sub: name }); });
    }
    if (shareBlob) go(shareBlob);
    else canvas.toBlob(go, 'image/png');
  }

  function shareCard() {
    if (!shareBlob) return toast('Still rendering, try again in a second.');
    var file = new File([shareBlob], fileName(), { type: 'image/png' });
    var v = derive();
    navigator.share({ files: [file], title: (v.day >= 1 ? 'Day ' + v.day + ' · ' : '') + '1000 Decisions' }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      toast('Sharing isn’t available here. Use Download instead.');
    });
  }

  /** Hand a file to the user. Resolves true once the save has started. */
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve(true);
  }

  // ── Settings, backup, import ───────────────────────────────────────────
  function exportData() {
    var payload = {
      app: '1000-decisions',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { categories: state.categories, decisions: state.decisions, settings: state.settings }
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, '1000-decisions-backup-' + ymd(new Date()) + '.json').then(function (ok) {
      if (!ok) return;
      commit(function (s) { s.settings.lastBackupAt = new Date().toISOString(); });
      toast('Backup exported', { sub: state.decisions.length + ' decisions · ' + state.categories.length + ' categories' });
    });
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        return toast('That file isn’t valid JSON.', { tone: 'error' });
      }
      var src = parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      if (!src || (!Array.isArray(src.decisions) && !Array.isArray(src.categories))) {
        return toast('That doesn’t look like a 1000 Decisions backup.', { tone: 'error' });
      }
      var next = normalize(parsed);
      confirmDialog({
        title: 'Replace your data?',
        text: 'Import ' + next.decisions.length + ' ' + plural(next.decisions.length, 'decision') + ' and ' + next.categories.length + ' ' + plural(next.categories.length, 'category', 'categories') + '. This replaces the ' + state.decisions.length + ' ' + plural(state.decisions.length, 'decision') + ' on this device.',
        okLabel: 'Replace',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        state = next;
        ui.historyFilter = null;
        ui.historyLimit = HISTORY_PAGE;
        ui.openEntries = Object.create(null);
        save();
        $('#hero-total').dataset.value = 0;
        render();
        toast('Backup imported', { sub: state.decisions.length + ' decisions restored' });
      });
    };
    reader.onerror = function () { toast('Couldn’t read that file.', { tone: 'error' }); };
    reader.readAsText(file);
  }

  function resetAll() {
    confirmDialog({
      title: 'Erase everything?',
      text: 'All ' + state.decisions.length + ' decisions, your categories and settings will be deleted from this device. Export a backup first if you might want them back.',
      okLabel: 'Erase all',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      state = defaults();
      ui.historyFilter = null;
      ui.openEntries = Object.create(null);
      save();
      render();
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      toast('Fresh start. Day 1.');
    });
  }

  var persistAsked = false;
  function requestPersistence() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    navigator.storage.persist().catch(function () {});
  }

  // ── Drag to reorder priorities ─────────────────────────────────────────
  function initReorder() {
    var list = $('#prio-list');

    list.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest('.prio__handle');
      if (!handle || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var rows = $$('.prio__row', list);
      if (rows.length < 2) return;
      e.preventDefault();
      var row = handle.closest('.prio__row');
      var from = rows.indexOf(row);
      var tops = rows.map(function (r) { return r.offsetTop; });
      var heights = rows.map(function (r) { return r.offsetHeight; });
      var step = tops[1] - tops[0];
      var startY = e.clientY + window.scrollY;
      var lastY = e.clientY;
      var to = from;
      var raf = 0;
      var id = row.dataset.id;

      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      row.classList.add('is-dragging');
      list.classList.add('is-sorting');
      document.body.style.userSelect = 'none';

      function update() {
        var dy = lastY + window.scrollY - startY;
        dy = clamp(dy, tops[0] - tops[from] - 12, tops[rows.length - 1] - tops[from] + 12);
        row.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
        var center = tops[from] + heights[from] / 2 + dy;
        var idx = 0;
        rows.forEach(function (r, i) {
          if (i !== from && tops[i] + heights[i] / 2 < center) idx++;
        });
        if (idx !== to) {
          to = idx;
          rows.forEach(function (r, i) {
            if (i === from) return;
            var shift = 0;
            if (from < to && i > from && i <= to) shift = -step;
            if (from > to && i >= to && i < from) shift = step;
            r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
          });
          previewTargets(rows, from, to);
          if (navigator.vibrate) navigator.vibrate(6);
        }
      }

      function tick() {
        var edgeTop = 90, edgeBottom = 70, vh = window.innerHeight, speed = 0;
        if (lastY < edgeTop) speed = -Math.ceil((edgeTop - lastY) / 5);
        else if (lastY > vh - edgeBottom) speed = Math.ceil((lastY - (vh - edgeBottom)) / 5);
        if (speed) {
          window.scrollBy(0, speed);
          update();
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);

      function move(ev) {
        lastY = ev.clientY;
        update();
      }

      function up() {
        cancelAnimationFrame(raf);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        document.body.style.userSelect = '';
        row.classList.remove('is-dragging');
        row.style.transform = 'translateY(' + (tops[to] - tops[from]) + 'px)';
        setTimeout(function () {
          rows.forEach(function (r) { r.style.transform = ''; });
          list.classList.remove('is-sorting');
          if (to !== from) {
            var cat = state.categories.find(function (c) { return c.id === id; });
            commit(function () { moveCategory(id, to); });
            announce(cat.name + ' moved to priority ' + (to + 1));
            toast(cat.name + ' is now #' + (to + 1), { color: cat.color, sub: 'Targets and health updated' });
          } else {
            render();
          }
        }, reducedMotion() ? 0 : 200);
      }

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });

    list.addEventListener('keydown', function (e) {
      var handle = e.target.closest('.prio__handle');
      if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      var id = handle.closest('.prio__row').dataset.id;
      var i = state.categories.findIndex(function (c) { return c.id === id; });
      var to = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= state.categories.length) return;
      commit(function () { moveCategory(id, to); });
      var again = $('.prio__row[data-id="' + id + '"] .prio__handle');
      if (again) again.focus();
      announce(state.categories[to].name + ' moved to priority ' + (to + 1));
    });
  }

  // ── Global events ──────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    switch (action) {
      case 'add': openAdd(); break;
      case 'detail': openDetail(el.dataset.name); break;
      case 'new-category': openCategoryEditor(); break;
      case 'edit-category': openCategoryEditor({ id: el.dataset.id }); break;
      case 'quick-category': quickCategory(el.dataset.name); break;
      case 'share': openShare(); break;
      case 'export': exportData(); break;
      case 'reset': resetAll(); break;
      case 'history-filter':
        ui.historyFilter = el.dataset.name || null;
        ui.historyLimit = HISTORY_PAGE;
        render();
        break;
      case 'history-more':
        ui.historyLimit += HISTORY_PAGE * 2;
        render();
        break;
      case 'toggle-entry': {
        var li = el.closest('.entry');
        var id = li.dataset.id;
        var open = !ui.openEntries[id];
        if (open) ui.openEntries[id] = true;
        else delete ui.openEntries[id];
        li.classList.toggle('is-open', open);
        el.setAttribute('aria-expanded', String(open));
        break;
      }
      case 'edit-decision': openAdd({ editId: el.dataset.id }); break;
      case 'delete-decision': confirmDelete(el.dataset.id); break;
      case 'log-category': openAdd({ categoryName: el.dataset.name }); break;
      case 'proof-toggle':
        ui.proofAll = !ui.proofAll;
        render();
        break;
      case 'reason': {
        var ask = el.closest('.pulse__ask');
        commit(function (s) {
          s.reasons.push({ date: ask.dataset.date, window: ask.dataset.window, answer: el.dataset.answer });
          s.prompt.ignored = 0;
        });
        toast(el.dataset.answer === 'none' ? 'Noted' : 'Noted. It’ll show up in your patterns.');
        break;
      }
      case 'reason-dismiss':
        commit(function (s) {
          s.prompt.dismissedOn = ymd(new Date());
          s.prompt.ignored++;
        });
        break;
    }
  });

  var settingsForm = $('#settings-form');
  settingsForm.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'goal') {
      var g = parseInt(t.value, 10);
      if (!isFinite(g) || g < 10 || g > 100000) {
        t.value = state.settings.goal;
        return toast('Pick a goal between 10 and 100000.', { tone: 'error' });
      }
      commit(function (s) { s.settings.goal = g; });
      toast('Goal set to ' + fmtNum(g));
    } else if (t.name === 'startDate') {
      if (!parseYmd(t.value)) {
        t.value = state.settings.startDate;
        return;
      }
      commit(function (s) { s.settings.startDate = t.value; });
      var day = dayNumber(t.value, new Date());
      toast(day >= 1 ? 'Today is Day ' + day : 'Day 1 starts in ' + (1 - day) + ' ' + plural(1 - day, 'day'));
    } else if (t.name === 'showWhyOnCard') {
      commit(function (s) { s.settings.showWhyOnCard = t.checked; });
      toast(t.checked ? 'Your why will show on the card' : 'Why hidden from the card');
    } else if (t.name === 'signature') {
      commit(function (s) { s.settings.signature = t.value.trim().slice(0, 40); });
    }
  });
  settingsForm.addEventListener('submit', function (e) { e.preventDefault(); });

  $('#import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (sheetEl.open || confirmEl.open) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.key === 'n' || e.key === 'N' || e.key === '+') {
      e.preventDefault();
      openAdd();
    }
  });

  // Other tabs / windows
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    var next = load();
    if (next) {
      state = next;
      render();
    }
  });

  // Keep "today", Day N and the 7-day window fresh across midnight.
  var lastDay = dayIndex(new Date());
  function refreshIfNewDay() {
    var d = dayIndex(new Date());
    if (d !== lastDay) {
      lastDay = d;
      render();
    }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshIfNewDay(); });
  setInterval(refreshIfNewDay, 60 * 1000);

  // Compact stats in the top bar once the big number scrolls away.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      $('#topbar').classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }, { rootMargin: '-64px 0px 0px 0px' }).observe($('#hero-count'));

    new IntersectionObserver(function (entries) {
      thumbVisible = entries[0].isIntersecting;
      if (thumbVisible) scheduleThumb();
    }, { rootMargin: '200px 0px' }).observe($('#share-thumb'));
  } else {
    thumbVisible = true;
  }

  initReorder();
  render({ intro: true });

  if (firstRun && !reducedMotion()) {
    $('#hero-total').dataset.value = 0;
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
