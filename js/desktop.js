/*
 * 1000 Decisions — desktop app extras. Does nothing in a normal browser.
 * In the desktop app: version and updates in Settings, "Open at login",
 * and a quiet prompt when an update has downloaded.
 */
(function () {
  'use strict';

  function boot() {
    var D = window.TDDesktop;
    if (!D) return;
    var TD = window.TD;
    var esc = TD.util.esc;
    document.documentElement.classList.add('is-desktop');
    var info = { version: '', platform: '' };
    var login = false;
    var update = null;

    function paint() {
      var host = document.getElementById('trust-settings');
      if (!host) return;
      var el = document.getElementById('desktop-settings');
      if (!el) {
        el = document.createElement('div');
        el.id = 'desktop-settings';
        host.parentNode.insertBefore(el, host);
      }
      el.innerHTML = '<div class="settings__block"><p class="settings__label">Desktop app</p>' +
        '<p class="settings__hint">Version ' + esc(info.version) + '. Updates download in the background and install when you restart.' +
        (update && update.state === 'ready' ? ' <b>Version ' + esc(update.version) + ' is ready.</b>' : '') + '</p>' +
        '<label class="check"><input type="checkbox" id="open-at-login"' + (login ? ' checked' : '') + '><span><b>Open when my computer starts</b><small>So the count is in front of you every morning.</small></span></label>' +
        (update && update.state === 'ready' ? '<div class="settings__row" style="margin-top:12px"><button class="btn btn--primary" type="button" data-action="desktop-update">Restart and update</button></div>' : '') +
        '</div>';
    }

    document.addEventListener('change', function (e) {
      if (e.target.id !== 'open-at-login') return;
      D.setOpenAtLogin(e.target.checked).then(function (on) { login = on; TD.toast(on ? 'Opens when your computer starts' : 'Won’t open at startup'); });
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="desktop-update"]')) D.installUpdate();
    });

    D.onUpdate(function (u) {
      update = u;
      paint();
      if (u.state === 'ready') TD.toast('Update ready: version ' + u.version, { sub: 'It installs next time you open the app.', actions: [{ label: 'Restart now', run: function () { D.installUpdate(); } }] });
      else if (u.state === 'latest') TD.toast('You have the latest version (' + u.version + ')');
      else if (u.state === 'downloading') TD.toast('Downloading version ' + u.version + '…', { sub: 'It installs when you restart the app.' });
      else if (u.state === 'error') TD.toast('Couldn’t check for updates. Are you online?', { tone: 'error' });
    });

    D.info().then(function (i) { info = i; paint(); });
    D.getOpenAtLogin().then(function (on) { login = !!on; paint(); }, function () {});
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
