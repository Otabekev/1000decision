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
  var BT = window.TDBattles;
  var RC = window.TDRecord;
  var MEDIA = window.TDMedia;
  var THEMES = ['stone', 'carbon', 'terminal'];
  var THEME_LABEL = { stone: 'Stone', carbon: 'Carbon', terminal: 'Terminal' };
  var THEME_BG = { stone: '#F3F2EF', carbon: '#0E1012', terminal: '#050604' };
  var VOICE_TAGS = [['good', 'Good day'], ['hard', 'Hard day'], ['big', 'Big moment'], ['other', 'Other']];
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
      settings: { goal: 1000, startDate: ymd(new Date()), signature: '', lastBackupAt: null, showWhyOnCard: false, privateMode: false, checkinDays: 14, theme: 'stone', finaleShownFor: 0 },
      // One-tap answers to "What pulled you away?" and when the question was last shown.
      reasons: [],
      prompt: { lastAsked: null, ignored: 0, pausedUntil: null },
      battles: [],
      checkins: [],
      bets: [],
      firsts: [],
      lessons: [],
      voice: [],
      letter: null,
      seasons: [],
      hardMoments: [],
      onboarded: false,
      lock: null
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
    out.settings.privateMode = s.privateMode === true;
    out.settings.theme = THEMES.indexOf(s.theme) !== -1 ? s.theme : 'stone';
    out.settings.finaleShownFor = Math.max(0, parseInt(s.finaleShownFor, 10) || 0);
    out.settings.checkinDays = [14, 30].indexOf(+s.checkinDays) !== -1 ? +s.checkinDays : 14;

    if (Array.isArray(src.battles)) {
      src.battles.forEach(function (b) {
        if (!b || typeof b.title !== 'string' || !b.title.trim() || !isFinite(Date.parse(b.startedAt))) return;
        var status = ['active', 'won', 'passed', 'accepted'].indexOf(b.status) !== -1 ? b.status : 'active';
        var ended = status !== 'active' && isFinite(Date.parse(b.endedAt)) ? new Date(Date.parse(b.endedAt)).toISOString() : null;
        out.battles.push({
          id: typeof b.id === 'string' && b.id ? b.id : uid(),
          title: b.title.trim().slice(0, 120),
          area: typeof b.area === 'string' && b.area.trim() ? b.area.trim().slice(0, MAX_NAME) : 'Other',
          weight: clamp(parseInt(b.weight, 10) || 3, 1, 5),
          step: typeof b.step === 'string' ? b.step.trim().slice(0, 140) : '',
          startedAt: new Date(Date.parse(b.startedAt)).toISOString(),
          status: ended ? status : 'active',
          endedAt: ended,
          helped: Array.isArray(b.helped) ? b.helped.filter(function (h) { return BT.HELPED.some(function (x) { return x[0] === h; }); }) : [],
          note: typeof b.note === 'string' ? b.note.trim().slice(0, 160) : '',
          updates: Array.isArray(b.updates) ? b.updates.filter(function (u) { return u && isFinite(Date.parse(u.at)); }).map(function (u) {
            return { at: new Date(Date.parse(u.at)).toISOString(), weight: u.weight ? clamp(parseInt(u.weight, 10) || 3, 1, 5) : null, note: typeof u.note === 'string' ? u.note.trim().slice(0, 200) : '' };
          }) : []
        });
      });
    }
    function str(x, n) { return typeof x === 'string' ? x.trim().slice(0, n) : ''; }
    if (Array.isArray(src.bets)) {
      src.bets.forEach(function (b) {
        if (!b || !str(b.title, 140) || !isFinite(Date.parse(b.madeAt))) return;
        out.bets.push({
          id: str(b.id, 80) || uid(), title: str(b.title, 140), area: str(b.area, MAX_NAME) || 'Other',
          why: str(b.why, 400), expect: str(b.expect, 400), regret: str(b.regret, 300),
          confidence: clamp(parseInt(b.confidence, 10) || 3, 1, 5),
          madeAt: new Date(Date.parse(b.madeAt)).toISOString(),
          reviews: Array.isArray(b.reviews) ? b.reviews.filter(function (r) { return r && [3, 6, 12].indexOf(+r.checkpoint) !== -1 && RC.VERDICTS[r.verdict]; }).map(function (r) {
            return { at: isFinite(Date.parse(r.at)) ? new Date(Date.parse(r.at)).toISOString() : new Date().toISOString(), checkpoint: +r.checkpoint, verdict: r.verdict, note: str(r.note, 400) };
          }) : []
        });
      });
    }
    if (Array.isArray(src.firsts)) {
      src.firsts.forEach(function (f) {
        if (!f || !str(f.title, 140) || !parseYmd(f.date)) return;
        out.firsts.push({ id: str(f.id, 80) || uid(), title: str(f.title, 140), area: str(f.area, MAX_NAME), date: f.date, note: str(f.note, 300) });
      });
    }
    if (Array.isArray(src.lessons)) {
      src.lessons.forEach(function (l) {
        if (!l || !str(l.text, 200)) return;
        var srcRef = l.source && typeof l.source === 'object' ? { type: ['battle', 'bet', 'manual'].indexOf(l.source.type) !== -1 ? l.source.type : 'manual', id: str(l.source.id, 80) } : { type: 'manual', id: '' };
        out.lessons.push({ id: str(l.id, 80) || uid(), text: str(l.text, 200), area: str(l.area, MAX_NAME) || 'General', pinned: l.pinned === true, at: isFinite(Date.parse(l.at)) ? new Date(Date.parse(l.at)).toISOString() : new Date().toISOString(), source: srcRef });
      });
    }
    if (Array.isArray(src.voice)) {
      src.voice.forEach(function (n) {
        if (!n || !str(n.id, 80) || !isFinite(Date.parse(n.at))) return;
        out.voice.push({ id: str(n.id, 80), title: str(n.title, 120), tag: VOICE_TAGS.some(function (x) { return x[0] === n.tag; }) ? n.tag : 'other', at: new Date(Date.parse(n.at)).toISOString(), duration: Math.max(0, +n.duration || 0), mime: str(n.mime, 60) || 'audio/webm' });
      });
    }
    if (src.letter && typeof src.letter.text === 'string' && src.letter.text.trim() && isFinite(Date.parse(src.letter.sealedAt))) {
      out.letter = { text: src.letter.text.slice(0, 8000), sealedAt: new Date(Date.parse(src.letter.sealedAt)).toISOString(), openedAt: isFinite(Date.parse(src.letter.openedAt)) ? new Date(Date.parse(src.letter.openedAt)).toISOString() : null, season: +src.letter.season || 1 };
    }
    if (Array.isArray(src.seasons)) {
      out.seasons = src.seasons.filter(function (x) { return x && isFinite(Date.parse(x.endedAt)); }).map(function (x) {
        return { number: +x.number || 1, startDate: parseYmd(x.startDate) ? x.startDate : null, endedAt: new Date(Date.parse(x.endedAt)).toISOString(), decisions: +x.decisions || 0, days: +x.days || 0, letter: typeof x.letter === 'string' ? x.letter.slice(0, 8000) : '' };
      });
    }
    if (Array.isArray(src.hardMoments)) {
      out.hardMoments = src.hardMoments.filter(function (h) { return h && isFinite(Date.parse(h.at)); }).map(function (h) { return { at: new Date(Date.parse(h.at)).toISOString(), outcome: h.outcome === 'logged' ? 'logged' : 'closed' }; }).slice(-1000);
    }
    // Existing users who already have data skip the first-run ritual.
    out.onboarded = src.onboarded === true || (Array.isArray(src.categories) && src.categories.length > 0);
    if (src.lock && typeof src.lock.hash === 'string' && typeof src.lock.salt === 'string') out.lock = { hash: src.lock.hash.slice(0, 128), salt: src.lock.salt.slice(0, 64) };
    if (Array.isArray(src.checkins)) {
      out.checkins = src.checkins.filter(function (c) { return c && isFinite(Date.parse(c.at)); }).map(function (c) { return { at: new Date(Date.parse(c.at)).toISOString() }; }).slice(-200);
    }

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
    unlocked: (function () { try { return sessionStorage.getItem('td-unlocked') === '1'; } catch (e) { return false; } })(),
    historyFilter: null,
    historyLimit: HISTORY_PAGE,
    openEntries: Object.create(null),
    cardPick: null,
    introDone: false,
    proofAll: false,
    view: 'decisions',
    betsAll: false,
    wonFilter: null
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

  /** Battles and Record are out of sight: Private mode, or a PIN lock not yet opened this session. */
  function isLocked() { return !!state.lock && !ui.unlocked; }
  function hiddenNow() { return state.settings.privateMode || isLocked(); }

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
    renderBattles(v);
    renderRecord(v);
    renderSettings();
    applyTheme();
    scheduleThumb();
    $('.fab').classList.toggle('is-attn', v.today === 0 && state.categories.length > 0);
    renderHooks.forEach(function (fn) { try { fn(v); } catch (e) { if (window.console) console.error(e); } });
  }
  var renderHooks = [];

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
    // Pace over the last 7 days, or fewer if you started less than a week ago.
    var paceDays = clamp(v.day, 1, 7);
    var pace7 = v.health.total7 / paceDays;
    var remaining = Math.max(0, goal - v.total);
    var finish;
    if (!remaining) finish = { value: 'Done', note: 'Goal reached' };
    else if (v.day < 3) finish = { value: '—', note: 'Your projection appears on Day 3, once there’s a pace to measure' };
    else if (!pace7) finish = { value: '—', note: 'Log decisions this week to get a projection' };
    else {
      var daysLeft = Math.ceil(remaining / pace7);
      var date = new Date(v.now);
      date.setDate(date.getDate() + daysLeft);
      finish = {
        value: date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: date.getFullYear() !== v.now.getFullYear() ? 'numeric' : undefined }),
        note: daysLeft + ' days at your ' + paceDays + '-day pace of ' + pace7.toFixed(1) + ' a day'
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
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(avg7).toFixed(1) + '" y2="' + y(avg7).toFixed(1) + '" style="stroke:var(--gold)" stroke-width="2" stroke-dasharray="6 4"/>');
      out.push('<text x="' + (W - R) + '" y="' + (y(avg7) - 6).toFixed(1) + '" text-anchor="end" style="fill:var(--gold-ink);font-weight:700">7-day avg ' + avg7.toFixed(1) + '</text>');
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
      var col = hc(h);
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
    var ci = hiddenNow() ? '' : checkinHtml(v) + reviewDueHtml(v, true);
    if (!line && !q && !ci) {
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
    el.innerHTML = html + ci;
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
        out.push('<rect x="' + (left + (h - H0) * (cw + gap)) + '" y="' + (top + r * (ch + gap)) + '" width="' + cw + '" height="' + ch + '" rx="2" style="fill:' + (n ? 'var(--ink);fill-opacity:' + a.toFixed(2) : 'var(--surface-3)') + '"><title>' + days[r] + ' ' + I.hourLabel(h) + ': ' + n + '</title></rect>');
      }
    });
    if (pt.strongest && pt.ready) {
      var sx = left + (Math.max(H0, pt.strongest.start) - H0) * (cw + gap) - 2;
      out.push('<rect x="' + sx + '" y="' + (top - 2) + '" width="' + (3 * (cw + gap) + 1) + '" height="' + (7 * (ch + gap) + 1) + '" fill="none" style="stroke:var(--gold)" stroke-width="2.5" rx="3"/>');
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
        cls.push(isToday ? 't' : 'f');
        out.push('<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="0.6" class="' + cls.join(' ') + '"/>');
      } else {
        out.push('<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '" rx="0.6" class="e"/>');
      }
    }
    host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + grid.height.toFixed(2) + '" role="img" aria-label="' + n + ' of ' + goal + ' squares filled, one per decision">' + out.join('') + '</svg>';
    legend.innerHTML = '<span><i class="f"></i>Logged</span><span><i class="t"></i>Today</span><span>1 square = 1 decision · 100 per block</span>';
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

  /** Health colors adjusted for the current theme (dark themes get dark bar tracks). */
  function hc(h) {
    var c = H.colorsFor(h);
    var t = state.settings.theme;
    if (t === 'stone') return c;
    return { fill: c.fill, onFill: c.onFill, ink: c.ink, track: H.mixHex(c.fill, THEME_BG[t], 0.78) };
  }

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'stone') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_BG[t]);
    $$('.theme-opt').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === t)); });
    var btn = $('#theme-btn');
    if (btn) btn.title = 'Theme: ' + THEME_LABEL[t] + ' (T)';
  }

  function setTheme(t) {
    commit(function (s) { s.settings.theme = t; });
    toast('Theme: ' + THEME_LABEL[t]);
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
      var col = hc(h);
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
      var col = hc(h);
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
    sheetBody._chips = [];
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
        var col = hc(h);
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
    var col = hc(h);
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
      data: state
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
        if (window.TDTrust) window.TDTrust.snapshot('Before import');
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
      if (window.TDTrust) window.TDTrust.snapshot('Before erase');
      state.voice.forEach(function (n) { MEDIA.remove(n.id).catch(function () {}); });
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


  // ── Battles ────────────────────────────────────────────────────────────
  function checkinHtml(v) {
    if (!BT.checkinDue(state.battles, state.checkins, v.now, state.settings.checkinDays)) return '';
    var first = !state.battles.length && !state.checkins.length;
    return '<div class="pulse__ask checkin-row">' +
      '<p>' + (first ? 'Battles: track the hard things you go through, so you can see you always get through them.' : (state.settings.checkinDays === 30 ? 'A month' : 'Two weeks') + ' since your last check-in.') + ' <span>Anything weighing on you right now?</span></p>' +
      '<div class="pulse__answers"><button type="button" class="chip" data-action="battle-new">Add a battle</button><button type="button" class="chip" data-action="checkin-calm">All good</button></div></div>';
  }

  function areaOptions() {
    var list = BT.AREAS.slice(0, -1);
    state.categories.forEach(function (c) { if (list.indexOf(c.name) === -1 && list.length < 10) list.push(c.name); });
    state.battles.forEach(function (b) { if (list.indexOf(b.area) === -1 && b.area !== 'Other' && list.length < 12) list.push(b.area); });
    list.push('Other');
    return list;
  }

  function weightSquares(w, cls) {
    var out = '<span class="wsq' + (cls ? ' ' + cls : '') + '" aria-label="Weight ' + w + ' of 5">';
    for (var i = 1; i <= 5; i++) out += '<i class="' + (i <= w ? 'on' : '') + '"></i>';
    return out + '</span>';
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(LOCALE, o);
  }

  function helpedLabel(key) {
    var h = BT.HELPED.filter(function (x) { return x[0] === key; })[0];
    return h ? h[1] : key;
  }

  function beenHereHtml(list) {
    if (!list.length) return '';
    return '<div class="been"><p class="been__title">You’ve been here before.</p>' + list.map(function (b) {
      return '<div class="been__item"><p><b>' + esc(fmtDate(b.startedAt)) + ' · “' + esc(b.title) + '”</b>, heavy ' + b.weight + '/5. <b>Over in ' + BT.days(b) + ' ' + plural(BT.days(b), 'day') + '.</b></p>' +
        (b.helped && b.helped.length ? '<p>What helped: ' + b.helped.map(function (h) { return esc(helpedLabel(h).toLowerCase()); }).join(', ') + '.</p>' : '') +
        (b.note ? '<p class="been__note">Your note: “' + esc(b.note) + '”</p>' : '') + '</div>';
    }).join('') + '</div>';
  }

  var VIEWS = ['decisions', 'battles', 'record'];
  function applyView() {
    var battles = ui.view === 'battles';
    VIEWS.forEach(function (name) { $('#view-' + name).hidden = ui.view !== name; });
    $$('.tab').forEach(function (t) {
      if (t.dataset.view === ui.view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    document.body.classList.toggle('is-battles', battles);
  }

  function renderBattles(v) {
    var priv = hiddenNow();
    var activeList = BT.active(state.battles);
    var countEl = $('#tab-battles-count');
    countEl.hidden = priv || !activeList.length;
    countEl.textContent = activeList.length;
    $('#private-btn').textContent = priv ? 'Private mode: on' : 'Private mode';
    $('#private-btn').setAttribute('aria-pressed', String(priv));
    $('#battles-body').hidden = priv;
    $('#private-note').hidden = !state.settings.privateMode;
    var sum = BT.summary(state.battles, v.now);
    $('#war-stats').innerHTML = priv
      ? '<div><dt>Battles</dt><dd>—</dd></div>'
      : '<div><dt>Battles fought</dt><dd>' + sum.fought + '</dd></div>' +
        '<div><dt>Behind you</dt><dd>' + sum.over + '</dd></div>' +
        '<div><dt>Average length</dt><dd>' + (sum.avgDays ? sum.avgDays + '<small>days</small>' : '—') + '</dd></div>' +
        '<div><dt>In the fight</dt><dd>' + sum.open + '</dd></div>';
    var line;
    if (priv) line = 'Private mode is on.';
    else if (!sum.fought) line = 'Write down what you’re fighting. In a few months you’ll see that every one of them ended.';
    else if (!sum.open) line = 'Every battle you’ve logged is behind you.';
    else if (!sum.over) line = 'You’re in it now. Log it, keep deciding, and mark it over when it’s done.';
    else line = 'Every one of them ended, except the ' + (sum.open === 1 ? 'one' : sum.open) + ' you’re in now.';
    $('#war-line').textContent = line;
    if (priv) return;

    var ci = checkinHtml(v);
    $('#checkin').hidden = !ci;
    $('#checkin').innerHTML = ci;

    // Current battles
    $('#active-list').innerHTML = activeList.length ? '<div class="fights">' + activeList.map(function (b) {
      var d = BT.days(b, v.now);
      var typ = BT.typicalDays(state.battles, b.area);
      var w = BT.weightNow(b);
      var care = BT.careLine(b, state.battles, v.now);
      var progress = typ ? Math.min(100, (d / typ.days) * 100) : null;
      return '<article class="fight">' +
        '<button type="button" class="fight__main" data-action="battle-open" data-id="' + b.id + '">' +
        '<span class="fight__area">' + esc(b.area) + '</span>' + weightSquares(w) +
        '<h3 class="fight__title">' + esc(b.title) + '</h3>' +
        '<p class="fight__day"><b>Day ' + d + '</b>' + (typ ? ' · your ' + (typ.basis === 'area' ? esc(b.area) + ' battles' : 'battles') + ' usually end in ~' + typ.days + ' days' : ' · started ' + esc(fmtDate(b.startedAt))) + '</p>' +
        (progress !== null ? '<span class="fight__bar"><i style="width:' + progress.toFixed(0) + '%"></i></span>' : '') +
        '<p class="fight__kept">' + BT.decisionsSince(b, state.decisions) + ' decisions made since it started</p>' +
        (b.step ? '<p class="fight__step">Next small step: ' + esc(b.step) + '</p>' : '') +
        (care ? '<p class="fight__care">' + esc(care) + '</p>' : '') +
        '</button>' +
        '<div class="fight__actions"><button type="button" class="btn btn--soft" data-action="battle-update" data-id="' + b.id + '">Update</button>' +
        '<button type="button" class="btn btn--primary" data-action="battle-close" data-id="' + b.id + '">It’s over</button></div>' +
        '</article>';
    }).join('') + '</div>'
      : '<div class="empty"><div class="empty__art" aria-hidden="true">' + new Array(16).join('<i></i>') + '</div><strong>No open battles</strong><span>When something starts weighing on you, log it here. It takes ten seconds.</span>' +
        '<button type="button" class="btn btn--primary" data-action="battle-new" style="margin-top:10px">New battle</button></div>';

    renderTimeline(v);

    // Repeats
    var rep = BT.repeats(state.battles, v.now);
    $('#repeat-body').innerHTML = rep.length ? rep.map(function (r) {
      return '<div class="repeat"><p class="repeat__head"><b>' + esc(r.area) + ': ' + r.count + ' battles in 6 months</b>, ~' + r.avgDays + ' days each.</p>' +
        '<p>Whatever you’re doing ends them, but it isn’t fixing the cause.</p>' +
        '<p class="repeat__titles">' + r.titles.map(function (t) { return '“' + esc(t) + '”'; }).join(' · ') + '</p></div>';
    }).join('') : '<p class="chart-empty">Nothing repeating yet. If the same kind of battle shows up 3 times in 6 months, it lands here.</p>';

    // What works
    var works = BT.whatWorks(state.battles);
    var dis = BT.disciplineUnderFire(state.battles, state.decisions, v.now);
    var worksHtml = works.length ? '<ul class="works">' + works.map(function (x, i) {
      var max = works[works.length - 1].avgDays || 1;
      return '<li><span class="works__label">' + esc(x.label) + '</span><span class="works__bar"><i class="' + (i === 0 ? 'best' : '') + '" style="width:' + Math.max(6, (x.avgDays / max) * 100).toFixed(0) + '%"></i></span><b>' + x.avgDays + ' days</b><small>' + x.count + ' battles</small></li>';
    }).join('') + '</ul><p class="works__note">Average length of battles where each one helped. Shorter is better.</p>'
      : '<p class="chart-empty">When you mark battles over and tick what helped, this ranks what actually works for you.</p>';
    if (dis && dis.ratio !== null) {
      var pctv = Math.round(dis.ratio * 100);
      worksHtml += '<div class="fire"><p class="fire__big">' + pctv + '%</p><p>' + (pctv >= 85
        ? 'of your normal discipline, kept even during hard times. That’s rare.'
        : 'of your normal discipline during hard times. Small decisions are what carry you through; one a day is enough.') + '</p></div>';
    }
    $('#works-body').innerHTML = worksHtml;

    // History
    var done = BT.closed(state.battles).sort(function (a, b) { return Date.parse(b.endedAt) - Date.parse(a.endedAt); });
    $('#won-count').textContent = done.length;
    var areas = [];
    done.forEach(function (b) { if (areas.indexOf(b.area) === -1) areas.push(b.area); });
    if (ui.wonFilter && areas.indexOf(ui.wonFilter) === -1) ui.wonFilter = null;
    $('#won-filters').hidden = areas.length < 2;
    $('#won-filters').innerHTML = '<button type="button" class="chip" data-action="won-filter" data-area="" aria-pressed="' + !ui.wonFilter + '">All <b>' + done.length + '</b></button>' +
      areas.map(function (a) { return '<button type="button" class="chip" data-action="won-filter" data-area="' + esc(a) + '" aria-pressed="' + (ui.wonFilter === a) + '">' + esc(a) + ' <b>' + done.filter(function (b) { return b.area === a; }).length + '</b></button>'; }).join('');
    var shown = done.filter(function (b) { return !ui.wonFilter || b.area === ui.wonFilter; });
    if (!shown.length) {
      $('#won-list').innerHTML = '<p class="chart-empty">Battles you mark over are kept here, sorted by when they ended.</p>';
      return;
    }
    var html = '', lastMonth = '';
    shown.forEach(function (b) {
      var m = new Date(b.endedAt).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
      if (m !== lastMonth) {
        html += (lastMonth ? '</ul>' : '') + '<h3 class="day-head">' + esc(m) + '</h3><ul class="wonlist">';
        lastMonth = m;
      }
      var st = BT.STATUSES[b.status];
      html += '<li><button type="button" class="won" data-action="battle-open" data-id="' + b.id + '">' +
        '<span class="won__status won__status--' + b.status + '">' + esc(st.label) + '</span>' +
        '<span class="won__main"><b>' + esc(b.title) + '</b><small>' + esc(b.area) + ' · ' + esc(fmtDate(b.startedAt)) + ' → ' + esc(fmtDate(b.endedAt)) + (b.helped.length ? ' · ' + b.helped.map(helpedLabel).map(esc).join(', ') : '') + '</small>' +
        (b.note ? '<em>“' + esc(b.note) + '”</em>' : '') + '</span>' +
        weightSquares(b.weight, 'wsq--sm') + '<span class="won__days">' + BT.days(b) + '<small>days</small></span></button></li>';
    });
    $('#won-list').innerHTML = html + '</ul>';
  }

  function renderTimeline(v) {
    var body = $('#timeline-body');
    if (!state.battles.length) {
      body.innerHTML = '<p class="chart-empty">Your battles will appear here as bars on a timeline, so you can see the hard stretches and that they always ended.</p>';
      return;
    }
    var lanes = [];
    BT.AREAS.concat(state.battles.map(function (b) { return b.area; })).forEach(function (a) {
      if (lanes.indexOf(a) === -1 && state.battles.some(function (b) { return b.area === a; })) lanes.push(a);
    });
    var now = v.now.getTime();
    var first = Math.min.apply(null, state.battles.map(function (b) { return Date.parse(b.startedAt); }));
    var from = Math.min(first, now - 90 * 86400000) - 3 * 86400000;
    var to = now + 4 * 86400000;
    var W = 1000, L = 112, R = 10, laneH = 40, top = 10, bottom = 28;
    var Hh = top + lanes.length * laneH + bottom;
    function x(ms) { return L + (W - L - R) * (ms - from) / (to - from); }
    var out = [];
    // month ticks
    var m = new Date(from); m.setDate(1); m.setHours(0, 0, 0, 0); m.setMonth(m.getMonth() + 1);
    var step = (to - from) / 86400000 > 400 ? 3 : 1;
    while (m.getTime() < to) {
      var mx = x(m.getTime());
      out.push('<line class="grid" x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + top + '" y2="' + (Hh - bottom) + '"/>');
      if (Math.abs(mx - x(now)) > 70) out.push('<text x="' + (mx + 4).toFixed(1) + '" y="' + (Hh - 9) + '">' + m.toLocaleDateString(LOCALE, { month: 'short', year: m.getMonth() === 0 ? '2-digit' : undefined }) + '</text>');
      m.setMonth(m.getMonth() + step);
    }
    var tx = x(now);
    out.push('<line x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + (top - 4) + '" y2="' + (Hh - bottom) + '" style="stroke:var(--gold)" stroke-width="2"/><text x="' + (tx - 4).toFixed(1) + '" y="' + (Hh - 9) + '" text-anchor="end" style="fill:var(--gold-ink);font-weight:700">Today</text>');
    lanes.forEach(function (a, i) {
      var y = top + i * laneH;
      out.push('<text x="0" y="' + (y + laneH / 2 + 4) + '" style="font-weight:700;fill:var(--ink-2)">' + esc(a) + '</text>');
      out.push('<line class="axis" x1="' + L + '" x2="' + (W - R) + '" y1="' + (y + laneH - 0.5) + '" y2="' + (y + laneH - 0.5) + '"/>');
      state.battles.filter(function (b) { return b.area === a; }).forEach(function (b) {
        var s0 = x(Date.parse(b.startedAt));
        var e0 = x(b.status === 'active' ? now : Date.parse(b.endedAt) + 86400000);
        var wv = Math.max(6, e0 - s0);
        var alpha = (0.28 + b.weight * 0.14).toFixed(2);
        out.push('<rect class="tl-bar" data-action="battle-open" data-id="' + b.id + '" x="' + s0.toFixed(1) + '" y="' + (y + 9) + '" width="' + wv.toFixed(1) + '" height="' + (laneH - 18) + '" rx="3" style="fill:var(--ink);fill-opacity:' + alpha + (b.status === 'active' ? ';stroke:var(--gold);stroke-width:2.5' : '') + '"><title>' + esc(b.title) + ' · ' + BT.days(b, v.now) + ' days' + (b.status === 'active' ? ' so far' : '') + '</title></rect>');
      });
    });
    body.innerHTML = '<div class="tl-wrap"><svg class="tl" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Timeline of battles by area">' + out.join('') + '</svg></div>' +
      '<div class="chart__legend"><span><i style="background:var(--ink);opacity:.42"></i>Lighter</span><span><i style="background:var(--ink)"></i>Heavier</span><span><i style="background:transparent;border:2px solid var(--gold)"></i>Still in it</span><span>Click a bar for details</span></div>';
  }

  // New battle
  function openBattleEditor(opts) {
    opts = opts || {};
    var editing = opts.id ? state.battles.find(function (b) { return b.id === opts.id; }) : null;
    var draft = { title: editing ? editing.title : '', area: editing ? editing.area : null, weight: editing ? editing.weight : 3, step: editing ? editing.step : '' };
    openSheet(function (body) {
      body.innerHTML = sheetHead(editing ? 'Edit battle' : 'New battle', editing ? '' : 'What’s weighing on you? It starts today.') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<label class="field"><span class="field__label">The battle</span><input class="input" name="title" maxlength="120" enterkeyhint="done" placeholder="e.g. Lost my biggest client" value="' + esc(draft.title) + '"></label>' +
        '<div class="field"><span class="field__label">Area</span><div class="suggest" id="area-chips">' + areaOptions().map(function (a) {
          return '<button type="button" class="area-chip" data-area="' + esc(a) + '" aria-pressed="' + (draft.area === a) + '">' + esc(a) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><span class="field__label">How heavy? <em>1 annoying · 5 crushing</em></span><div class="weights" id="weights">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" class="weight" data-weight="' + n + '" aria-pressed="' + (draft.weight === n) + '">' + n + '</button>';
        }).join('') + '</div></div>' +
        '<label class="field"><span class="field__label">First small step <em>Optional</em></span><input class="input" name="step" maxlength="140" placeholder="e.g. Call two old clients" value="' + esc(draft.step) + '"></label>' +
        '<div id="been-box"></div>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">' + (editing ? 'Save' : 'Start tracking it') + '</button>' +
        (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">Delete battle</button>' : '') +
        '</form>';
      var form = $('form', body);
      var title = fld(form, 'title');
      function refresh() {
        $$('.area-chip', body).forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.area === draft.area)); });
        $$('.weight', body).forEach(function (c) { c.setAttribute('aria-pressed', String(+c.dataset.weight === draft.weight)); });
        $('#been-box', body).innerHTML = draft.area || title.value.trim() ? beenHereHtml(BT.beenHere(state.battles, draft.area, title.value, editing && editing.id)) : '';
      }
      refresh();
      title.addEventListener('input', function () { title.classList.remove('is-invalid'); refresh(); });
      body.onclick = function (e) {
        var a = e.target.closest('[data-area]');
        if (a) { draft.area = a.dataset.area; refresh(); return; }
        var w = e.target.closest('[data-weight]');
        if (w) { draft.weight = +w.dataset.weight; refresh(); return; }
        var sh = e.target.closest('[data-sheet]');
        if (sh && sh.dataset.sheet === 'delete') {
          confirmDialog({ title: 'Delete this battle?', text: '“' + editing.title + '” will be removed from your history.', okLabel: 'Delete', danger: true }).then(function (ok) {
            if (!ok) return;
            commit(function (st) { st.battles = st.battles.filter(function (b) { return b.id !== editing.id; }); });
            closeSheet();
            toast('Battle deleted');
          });
        }
      };
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = title.value.trim();
        if (!t) { title.classList.add('is-invalid'); title.focus(); return; }
        var area = draft.area || 'Other';
        var step = fld(form, 'step').value.trim();
        if (editing) {
          commit(function () { editing.title = t; editing.area = area; editing.weight = draft.weight; editing.step = step; });
          closeSheet();
          toast('Battle saved');
          return;
        }
        var b = { id: uid(), title: t, area: area, weight: draft.weight, step: step, startedAt: new Date().toISOString(), status: 'active', endedAt: null, helped: [], note: '', updates: [] };
        commit(function (st) { st.battles.push(b); });
        closeSheet();
        toast('Battle logged. Day 1.', { sub: 'Keep making small decisions. Mark it over when it’s done.' });
      });
    }, { className: 'sheet--battle', label: editing ? 'Edit battle' : 'New battle', focus: function () { if (!editing) $('input[name="title"]', sheetBody).focus({ preventScroll: true }); } });
  }

  function openBattleUpdate(id) {
    var b = state.battles.find(function (x) { return x.id === id; });
    if (!b) return;
    var w = BT.weightNow(b);
    openSheet(function (body) {
      body.innerHTML = sheetHead('Update', esc(b.title) + ' · Day ' + BT.days(b)) +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<div class="field"><span class="field__label">How heavy is it now?</span><div class="weights">' + [1, 2, 3, 4, 5].map(function (n) {
          return '<button type="button" class="weight" data-weight="' + n + '" aria-pressed="' + (w === n) + '">' + n + '</button>';
        }).join('') + '</div></div>' +
        '<label class="field"><span class="field__label">Note <em>Optional</em></span><input class="input" name="note" maxlength="200" placeholder="e.g. Signed one new client"></label>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">Save update</button></form>';
      body.onclick = function (e) {
        var x = e.target.closest('[data-weight]');
        if (!x) return;
        w = +x.dataset.weight;
        $$('.weight', body).forEach(function (c) { c.setAttribute('aria-pressed', String(+c.dataset.weight === w)); });
      };
      $('form', body).addEventListener('submit', function (e) {
        e.preventDefault();
        var note = fld(e.target, 'note').value.trim();
        commit(function () { b.updates.push({ at: new Date().toISOString(), weight: w, note: note }); });
        closeSheet();
        toast(w < b.weight ? 'Lighter than when it started.' : 'Updated');
      });
    }, { className: 'sheet--battle', label: 'Update battle' });
  }

  function openBattleClose(id) {
    var b = state.battles.find(function (x) { return x.id === id; });
    if (!b) return;
    var draft = { status: 'won', helped: [] };
    openSheet(function (body) {
      body.innerHTML = sheetHead('It’s over', esc(b.title) + ' · ' + BT.days(b) + ' ' + plural(BT.days(b), 'day')) +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<div class="field"><span class="field__label">How did it end?</span><div class="suggest">' + Object.keys(BT.STATUSES).map(function (k) {
          return '<button type="button" class="area-chip" data-status="' + k + '" aria-pressed="' + (draft.status === k) + '">' + esc(BT.STATUSES[k].long) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="field"><span class="field__label">What helped? <em>Pick any</em></span><div class="suggest">' + BT.HELPED.map(function (h) {
          return '<button type="button" class="area-chip" data-helped="' + h[0] + '" aria-pressed="false">' + esc(h[1]) + '</button>';
        }).join('') + '</div></div>' +
        '<label class="field"><span class="field__label">One line for future you <em>Shown the next time something like this starts</em></span><input class="input" name="note" maxlength="160" placeholder="e.g. It passed. Make the calls, don’t wait."></label>' +
        '<label class="check"><input type="checkbox" name="asLesson" checked><span><b>Save it as a lesson</b><small>Adds this line to your Lessons in the Record tab.</small></span></label>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">Mark it over</button></form>';
      body.onclick = function (e) {
        var s1 = e.target.closest('[data-status]');
        if (s1) {
          draft.status = s1.dataset.status;
          $$('[data-status]', body).forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.status === draft.status)); });
          return;
        }
        var h = e.target.closest('[data-helped]');
        if (h) {
          var k = h.dataset.helped;
          var i = draft.helped.indexOf(k);
          if (i === -1) draft.helped.push(k); else draft.helped.splice(i, 1);
          h.setAttribute('aria-pressed', String(i === -1));
        }
      };
      $('form', body).addEventListener('submit', function (e) {
        e.preventDefault();
        var note = fld(e.target, 'note').value.trim();
        var asLesson = fld(e.target, 'asLesson').checked && note;
        commit(function (st) {
          if (asLesson) st.lessons.push({ id: uid(), text: note, area: b.area, pinned: false, at: new Date().toISOString(), source: { type: 'battle', id: b.id } });
          b.status = draft.status;
          b.endedAt = new Date().toISOString();
          b.helped = draft.helped.slice();
          b.note = note;
        });
        closeSheet();
        var n = BT.closed(state.battles).length;
        toast('Battle ' + n + ' over. ' + BT.days(b) + ' ' + plural(BT.days(b), 'day') + '. Logged.', { sub: 'One more reminder that they end.' });
      });
    }, { className: 'sheet--battle', label: 'Close battle' });
  }

  function openBattleDetail(id) {
    var b = state.battles.find(function (x) { return x.id === id; });
    if (!b) return;
    openSheet(function (body) {
      var d = BT.days(b);
      var typ = BT.typicalDays(state.battles.filter(function (x) { return x.id !== b.id; }), b.area);
      var points = [{ at: b.startedAt, weight: b.weight }].concat(b.updates.filter(function (u) { return u.weight; }));
      var spark = '';
      if (points.length > 1) {
        var W = 300, Hh = 60;
        var t0 = Date.parse(points[0].at), t1 = Math.max(t0 + 1, Date.parse(points[points.length - 1].at));
        spark = '<svg class="wspark" viewBox="0 0 ' + W + ' ' + Hh + '"><polyline fill="none" style="stroke:var(--ink)" stroke-width="2.5" points="' + points.map(function (p) {
          return (8 + (W - 16) * (Date.parse(p.at) - t0) / (t1 - t0)).toFixed(1) + ',' + (8 + (Hh - 16) * (5 - p.weight) / 4).toFixed(1);
        }).join(' ') + '"/></svg>';
      }
      body.innerHTML = sheetHead(esc(b.title), esc(b.area) + ' · ' + (b.status === 'active' ? 'Day ' + d + ', started ' + esc(fmtDate(b.startedAt)) : esc(BT.STATUSES[b.status].long) + ' · ' + d + ' days, ' + esc(fmtDate(b.startedAt)) + ' → ' + esc(fmtDate(b.endedAt))), { eyebrow: b.status === 'active' ? 'In the fight' : 'Behind you' }) +
        '<div class="stat-pair"><div class="stat"><div class="stat__num">' + d + '</div><div class="stat__label">' + (b.status === 'active' ? 'Days so far' : 'Days it lasted') + (typ ? ' · usual ~' + typ.days : '') + '</div></div>' +
        '<div class="stat"><div class="stat__num">' + BT.decisionsSince(b, state.decisions) + '</div><div class="stat__label">Decisions made meanwhile</div></div></div>' +
        '<div class="sheet__section"><p class="sheet__section-title"><span>Weight</span><span>' + weightSquares(BT.weightNow(b)) + '</span></p>' + (spark || '<p class="mini-empty">Updates show here as a line, so you can see it getting lighter.</p>') + '</div>' +
        (b.step ? '<div class="sheet__section"><p class="sheet__section-title"><span>First small step</span></p><p>' + esc(b.step) + '</p></div>' : '') +
        (b.helped.length || b.note ? '<div class="sheet__section"><p class="sheet__section-title"><span>What got you through</span></p>' + (b.helped.length ? '<p>' + b.helped.map(helpedLabel).map(esc).join(' · ') + '</p>' : '') + (b.note ? '<p class="been__note">“' + esc(b.note) + '”</p>' : '') + '</div>' : '') +
        (b.updates.length ? '<div class="sheet__section"><p class="sheet__section-title"><span>Updates</span></p><div class="mini-list">' + b.updates.slice().reverse().map(function (u) {
          return '<div class="mini"><span class="mini__text">' + (u.note ? esc(u.note) : 'Weight ' + u.weight + '/5') + '</span><span class="mini__date">' + esc(fmtDate(u.at)) + '</span></div>';
        }).join('') + '</div></div>' : '') +
        (b.status === 'active' ? beenHereHtml(BT.beenHere(state.battles, b.area, b.title, b.id)) : '') +
        '<div class="sheet__actions">' +
        (b.status === 'active' ? '<button type="button" class="btn btn--primary btn--lg btn--block" data-sheet="close-battle">It’s over</button><button type="button" class="btn btn--soft btn--block" data-sheet="update">Update</button>' : '<button type="button" class="btn btn--soft btn--block" data-sheet="reopen">Reopen</button>') +
        '<button type="button" class="btn btn--ghost btn--block" data-sheet="edit">Edit or delete</button></div>';
      body.onclick = function (e) {
        var a = e.target.closest('[data-sheet]');
        if (!a) return;
        if (a.dataset.sheet === 'close-battle') openBattleClose(b.id);
        else if (a.dataset.sheet === 'update') openBattleUpdate(b.id);
        else if (a.dataset.sheet === 'edit') openBattleEditor({ id: b.id });
        else if (a.dataset.sheet === 'reopen') {
          commit(function () { b.status = 'active'; b.endedAt = null; });
          closeSheet();
          toast('Reopened');
        }
      };
    }, { className: 'sheet--battle', label: 'Battle details' });
  }

  function setView(view, push) {
    ui.view = VIEWS.indexOf(view) !== -1 ? view : 'decisions';
    applyView();
    if (push && location.hash !== '#' + ui.view) {
      try { history.replaceState(null, '', '#' + ui.view); } catch (e) { location.hash = ui.view; }
    }
    window.scrollTo(0, 0);
  }


  // ── Record: Big Bets, Firsts, Lessons, Voice notes ─────────────────────
  function reviewDueHtml(v, compact) {
    var due = RC.dueReviews(state.bets, v.now);
    if (!due.length) return '';
    var b = due[0];
    var n = RC.nextReview(b, v.now);
    return '<div class="pulse__ask review-row">' +
      '<p><b>' + n.months + '-month review:</b> “' + esc(b.title) + '”. <span>Was it the right call?</span>' + (due.length > 1 ? ' <small>+' + (due.length - 1) + ' more</small>' : '') + '</p>' +
      '<div class="pulse__answers"><button type="button" class="chip" data-action="bet-review" data-id="' + b.id + '">Review now</button></div></div>';
  }

  function renderRecord(v) {
    var priv = hiddenNow();
    var due = RC.dueReviews(state.bets, v.now);
    var cnt = $('#tab-record-count');
    cnt.hidden = priv || !due.length;
    cnt.textContent = due.length;
    $('#record-body').hidden = priv;
    $('#record-private').hidden = !state.settings.privateMode;
    var j = RC.judgment(state.bets);
    $('#record-stats').innerHTML = priv ? '<div><dt>Record</dt><dd>—</dd></div>' :
      '<div><dt>Big bets</dt><dd>' + state.bets.length + '</dd></div>' +
      '<div><dt>Firsts</dt><dd>' + state.firsts.length + '</dd></div>' +
      '<div><dt>Lessons</dt><dd>' + state.lessons.length + '</dd></div>' +
      '<div><dt>Voice notes</dt><dd>' + state.voice.length + '</dd></div>';
    if (priv) return;

    $('#reviews-due').innerHTML = due.length ? '<div class="pulse">' + reviewDueHtml(v) + '</div>' : '';

    // Judgment
    $('#judgment').innerHTML = j.reviewed ? '<div class="judge">' +
      '<div class="judge__big"><b>' + Math.round(j.rate * 100) + '%</b><span>right calls</span></div>' +
      '<div class="judge__bar"><i class="r" style="flex:' + j.right + '"></i><i class="m" style="flex:' + j.mixed + '"></i><i class="w" style="flex:' + j.wrong + '"></i></div>' +
      '<p>' + j.right + ' right · ' + j.mixed + ' mixed · ' + j.wrong + ' wrong, out of ' + j.reviewed + ' reviewed.' +
      (j.confRight !== null && j.confWrong !== null ? ' When you were right you felt ' + j.confRight.toFixed(1) + '/5 sure; when wrong, ' + j.confWrong.toFixed(1) + '/5.' + (j.confWrong >= j.confRight ? ' Your confidence isn’t a good guide yet.' : '') : '') + '</p></div>' : '';

    // Bets
    var bets = state.bets.slice().sort(function (a, b) { return Date.parse(b.madeAt) - Date.parse(a.madeAt); });
    var shownBets = ui.betsAll ? bets : bets.slice(0, 6);
    $('#bets-list').innerHTML = bets.length ? '<div class="bets">' + shownBets.map(function (b) {
      var n = RC.nextReview(b, v.now);
      var lv = RC.latestVerdict(b);
      return '<button type="button" class="bet" data-action="bet-open" data-id="' + b.id + '">' +
        '<span class="bet__top"><span class="fight__area">' + esc(b.area) + ' · ' + esc(fmtDate(b.madeAt)) + '</span>' + (lv ? '<span class="verdict verdict--' + lv + '">' + RC.VERDICTS[lv].short + '</span>' : '') + '</span>' +
        '<span class="bet__title">' + esc(b.title) + '</span>' +
        (b.expect ? '<span class="bet__expect">Expected: ' + esc(b.expect) + '</span>' : '') +
        '<span class="bet__next' + (n && n.due ? ' is-due' : '') + '">' + (n ? (n.due ? n.months + '-month review is due' : n.months + '-month review in ' + n.inDays + ' ' + plural(n.inDays, 'day')) : 'All reviews done') + '</span>' +
        '</button>';
    }).join('') + '</div>' + (bets.length > 6 ? '<button type="button" class="btn btn--soft btn--block" data-action="bets-toggle">' + (ui.betsAll ? 'Show fewer' : 'Show all ' + bets.length) + '</button>' : '')
      : '<p class="chart-empty">No big bets yet. The next time you make a call that changes your direction, log it here before you know how it turns out.</p>';

    // Firsts
    var groups = RC.firstsByYear(state.firsts);
    $('#firsts-list').innerHTML = groups.length ? groups.map(function (g) {
      return '<h3 class="day-head">' + g.year + ' <b>' + g.items.length + '</b></h3><ul class="firsts">' + g.items.map(function (f) {
        return '<li><button type="button" class="first" data-action="first-edit" data-id="' + f.id + '"><span class="first__date">' + esc(parseYmd(f.date).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })) + '</span>' +
          '<span class="first__main"><b>' + esc(f.title) + '</b>' + (f.area || f.note ? '<small>' + esc([f.area, f.note].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></button></li>';
      }).join('') + '</ul>';
    }).join('') : '<p class="chart-empty">First client, first $1,000 month, first 100 kg bench, first time you said no to something big. Log them; they only happen once.</p>';

    // Voice
    var notes = state.voice.slice().sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
    $('#voice-list').innerHTML = !MEDIA.supported() ? '<p class="chart-empty">This browser can’t record audio. Open the app in Chrome or Edge.</p>' :
      notes.length ? '<ul class="voices">' + notes.map(function (n) {
        var tag = VOICE_TAGS.filter(function (x) { return x[0] === n.tag; })[0];
        return '<li class="voice" data-id="' + n.id + '"><button type="button" class="voice__play" data-action="voice-play" data-id="' + n.id + '" aria-label="Play">▶</button>' +
          '<span class="voice__main"><b>' + esc(n.title || (tag ? tag[1] : 'Voice note')) + '</b><small>' + esc(fmtDate(n.at)) + ' · ' + esc(fmtTime(new Date(n.at))) + ' · ' + RC.fmtDuration(n.duration) + (tag ? ' · ' + tag[1] : '') + '</small></span>' +
          '<button type="button" class="icon-btn" data-action="voice-download" data-id="' + n.id + '" aria-label="Download">' + icon('download') + '</button>' +
          '<button type="button" class="icon-btn" data-action="voice-delete" data-id="' + n.id + '" aria-label="Delete">' + icon('trash') + '</button></li>';
      }).join('') + '</ul>' : '<p class="chart-empty">No voice notes yet. Press V and talk for a minute.</p>';

    // Lessons
    var lv2 = RC.lessonsView(state.lessons);
    function lessonLi(l) {
      return '<li class="lesson' + (l.pinned ? ' is-pinned' : '') + '"><button type="button" class="lesson__pin" data-action="lesson-pin" data-id="' + l.id + '" aria-label="' + (l.pinned ? 'Unpin' : 'Pin') + '" title="' + (l.pinned ? 'Unpin' : 'Pin') + '">' + (l.pinned ? '★' : '☆') + '</button>' +
        '<button type="button" class="lesson__text" data-action="lesson-edit" data-id="' + l.id + '">' + esc(l.text) + '<small>' + esc(l.area) + (l.source.type !== 'manual' ? ' · from a ' + l.source.type : '') + ' · ' + esc(fmtDate(l.at)) + '</small></button></li>';
    }
    $('#lessons-list').innerHTML = state.lessons.length ?
      (lv2.pinned.length ? '<div class="pinned"><p class="proof__label">Pinned · ' + lv2.pinned.length + ' of ' + RC.MAX_PINNED + '</p><ol class="lessons lessons--pinned">' + lv2.pinned.map(lessonLi).join('') + '</ol></div>' : '') +
      '<div class="lesson-areas">' + lv2.areas.map(function (a) { return '<div><p class="proof__label">' + esc(a.area) + '</p><ul class="lessons">' + a.items.map(lessonLi).join('') + '</ul></div>'; }).join('') + '</div>'
      : '<p class="chart-empty">No lessons yet. When you close a battle or review a bet, the line you write can become a lesson with one tap.</p>';
  }

  function areaChips(selected) {
    return '<div class="suggest">' + areaOptions().map(function (a) {
      return '<button type="button" class="area-chip" data-area="' + esc(a) + '" aria-pressed="' + (selected === a) + '">' + esc(a) + '</button>';
    }).join('') + '</div>';
  }

  /** Single-choice chip groups inside the current sheet (reset every time a sheet opens). */
  function bindChips(body, attr, onPick) {
    body._chips = body._chips || [];
    body._chips.push({ attr: attr, onPick: onPick });
    if (body._chipsBound) return;
    body._chipsBound = true;
    body.addEventListener('click', function (e) {
      (body._chips || []).forEach(function (g) {
        var c = e.target.closest('[' + g.attr + ']');
        if (!c || !body.contains(c)) return;
        $$('[' + g.attr + ']', body).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        g.onPick(c.getAttribute(g.attr));
      });
    });
  }

  // Big bets
  function openBetEditor(opts) {
    opts = opts || {};
    var editing = opts.id ? state.bets.find(function (b) { return b.id === opts.id; }) : null;
    var d = { area: editing ? editing.area : null, confidence: editing ? editing.confidence : 3 };
    openSheet(function (body) {
      body.innerHTML = sheetHead(editing ? 'Edit big bet' : 'New big bet', editing ? '' : 'Write it down before you know how it turns out.') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<label class="field"><span class="field__label">The decision</span><input class="input" name="title" maxlength="140" placeholder="e.g. Quit my job to go full-time on the agency" value="' + esc(editing ? editing.title : '') + '"></label>' +
        '<div class="field"><span class="field__label">Area</span>' + areaChips(d.area) + '</div>' +
        '<label class="field"><span class="field__label">Why are you doing it?</span><textarea class="input" name="why" rows="2" maxlength="400" placeholder="The honest reason">' + esc(editing ? editing.why : '') + '</textarea></label>' +
        '<label class="field"><span class="field__label">What do you expect to happen? <em>Be specific, so you can check later</em></span><textarea class="input" name="expect" rows="2" maxlength="400" placeholder="e.g. Replace my salary within 6 months">' + esc(editing ? editing.expect : '') + '</textarea></label>' +
        '<label class="field"><span class="field__label">At 80, would you regret not doing it? <em>Bezos’ test</em></span><input class="input" name="regret" maxlength="300" placeholder="e.g. Yes. I’d always wonder." value="' + esc(editing ? editing.regret : '') + '"></label>' +
        '<div class="field"><span class="field__label">How sure are you? <em>1 coin flip · 5 certain</em></span><div class="weights">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="weight" data-conf="' + n + '" aria-pressed="' + (d.confidence === n) + '">' + n + '</button>'; }).join('') + '</div></div>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">' + (editing ? 'Save' : 'Log the bet') + '</button>' +
        (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">Delete</button>' : '') + '</form>';
      bindChips(body, 'data-area', function (a) { d.area = a; });
      bindChips(body, 'data-conf', function (n) { d.confidence = +n; });
      body.onclick = function (e) {
        var sh = e.target.closest('[data-sheet="delete"]');
        if (!sh) return;
        confirmDialog({ title: 'Delete this big bet?', text: '“' + editing.title + '” and its reviews will be removed.', okLabel: 'Delete', danger: true }).then(function (ok) {
          if (!ok) return;
          commit(function (st) { st.bets = st.bets.filter(function (b) { return b.id !== editing.id; }); });
          closeSheet();
        });
      };
      var form = $('form', body);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var title = fld(form, 'title');
        if (!title.value.trim()) { title.classList.add('is-invalid'); title.focus(); return; }
        var data = { title: title.value.trim(), area: d.area || 'Other', why: fld(form, 'why').value.trim(), expect: fld(form, 'expect').value.trim(), regret: fld(form, 'regret').value.trim(), confidence: d.confidence };
        if (editing) commit(function () { Object.assign(editing, data); });
        else commit(function (st) { st.bets.push(Object.assign({ id: uid(), madeAt: new Date().toISOString(), reviews: [] }, data)); });
        closeSheet();
        toast(editing ? 'Saved' : 'Big bet logged.', { sub: editing ? '' : 'You’ll review it in 3 months.' });
      });
    }, { className: 'sheet--battle', label: 'Big bet', focus: function () { if (!editing) $('input[name="title"]', sheetBody).focus({ preventScroll: true }); } });
  }

  function openBet(id) {
    var b = state.bets.find(function (x) { return x.id === id; });
    if (!b) return;
    var n = RC.nextReview(b);
    openSheet(function (body) {
      var age = RC.daysSince(b.madeAt);
      body.innerHTML = sheetHead(esc(b.title), esc(b.area) + ' · made ' + esc(fmtDate(b.madeAt)) + ' · ' + age + ' ' + plural(age, 'day') + ' ago', { eyebrow: 'Big bet' }) +
        '<dl class="bet-facts">' +
        (b.why ? '<div><dt>Why</dt><dd>' + esc(b.why) + '</dd></div>' : '') +
        (b.expect ? '<div><dt>What you expected</dt><dd>' + esc(b.expect) + '</dd></div>' : '') +
        (b.regret ? '<div><dt>At 80</dt><dd>' + esc(b.regret) + '</dd></div>' : '') +
        '<div><dt>How sure you were</dt><dd>' + weightSquares(b.confidence) + ' ' + b.confidence + '/5</dd></div></dl>' +
        '<div class="sheet__section"><p class="sheet__section-title"><span>Reviews</span></p><ol class="reviews">' + RC.CHECKPOINTS.map(function (c) {
          var r = b.reviews.filter(function (x) { return x.checkpoint === c.months; })[0];
          return '<li class="' + (r ? 'is-done' : '') + '"><span class="reviews__cp">' + c.months + ' mo</span>' + (r
            ? '<span><span class="verdict verdict--' + r.verdict + '">' + RC.VERDICTS[r.verdict].label + '</span>' + (r.note ? ' ' + esc(r.note) : '') + '</span>'
            : '<span class="muted">' + (n && n.months === c.months ? (n.due ? 'Due now' : 'In ' + n.inDays + ' days') : 'Later') + '</span>') + '</li>';
        }).join('') + '</ol></div>' +
        '<div class="sheet__actions">' + (n && n.due ? '<button type="button" class="btn btn--primary btn--lg btn--block" data-sheet="review">Review now</button>' : '') +
        '<button type="button" class="btn btn--soft btn--block" data-sheet="edit">Edit</button></div>';
      body.onclick = function (e) {
        var a = e.target.closest('[data-sheet]');
        if (!a) return;
        if (a.dataset.sheet === 'review') openBetReview(b.id);
        else if (a.dataset.sheet === 'edit') openBetEditor({ id: b.id });
      };
    }, { className: 'sheet--battle', label: 'Big bet' });
  }

  function openBetReview(id) {
    var b = state.bets.find(function (x) { return x.id === id; });
    if (!b) return;
    var n = RC.nextReview(b);
    if (!n) return openBet(id);
    var verdict = null;
    openSheet(function (body) {
      body.innerHTML = sheetHead(n.months + '-month review', esc(b.title), { eyebrow: 'Big bet' }) +
        (b.expect ? '<div class="been"><p class="been__title">What you expected</p><p class="been__item">' + esc(b.expect) + '</p>' + (b.why ? '<p class="been__item">Why: ' + esc(b.why) + '</p>' : '') + '</div>' : '') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<div class="field"><span class="field__label">Looking back, was it the right call?</span><div class="suggest">' + Object.keys(RC.VERDICTS).map(function (k) {
          return '<button type="button" class="area-chip" data-verdict="' + k + '" aria-pressed="false">' + RC.VERDICTS[k].label + '</button>';
        }).join('') + '</div></div>' +
        '<label class="field"><span class="field__label">What did you get right or wrong?</span><input class="input" name="note" maxlength="300" placeholder="e.g. Right move, but I underestimated how long sales take"></label>' +
        '<label class="check"><input type="checkbox" name="asLesson" checked><span><b>Save it as a lesson</b><small>Adds this line to your Lessons.</small></span></label>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">Save review</button></form>';
      bindChips(body, 'data-verdict', function (k) { verdict = k; });
      var form = $('form', body);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!verdict) return toast('Pick right, mixed or wrong first.', { tone: 'error' });
        var note = fld(form, 'note').value.trim();
        var asLesson = fld(form, 'asLesson').checked && note;
        commit(function (st) {
          b.reviews.push({ at: new Date().toISOString(), checkpoint: n.months, verdict: verdict, note: note });
          if (asLesson) st.lessons.push({ id: uid(), text: note, area: b.area, pinned: false, at: new Date().toISOString(), source: { type: 'bet', id: b.id } });
        });
        closeSheet();
        var next = RC.nextReview(b);
        toast('Review saved', { sub: next ? 'Next one at ' + next.months + ' months.' : 'All reviews done for this bet.' });
      });
    }, { className: 'sheet--battle', label: 'Review big bet' });
  }

  // Firsts
  function openFirstEditor(opts) {
    opts = opts || {};
    var editing = opts.id ? state.firsts.find(function (f) { return f.id === opts.id; }) : null;
    var d = { area: editing ? editing.area : null };
    openSheet(function (body) {
      body.innerHTML = sheetHead(editing ? 'Edit first' : 'New first', editing ? '' : 'Something that only happens once.') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<label class="field"><span class="field__label">The first</span><input class="input" name="title" maxlength="140" placeholder="e.g. First $1,000 month" value="' + esc(editing ? editing.title : '') + '"></label>' +
        '<label class="field"><span class="field__label">When <em>Today by default</em></span><input class="input" type="date" name="date" value="' + (editing ? editing.date : ymd(new Date())) + '" max="' + ymd(new Date()) + '"></label>' +
        '<div class="field"><span class="field__label">Area <em>Optional</em></span>' + areaChips(d.area) + '</div>' +
        '<label class="field"><span class="field__label">Note <em>Optional</em></span><input class="input" name="note" maxlength="300" placeholder="How it felt, who was there" value="' + esc(editing ? editing.note : '') + '"></label>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">' + (editing ? 'Save' : 'Log it') + '</button>' +
        (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">Delete</button>' : '') + '</form>';
      bindChips(body, 'data-area', function (a) { d.area = a; });
      body.onclick = function (e) {
        if (!e.target.closest('[data-sheet="delete"]')) return;
        commit(function (st) { st.firsts = st.firsts.filter(function (f) { return f.id !== editing.id; }); });
        closeSheet();
        toast('Deleted');
      };
      var form = $('form', body);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var title = fld(form, 'title');
        if (!title.value.trim()) { title.classList.add('is-invalid'); title.focus(); return; }
        var date = parseYmd(fld(form, 'date').value) ? fld(form, 'date').value : ymd(new Date());
        var data = { title: title.value.trim(), date: date, area: d.area && d.area !== 'Other' ? d.area : '', note: fld(form, 'note').value.trim() };
        if (editing) commit(function () { Object.assign(editing, data); });
        else commit(function (st) { st.firsts.push(Object.assign({ id: uid() }, data)); });
        closeSheet();
        toast(editing ? 'Saved' : 'First logged. It only happens once.');
      });
    }, { className: 'sheet--battle', label: 'First', focus: function () { if (!editing) $('input[name="title"]', sheetBody).focus({ preventScroll: true }); } });
  }

  // Lessons
  function openLessonEditor(opts) {
    opts = opts || {};
    var editing = opts.id ? state.lessons.find(function (l) { return l.id === opts.id; }) : null;
    var d = { area: editing ? editing.area : null };
    openSheet(function (body) {
      body.innerHTML = sheetHead(editing ? 'Edit lesson' : 'New lesson', 'One line you want to live by.') +
        '<form class="add-form" novalidate autocomplete="off">' +
        '<label class="field"><span class="field__label">The lesson</span><input class="input" name="text" maxlength="200" placeholder="e.g. Invoice the same day" value="' + esc(editing ? editing.text : '') + '"></label>' +
        '<div class="field"><span class="field__label">Area</span>' + areaChips(d.area) + '</div>' +
        '<button class="btn btn--primary btn--lg btn--block" type="submit">Save lesson</button>' +
        (editing ? '<button class="btn btn--danger-soft btn--block" type="button" data-sheet="delete">Delete</button>' : '') + '</form>';
      bindChips(body, 'data-area', function (a) { d.area = a; });
      body.onclick = function (e) {
        if (!e.target.closest('[data-sheet="delete"]')) return;
        commit(function (st) { st.lessons = st.lessons.filter(function (l) { return l.id !== editing.id; }); });
        closeSheet();
        toast('Deleted');
      };
      var form = $('form', body);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = fld(form, 'text');
        if (!text.value.trim()) { text.classList.add('is-invalid'); text.focus(); return; }
        var area = d.area && d.area !== 'Other' ? d.area : 'General';
        if (editing) commit(function () { editing.text = text.value.trim(); editing.area = area; });
        else commit(function (st) { st.lessons.push({ id: uid(), text: text.value.trim(), area: area, pinned: false, at: new Date().toISOString(), source: { type: 'manual', id: '' } }); });
        closeSheet();
        toast('Lesson saved');
      });
    }, { className: 'sheet--battle', label: 'Lesson', focus: function () { if (!editing) $('input[name="text"]', sheetBody).focus({ preventScroll: true }); } });
  }

  function toggleLessonPin(id) {
    var l = state.lessons.find(function (x) { return x.id === id; });
    if (!l) return;
    if (!l.pinned && state.lessons.filter(function (x) { return x.pinned; }).length >= RC.MAX_PINNED) return toast('You can pin up to ' + RC.MAX_PINNED + '. Unpin one first.', { tone: 'error' });
    commit(function () { l.pinned = !l.pinned; });
  }

  // Voice notes
  var playing = null;
  function playVoice(id, btn) {
    if (playing) {
      playing.audio.pause();
      URL.revokeObjectURL(playing.url);
      var was = playing.id;
      if (playing.btn) playing.btn.textContent = '▶';
      playing = null;
      if (was === id) return;
    }
    MEDIA.get(id).then(function (blob) {
      if (!blob) return toast('That recording is missing on this computer.', { tone: 'error' });
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      playing = { id: id, audio: audio, url: url, btn: btn };
      btn.textContent = '■';
      audio.onended = function () { btn.textContent = '▶'; URL.revokeObjectURL(url); playing = null; };
      audio.play().catch(function () { toast('Couldn’t play it.', { tone: 'error' }); });
    });
  }

  function voiceExt(mime) { return /mp4|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm'; }

  function openRecorder() {
    if (!MEDIA.supported()) return toast('This browser can’t record audio. Open the app in Chrome or Edge.', { tone: 'error' });
    var rec = null, stream = null, chunks = [], started = 0, timer = 0, blob = null, duration = 0, tag = 'other';
    var LIMIT = 180;
    function cleanup() {
      clearInterval(timer);
      if (rec && rec.state !== 'inactive') try { rec.stop(); } catch (e) {}
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    openSheet(function (body) {
      body.innerHTML = sheetHead('Voice note', 'Talk for a minute. It stays on this computer.') +
        '<div class="recorder"><button type="button" class="rec-btn" id="rec-btn" aria-label="Start recording"><span></span></button>' +
        '<p class="rec-time" id="rec-time">0:00</p><p class="rec-hint" id="rec-hint">Tap to start. Up to 3 minutes.</p></div>' +
        '<form class="add-form" id="rec-form" hidden novalidate autocomplete="off">' +
        '<audio id="rec-preview" controls></audio>' +
        '<label class="field"><span class="field__label">Title <em>Optional</em></span><input class="input" name="title" maxlength="120" placeholder="e.g. Night before quitting"></label>' +
        '<div class="field"><span class="field__label">What kind of day?</span><div class="suggest">' + VOICE_TAGS.map(function (t) { return '<button type="button" class="area-chip" data-tag="' + t[0] + '" aria-pressed="' + (t[0] === 'other') + '">' + t[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="confirm__actions"><button type="button" class="btn btn--soft" id="rec-discard">Discard</button><button type="submit" class="btn btn--primary">Save</button></div></form>';
      bindChips(body, 'data-tag', function (k) { tag = k; });
      var btn = $('#rec-btn', body), time = $('#rec-time', body), hint = $('#rec-hint', body), form = $('#rec-form', body);
      function stop() {
        if (rec && rec.state === 'recording') rec.stop();
      }
      btn.addEventListener('click', function () {
        if (rec && rec.state === 'recording') return stop();
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s2) {
          stream = s2;
          chunks = [];
          rec = new MediaRecorder(stream);
          rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function () {
            clearInterval(timer);
            duration = (Date.now() - started) / 1000;
            if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
            stream = null;
            blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
            btn.classList.remove('is-rec');
            btn.hidden = true;
            hint.textContent = 'Listen back, then save.';
            $('#rec-preview', body).src = URL.createObjectURL(blob);
            form.hidden = false;
          };
          rec.start(250);
          started = Date.now();
          btn.classList.add('is-rec');
          btn.setAttribute('aria-label', 'Stop recording');
          hint.textContent = 'Recording. Tap to stop.';
          timer = setInterval(function () {
            var sec = (Date.now() - started) / 1000;
            time.textContent = RC.fmtDuration(sec);
            if (sec >= LIMIT) stop();
          }, 200);
        }).catch(function () {
          hint.textContent = 'Microphone access was blocked. Allow it in the browser’s address bar, then try again.';
        });
      });
      $('#rec-discard', body).addEventListener('click', function () { cleanup(); closeSheet(); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!blob) return;
        var id = uid();
        var meta = { id: id, title: fld(form, 'title').value.trim(), tag: tag, at: new Date().toISOString(), duration: duration, mime: blob.type || 'audio/webm' };
        MEDIA.put(id, blob).then(function () {
          commit(function (st) { st.voice.push(meta); });
          closeSheet();
          toast('Voice note saved', { sub: RC.fmtDuration(duration) + ' · only on this computer' });
        }).catch(function () { toast('Couldn’t save the recording.', { tone: 'error' }); });
      });
    }, { className: 'sheet--battle', label: 'Voice note', onClose: cleanup });
  }

  function deleteVoice(id) {
    var n = state.voice.find(function (x) { return x.id === id; });
    if (!n) return;
    confirmDialog({ title: 'Delete this voice note?', text: 'The recording is removed from this computer for good.', okLabel: 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      MEDIA.remove(id).catch(function () {});
      commit(function (st) { st.voice = st.voice.filter(function (x) { return x.id !== id; }); });
      toast('Deleted');
    });
  }

  function downloadVoice(id) {
    var n = state.voice.find(function (x) { return x.id === id; });
    MEDIA.get(id).then(function (blob) {
      if (!blob) return toast('That recording is missing on this computer.', { tone: 'error' });
      downloadBlob(blob, '1000-decisions-voice-' + ymd(new Date(n.at)) + '.' + voiceExt(n.mime));
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
      case 'battle-new': openBattleEditor(); break;
      case 'theme': setTheme(el.dataset.theme); break;
      case 'theme-next': setTheme(THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length]); break;
      case 'bet-new': openBetEditor(); break;
      case 'bet-open': openBet(el.dataset.id); break;
      case 'bet-review': openBetReview(el.dataset.id); break;
      case 'bets-toggle': ui.betsAll = !ui.betsAll; render(); break;
      case 'first-new': openFirstEditor(); break;
      case 'first-edit': openFirstEditor({ id: el.dataset.id }); break;
      case 'lesson-new': openLessonEditor(); break;
      case 'lesson-edit': openLessonEditor({ id: el.dataset.id }); break;
      case 'lesson-pin': toggleLessonPin(el.dataset.id); break;
      case 'voice-new': openRecorder(); break;
      case 'voice-play': playVoice(el.dataset.id, el); break;
      case 'voice-download': downloadVoice(el.dataset.id); break;
      case 'voice-delete': deleteVoice(el.dataset.id); break;
      case 'battle-open': openBattleDetail(el.dataset.id); break;
      case 'battle-update': openBattleUpdate(el.dataset.id); break;
      case 'battle-close': openBattleClose(el.dataset.id); break;
      case 'won-filter':
        ui.wonFilter = el.dataset.area || null;
        render();
        break;
      case 'checkin-calm':
        commit(function (s) { s.checkins.push({ at: new Date().toISOString() }); });
        toast('Good. Next check-in in ' + (state.settings.checkinDays === 30 ? 'a month' : 'two weeks') + '.');
        break;
      case 'private-toggle':
        commit(function (s) { s.settings.privateMode = !s.settings.privateMode; });
        toast(state.settings.privateMode ? 'Private mode on. Battles and Record are hidden.' : 'Private mode off');
        break;
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
    if (sheetEl.open || confirmEl.open || document.querySelector('.td-overlay')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      setTheme(THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length]);
      return;
    }
    if ((e.key === 'v' || e.key === 'V') && !hiddenNow()) {
      e.preventDefault();
      openRecorder();
      return;
    }
    if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      if (ui.view !== 'battles') setView('battles', true);
      if (!hiddenNow()) openBattleEditor();
      return;
    }
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

  window.addEventListener('hashchange', function () {
    var h = location.hash.replace('#', '');
    if (VIEWS.indexOf(h) !== -1) setView(h, false);
  });
  ui.view = VIEWS.indexOf(location.hash.replace('#', '')) !== -1 ? location.hash.replace('#', '') : 'decisions';
  applyView();

  initReorder();
  // Small internal API for the feature modules (onboarding, finale, backup, playbook).
  window.TD = {
    get state() { return state; },
    set state(next) { state = next; },
    normalize: normalize,
    defaults: defaults,
    save: save,
    commit: commit,
    render: render,
    derive: derive,
    onRender: function (fn) { renderHooks.push(fn); },
    toast: toast,
    confirm: confirmDialog,
    openSheet: openSheet,
    closeSheet: closeSheet,
    sheetHead: sheetHead,
    openAdd: openAdd,
    openRecorder: openRecorder,
    playVoice: playVoice,
    addCategory: addCategory,
    findCategory: findCategory,
    downloadBlob: downloadBlob,
    isLocked: isLocked,
    hiddenNow: hiddenNow,
    setView: setView,
    hc: hc,
    icon: icon,
    util: { $: $, $$: $$, esc: esc, uid: uid, ymd: ymd, parseYmd: parseYmd, dayIndex: dayIndex, dayNumber: dayNumber, fmtNum: fmtNum, pct: pct, plural: plural, fld: fld, clamp: clamp, fmtDate: fmtDate, fmtTime: fmtTime, reducedMotion: reducedMotion },
    PALETTE: PALETTE,
    SUGGESTED: SUGGESTED,
    LOCALE: LOCALE,
    STORAGE_KEY: STORAGE_KEY,
    ui: ui
  };

  render({ intro: true });
  document.dispatchEvent(new CustomEvent('td:ready'));

  if (firstRun && !reducedMotion()) {
    $('#hero-total').dataset.value = 0;
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
