/*
 * 1000 Decisions — license key and free trial (Lemon Squeezy).
 * Off unless TD_CONFIG.license.enabled is true (see js/config.js).
 *
 * The license is stored apart from your data, so sharing a backup never
 * shares a key. After the trial, the app stays readable and exportable;
 * only logging new entries needs a key.
 *
 * Honest limit: any check that runs on the customer's computer can be
 * bypassed by someone who edits the files. This keeps honest people honest.
 */
(function () {
  'use strict';

  var KEY = 'thousand-decisions:license';
  var API = 'https://api.lemonsqueezy.com/v1/licenses/';
  var DAY = 86400000;

  function boot() {
    var TD = window.TD;
    var cfg = (window.TD_CONFIG && window.TD_CONFIG.license) || {};
    if (!cfg.enabled) { window.TDLicense = { enabled: false, allowed: function () { return true; } }; return; }
    var U = TD.util;
    var esc = U.esc;

    function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function write(x) { try { localStorage.setItem(KEY, JSON.stringify(x)); } catch (e) {} }

    var lic = read();
    // The trial starts at the first sign of use: this record, or the oldest decision.
    var first = TD.state.decisions.length ? Date.parse(TD.state.decisions[0].timestamp) : Date.now();
    var start = Math.min(lic.trialStartedAt ? Date.parse(lic.trialStartedAt) : Date.now(), first);
    if (!lic.trialStartedAt || Date.parse(lic.trialStartedAt) !== start) { lic.trialStartedAt = new Date(start).toISOString(); write(lic); }

    function trialLeft() { return Math.max(0, Math.ceil((start + cfg.trialDays * DAY - Date.now()) / DAY)); }
    function licensed() {
      if (!lic.key || lic.status !== 'active') return false;
      var last = Date.parse(lic.validatedAt || lic.activatedAt);
      return Date.now() - last < (cfg.offlineGraceDays || 30) * DAY;
    }
    function allowed() { return licensed() || trialLeft() > 0; }

    function call(action, body) {
      if (window.TDDesktop && window.TDDesktop.license) {
        return window.TDDesktop.license(action, body).then(function (r) { return r.json; });
      }
      return fetch(API + action, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      }).then(function (r) { return r.json(); });
    }

    function matches(meta) {
      if (!meta) return false;
      if (cfg.storeId && +meta.store_id !== +cfg.storeId) return false;
      if (cfg.productId && +meta.product_id !== +cfg.productId) return false;
      return true;
    }

    function instanceName() {
      var p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'Computer';
      return '1000 Decisions on ' + p;
    }

    function activate(key) {
      key = String(key || '').trim();
      if (!key) return Promise.resolve({ ok: false, message: 'Paste your license key.' });
      return call('activate', { license_key: key, instance_name: instanceName() }).then(function (r) {
        if (!r || !r.activated) return { ok: false, message: (r && r.error) || 'That key didn’t work.' };
        if (!matches(r.meta)) return { ok: false, message: 'That key is for a different product.' };
        lic = Object.assign(read(), {
          key: key,
          instanceId: r.instance && r.instance.id,
          status: 'active',
          activatedAt: new Date().toISOString(),
          validatedAt: new Date().toISOString(),
          name: (r.meta && r.meta.customer_name) || '',
          email: (r.meta && r.meta.customer_email) || ''
        });
        write(lic);
        return { ok: true };
      }, function () { return { ok: false, message: 'Couldn’t reach the license server. Check your connection and try again.' }; });
    }

    function revalidate() {
      if (!lic.key || !lic.instanceId) return;
      var last = Date.parse(lic.validatedAt || 0);
      if (Date.now() - last < (cfg.revalidateDays || 7) * DAY) return;
      call('validate', { license_key: lic.key, instance_id: lic.instanceId }).then(function (r) {
        if (!r) return;
        if (r.valid && matches(r.meta)) { lic.validatedAt = new Date().toISOString(); lic.status = 'active'; }
        else if (r.valid === false) lic.status = (r.license_key && r.license_key.status) || 'invalid';
        write(lic);
        gate();
      }, function () { /* offline: the grace period covers it */ });
    }

    function deactivate() {
      var done = function () { lic = { trialStartedAt: lic.trialStartedAt }; write(lic); paintSettings(); gate(); };
      if (!lic.key || !lic.instanceId) return Promise.resolve(done());
      return call('deactivate', { license_key: lic.key, instance_id: lic.instanceId }).then(done, done);
    }

    // ── Paywall: shown when the trial is over and there's no key ───────
    // "Look around" hides it; creating anything new brings it back.
    var CREATE = ['add', 'log-category', 'quick-category', 'new-category', 'battle-new', 'bet-new', 'first-new', 'lesson-new', 'voice-new', 'letter-write', 'hard-moment'];
    var browsing = false;
    document.addEventListener('click', function (e) {
      if (allowed()) return;
      var b = e.target.closest('[data-action]');
      if (!b || CREATE.indexOf(b.dataset.action) === -1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      browsing = false;
      gate();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (allowed() || e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (['n', 'N', '+', 'b', 'B', 'v', 'V', 'h', 'H'].indexOf(e.key) === -1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      browsing = false;
      gate();
    }, true);

    var wall = null;
    function gate() {
      if (browsing && !allowed()) return;
      if (allowed()) { if (wall) { wall.remove(); wall = null; if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked'); } return; }
      if (wall) return;
      wall = document.createElement('div');
      wall.className = 'paywall td-overlay';
      wall.setAttribute('role', 'dialog');
      wall.setAttribute('aria-modal', 'true');
      wall.setAttribute('aria-label', 'Your trial has ended');
      var n = TD.state.decisions.length;
      wall.innerHTML = '<div class="ritual__inner">' +
        '<p class="ritual__eyebrow">1000 Decisions · trial complete</p>' +
        '<h1 class="ritual__title ritual__title--sm">' + (n ? U.fmtNum(n) + ' decisions in.<br>Keep going.' : 'Your trial has ended.') + '</h1>' +
        '<p class="ritual__lede">One payment' + (cfg.price ? ' of <b>' + esc(cfg.price) + '</b>' : '') + ', yours for good. No subscription, no account, your data stays on this computer.</p>' +
        '<div class="ritual__actions">' + (cfg.buyUrl ? '<a class="btn btn--brass btn--lg" href="' + esc(cfg.buyUrl) + '" target="_blank" rel="noopener">Get a license</a>' : '') + '</div>' +
        '<form class="paywall__form" data-license-form novalidate><input class="input" name="key" placeholder="Paste your license key" autocomplete="off" spellcheck="false"><button class="btn btn--ghost-light" type="submit">Activate</button></form>' +
        '<p class="paywall__msg" aria-live="polite"></p>' +
        '<p class="ritual__hint">Your data is safe and stays yours. <button type="button" class="link-btn" data-paywall="browse">Look through it</button> or <button type="button" class="link-btn" data-action="export">export it</button>.</p>' +
        '</div>';
      wall.addEventListener('click', function (e) {
        if (!e.target.closest('[data-paywall="browse"]')) return;
        browsing = true;
        wall.remove();
        wall = null;
        if (!document.querySelector('.td-overlay')) document.documentElement.classList.remove('is-locked');
      });
      document.body.appendChild(wall);
      document.documentElement.classList.add('is-locked');
    }

    document.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-license-form]')) return;
      e.preventDefault();
      var form = e.target;
      var btn = form.querySelector('button');
      var msg = form.parentNode.querySelector('.paywall__msg, .license__msg');
      btn.disabled = true;
      if (msg) msg.textContent = 'Checking…';
      activate(U.fld(form, 'key').value).then(function (r) {
        btn.disabled = false;
        if (msg) msg.textContent = r.ok ? '' : r.message;
        if (r.ok) {
          gate();
          paintSettings();
          TD.toast('License activated', { sub: 'Thank you. Every future update is included.' });
        }
      });
    });

    // ── Settings block ─────────────────────────────────────────────────
    function paintSettings() {
      var host = document.getElementById('trust-settings');
      if (!host) return;
      var el = document.getElementById('license-settings');
      if (!el) {
        el = document.createElement('div');
        el.id = 'license-settings';
        host.parentNode.insertBefore(el, host);
      }
      var body;
      if (licensed()) {
        body = '<p class="settings__hint"><span class="status-dot status-dot--ok"></span>Licensed' + (lic.name ? ' to <b>' + esc(lic.name) + '</b>' : '') + '. Key ending ' + esc(lic.key.slice(-6)) + '.</p>' +
          '<div class="settings__row"><button class="btn btn--ghost" type="button" data-action="license-deactivate">Move the license to another computer</button></div>';
      } else {
        var left = trialLeft();
        body = '<p class="settings__hint">' + (left ? '<span class="status-dot status-dot--warn"></span>Free trial: <b>' + left + ' ' + U.plural(left, 'day') + ' left</b>.' : 'Trial complete.') + ' One payment' + (cfg.price ? ' of ' + esc(cfg.price) : '') + ', no subscription.</p>' +
          '<form class="license__form" data-license-form novalidate><input class="input" name="key" placeholder="License key" autocomplete="off" spellcheck="false"><button class="btn btn--soft" type="submit">Activate</button></form><p class="license__msg settings__hint" aria-live="polite"></p>' +
          (cfg.buyUrl ? '<div class="settings__row"><a class="btn btn--primary" href="' + esc(cfg.buyUrl) + '" target="_blank" rel="noopener">Get a license</a></div>' : '');
      }
      el.innerHTML = '<div class="settings__block"><p class="settings__label">License</p>' + body + '</div>';
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-action="license-deactivate"]')) return;
      TD.confirm({ title: 'Remove the license from this computer?', text: 'You can then activate the same key on another computer. Your data stays here.', okLabel: 'Remove' }).then(function (ok) { if (ok) deactivate(); });
    });

    TD.onRender(function () { if (!document.getElementById('license-settings')) paintSettings(); });
    paintSettings();
    gate();
    revalidate();
    setInterval(function () { gate(); revalidate(); }, 60 * 60 * 1000);

    window.TDLicense = { enabled: true, allowed: allowed, licensed: licensed, trialLeft: trialLeft, activate: activate, deactivate: deactivate };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
