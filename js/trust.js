/*
 * 1000 Decisions — safety net and PIN lock.
 *
 * 1. Snapshots: a copy of everything at the start of each day (14 kept),
 *    plus one before every import, erase or restore. Stored in IndexedDB on
 *    this device; restore with one click from Settings.
 * 2. Folder backup (Chrome / Edge / the desktop app): pick a folder once,
 *    e.g. inside Dropbox, iCloud or OneDrive. The app keeps
 *    1000-decisions-latest.json fresh, a dated copy each week, and voice
 *    notes as audio files. If the browser forgets the permission, it pauses
 *    and asks you to resume with one click.
 * 3. PIN lock: hides Battles and Record until the PIN is entered (once per
 *    session). A privacy screen, not encryption.
 */
(function () {
  'use strict';

  var DB_NAME = 'thousand-decisions-safety';
  var KEEP_DAILY = 14;
  var KEEP_EVENTS = 10;

  function boot() {
    var TD = window.TD;
    var U = TD.util;
    var $ = U.$, esc = U.esc, fmtNum = U.fmtNum;

    // ── IndexedDB ──────────────────────────────────────────────────────
    var dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(new Error('no-idb'));
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      dbp.catch(function () {});
      return dbp;
    }
    function tx(store, mode, fn) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var t = d.transaction(store, mode);
          var out = fn(t.objectStore(store));
          t.oncomplete = function () { resolve(out && 'result' in out ? out.result : out); };
          t.onerror = function () { reject(t.error); };
          t.onabort = function () { reject(t.error); };
        });
      });
    }
    function kvGet(key) { return tx('kv', 'readonly', function (s) { return s.get(key); }); }
    function kvSet(key, val) { return tx('kv', 'readwrite', function (s) { s.put(val, key); }); }
    function kvDel(key) { return tx('kv', 'readwrite', function (s) { s.delete(key); }); }

    // ── Snapshots ──────────────────────────────────────────────────────
    function isEmpty(s) { return !s.decisions.length && !s.categories.length; }

    function snapshot(label, kind) {
      var s = TD.state;
      if (isEmpty(s)) return Promise.resolve(null);
      var now = new Date();
      var snap = {
        id: kind === 'daily' ? 'day:' + U.ymd(now) : 'evt:' + now.getTime(),
        kind: kind || 'event',
        label: label || 'Snapshot',
        at: now.toISOString(),
        decisions: s.decisions.length,
        json: JSON.stringify(s)
      };
      return tx('snapshots', 'readwrite', function (st) { st.put(snap); }).then(prune).then(function () { refreshSettings(); return snap; }).catch(function () { return null; });
    }

    function list() {
      return tx('snapshots', 'readonly', function (st) { return st.getAll(); }).then(function (all) {
        return (all || []).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
      }).catch(function () { return []; });
    }

    function prune() {
      return list().then(function (all) {
        var daily = all.filter(function (x) { return x.kind === 'daily'; }).slice(KEEP_DAILY);
        var events = all.filter(function (x) { return x.kind !== 'daily'; }).slice(KEEP_EVENTS);
        var drop = daily.concat(events);
        if (!drop.length) return;
        return tx('snapshots', 'readwrite', function (st) { drop.forEach(function (x) { st.delete(x.id); }); });
      });
    }

    var dailyKey = null;
    function dailySnapshot() {
      var key = 'day:' + U.ymd(new Date());
      if (dailyKey === key) return;
      dailyKey = key;
      tx('snapshots', 'readonly', function (st) { return st.get(key); }).then(function (have) {
        if (!have) snapshot('Start of day', 'daily');
      }).catch(function () {});
    }

    function restore(id) {
      return tx('snapshots', 'readonly', function (st) { return st.get(id); }).then(function (snap) {
        if (!snap) return;
        var next = TD.normalize(JSON.parse(snap.json));
        return TD.confirm({
          title: 'Restore this snapshot?',
          text: 'Go back to ' + fmtNum(next.decisions.length) + ' decisions as of ' + when(snap.at) + '. What you have now is saved as a snapshot first, so you can undo this.',
          okLabel: 'Restore'
        }).then(function (ok) {
          if (!ok) return;
          return snapshot('Before restore').then(function () {
            TD.state = next;
            TD.save();
            TD.closeSheet();
            TD.render();
            TD.toast('Restored', { sub: fmtNum(next.decisions.length) + ' decisions, as of ' + when(snap.at) });
          });
        });
      });
    }

    function when(iso) {
      var d = new Date(iso);
      var diff = U.dayIndex(new Date()) - U.dayIndex(d);
      var day = diff === 0 ? 'today' : diff === 1 ? 'yesterday' : d.toLocaleDateString(TD.LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
      return day + ', ' + U.fmtTime(d);
    }

    function openSnapshots() {
      list().then(function (all) {
        TD.openSheet(function (body) {
          body.innerHTML = TD.sheetHead('Snapshots', 'Saved on this device automatically. Restoring never deletes anything: your current data becomes a snapshot first.') +
            (all.length ? '<ul class="snap-list">' + all.map(function (x) {
              return '<li class="snap"><div><b>' + esc(x.label) + '</b><span>' + esc(when(x.at)) + ' · ' + fmtNum(x.decisions) + ' ' + U.plural(x.decisions, 'decision') + '</span></div>' +
                '<button type="button" class="btn btn--soft" data-snap="' + esc(x.id) + '">Restore</button></li>';
            }).join('') + '</ul>' : '<p class="empty-line">No snapshots yet. The first one is taken today.</p>') +
            '<p class="settings__hint" style="margin-top:14px">Snapshots live in this browser. For a copy that survives a broken laptop, turn on folder backup or export a file.</p>';
          body.onclick = function (e) {
            var b = e.target.closest('[data-snap]');
            if (b) restore(b.dataset.snap);
          };
        }, { label: 'Snapshots' });
      });
    }

    // ── Folder backup ──────────────────────────────────────────────────
    var folder = { supported: typeof window.showDirectoryPicker === 'function', handle: null, status: 'off', name: '', lastAt: null, error: '' };

    function weekKey(d) {
      var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      var day = t.getUTCDay() || 7;
      t.setUTCDate(t.getUTCDate() + 4 - day);
      var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      var w = Math.ceil(((t - y0) / 86400000 + 1) / 7);
      return t.getUTCFullYear() + '-W' + (w < 10 ? '0' : '') + w;
    }

    function payload() {
      return JSON.stringify({ app: '1000-decisions', version: 1, exportedAt: new Date().toISOString(), data: TD.state }, null, 2);
    }

    function writeFile(dir, name, data) {
      return dir.getFileHandle(name, { create: true }).then(function (fh) {
        return fh.createWritable().then(function (w) {
          return w.write(data).then(function () { return w.close(); });
        });
      });
    }

    function fileExists(dir, name) {
      return dir.getFileHandle(name).then(function () { return true; }, function () { return false; });
    }

    var lastWritten = '';
    function writeFolder(force) {
      var h = folder.handle;
      if (!h) return Promise.resolve(false);
      return permission(h, false).then(function (ok) {
        if (!ok) { setStatus('paused'); return false; }
        var data = payload();
        var sig = JSON.stringify(TD.state);
        if (!force && sig === lastWritten) return true;
        var now = new Date();
        return writeFile(h, '1000-decisions-latest.json', data)
          .then(function () { return h.getDirectoryHandle('weekly', { create: true }); })
          .then(function (wk) { return writeFile(wk, '1000-decisions-' + weekKey(now) + '.json', data); })
          .then(function () { return writeVoice(h); })
          .then(function () {
            lastWritten = sig;
            folder.lastAt = now.toISOString();
            folder.error = '';
            kvSet('folderLastAt', folder.lastAt).catch(function () {});
            TD.state.settings.lastBackupAt = folder.lastAt;
            TD.save();
            setStatus('on');
            return true;
          })
          .catch(function (e) {
            folder.error = (e && e.message) || 'Write failed';
            setStatus('error');
            return false;
          });
      });
    }

    function writeVoice(h) {
      var notes = TD.state.voice || [];
      if (!notes.length || !window.TDMedia) return Promise.resolve();
      return h.getDirectoryHandle('voice', { create: true }).then(function (vd) {
        return notes.reduce(function (p, n) {
          var ext = /ogg/.test(n.mime || '') ? 'ogg' : /mp4|aac|m4a/.test(n.mime || '') ? 'm4a' : 'webm';
          var name = U.ymd(new Date(n.at || Date.now())) + '-' + String(n.title || 'voice').replace(/[^\w\- ]+/g, '').trim().slice(0, 40).replace(/\s+/g, '-') + '-' + n.id.slice(-5) + '.' + ext;
          return p.then(function () {
            return fileExists(vd, name).then(function (has) {
              if (has) return;
              return window.TDMedia.get(n.id).then(function (blob) { if (blob) return writeFile(vd, name, blob); });
            });
          });
        }, Promise.resolve());
      });
    }

    function permission(h, ask) {
      if (!h.queryPermission) return Promise.resolve(true);
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return true;
        if (!ask) return false;
        return h.requestPermission({ mode: 'readwrite' }).then(function (q) { return q === 'granted'; });
      }).catch(function () { return false; });
    }

    function setStatus(s) {
      folder.status = s;
      refreshSettings();
    }

    function connectFolder() {
      if (!folder.supported) return;
      window.showDirectoryPicker({ id: 'td-backup', mode: 'readwrite', startIn: 'documents' }).then(function (h) {
        return useFolder(h).then(function () { TD.toast('Folder backup is on', { sub: 'Saving to “' + h.name + '”' }); });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return;
        TD.toast('Couldn’t use that folder.', { tone: 'error' });
      });
    }

    function useFolder(h) {
      folder.handle = h;
      folder.name = h.name;
      return kvSet('folder', h).catch(function () {}).then(function () { return writeFolder(true); });
    }

    function resumeFolder() {
      if (!folder.handle) return;
      permission(folder.handle, true).then(function (ok) {
        if (ok) writeFolder(true).then(function (done) { if (done) TD.toast('Folder backup resumed'); });
        else TD.toast('The browser didn’t allow access. Try again or pick the folder again.', { tone: 'error' });
      });
    }

    function disconnectFolder() {
      folder.handle = null;
      folder.name = '';
      folder.lastAt = null;
      kvDel('folder').catch(function () {});
      kvDel('folderLastAt').catch(function () {});
      setStatus('off');
    }

    var writeTimer = 0;
    function scheduleWrite() {
      if (!folder.handle || folder.status === 'paused') return;
      clearTimeout(writeTimer);
      writeTimer = setTimeout(function () { writeFolder(false); }, 4000);
    }

    // ── PIN lock ───────────────────────────────────────────────────────
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
    function hashPin(pin, salt) {
      if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('no-crypto'));
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin)).then(hex);
    }
    function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a.buffer); }

    function setUnlocked(on) {
      TD.ui.unlocked = on;
      try { if (on) sessionStorage.setItem('td-unlocked', '1'); else sessionStorage.removeItem('td-unlocked'); } catch (e) {}
    }

    function openSetPin() {
      TD.openSheet(function (body) {
        body.innerHTML = TD.sheetHead('Lock Battles and Record', 'You’ll enter the PIN once per session to see them. Decisions stay open.') +
          '<form class="add-form" novalidate>' +
          '<label class="field"><span class="field__label">PIN <em>4 to 8 digits</em></span><input class="input pin-input" name="pin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" pattern="[0-9]*"></label>' +
          '<label class="field"><span class="field__label">Again</span><input class="input pin-input" name="pin2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" pattern="[0-9]*"></label>' +
          '<p class="settings__hint">This is a privacy screen against people looking over your shoulder, not encryption. Your data still lives unencrypted in this browser and in your backups.</p>' +
          '<button class="btn btn--primary btn--lg btn--block" type="submit">Turn on the lock</button></form>';
        U.$('form', body).addEventListener('submit', function (e) {
          e.preventDefault();
          var a = U.fld(e.target, 'pin'), b = U.fld(e.target, 'pin2');
          if (!/^\d{4,8}$/.test(a.value)) { a.classList.add('is-invalid'); a.focus(); return; }
          if (a.value !== b.value) { b.classList.add('is-invalid'); b.focus(); return; }
          var salt = newSalt();
          hashPin(a.value, salt).then(function (hash) {
            TD.commit(function (s) { s.lock = { hash: hash, salt: salt }; });
            setUnlocked(true);
            TD.closeSheet();
            TD.toast('Lock is on', { sub: 'Battles and Record need the PIN in a new session.' });
          }).catch(function () { TD.toast('This browser can’t create a PIN here.', { tone: 'error' }); });
        });
      }, { label: 'Set a PIN', focus: function () { U.$('input', document.getElementById('sheet-body')).focus(); } });
    }

    function tryUnlock(pin) {
      var L = TD.state.lock;
      if (!L) return Promise.resolve(true);
      return hashPin(pin, L.salt).then(function (h) { return h === L.hash; });
    }

    function removeLock() {
      TD.commit(function (s) { s.lock = null; });
      setUnlocked(false);
      TD.toast('Lock removed');
    }

    function lockNow() {
      setUnlocked(false);
      TD.render();
      TD.toast('Locked');
    }

    function forgotPin() {
      TD.confirm({
        title: 'Remove the PIN?',
        text: 'This removes the lock from Battles and Record. Anyone at this computer can do this: the PIN keeps out casual eyes, it is not encryption.',
        okLabel: 'Remove the PIN',
        danger: true
      }).then(function (ok) { if (ok) removeLock(); });
    }

    function lockPanel(id, after, what) {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('section');
        el.id = id;
        el.className = 'panel private-note lock-note';
        el.innerHTML = '<div class="lock-note__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>' +
          '<p class="eyebrow">Locked</p><h2 class="panel__title">' + what + ' are behind your PIN</h2>' +
          '<form class="lock-form" data-lock-form novalidate><input class="input pin-input" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="8" placeholder="PIN" aria-label="PIN"><button class="btn btn--primary" type="submit">Unlock</button></form>' +
          '<button type="button" class="link-btn" data-action="pin-forgot">Forgot the PIN?</button>';
        after.parentNode.insertBefore(el, after.nextSibling);
      }
      return el;
    }

    document.addEventListener('submit', function (e) {
      if (!e.target.matches('[data-lock-form]')) return;
      e.preventDefault();
      var input = U.fld(e.target, 'pin');
      tryUnlock(input.value).then(function (ok) {
        if (ok) { setUnlocked(true); TD.render(); }
        else { input.value = ''; input.classList.remove('is-invalid'); void input.offsetWidth; input.classList.add('is-invalid'); input.focus(); }
      });
    });

    // ── Settings block ─────────────────────────────────────────────────
    var snapCount = 0, lastSnapAt = null;
    function refreshSettings() {
      list().then(function (all) {
        snapCount = all.length;
        lastSnapAt = all.length ? all[0].at : null;
        paintSettings();
      });
    }

    function paintSettings() {
      var host = $('#trust-settings');
      if (!host) return;
      var s = TD.state;
      var fStatus;
      if (!folder.supported) fStatus = '<p class="settings__hint">Folder backup needs Chrome, Edge or the desktop app. In this browser, use Export JSON now and then.</p>';
      else if (!folder.handle) fStatus = '<p class="settings__hint">Pick a folder once (one inside Dropbox, iCloud Drive or OneDrive is ideal). The app keeps a fresh copy there, a dated copy every week, and your voice notes as audio files.</p>' +
        '<div class="settings__row"><button class="btn btn--soft" type="button" data-action="folder-connect">Choose a backup folder</button></div>';
      else fStatus = '<p class="settings__hint">' + (folder.status === 'paused' ? '<span class="status-dot status-dot--warn"></span><b>Paused.</b> The browser needs your OK again after a restart.' :
          folder.status === 'error' ? '<span class="status-dot status-dot--bad"></span><b>Couldn’t write.</b> ' + esc(folder.error) :
          '<span class="status-dot status-dot--ok"></span>Saving to <b>' + esc(folder.name) + '</b>' + (folder.lastAt ? ' · last copy ' + esc(when(folder.lastAt)) : '')) + '</p>' +
        '<div class="settings__row">' + (folder.status === 'paused' || folder.status === 'error' ? '<button class="btn btn--primary" type="button" data-action="folder-resume">Resume backup</button>' : '<button class="btn btn--soft" type="button" data-action="folder-now">Back up now</button>') +
        '<button class="btn btn--ghost" type="button" data-action="folder-off">Stop</button></div>';
      host.innerHTML =
        '<div class="settings__block"><p class="settings__label">Safety net</p>' +
        '<p class="settings__hint">' + (snapCount ? fmtNum(snapCount) + ' ' + U.plural(snapCount, 'snapshot') + ' on this device, the latest from ' + esc(when(lastSnapAt)) + '. A new one is taken each day and before any import, erase or restore.' : 'A snapshot is taken each day you open the app, and before any import, erase or restore.') + '</p>' +
        '<div class="settings__row"><button class="btn btn--soft" type="button" data-action="snapshots-open">See snapshots and restore</button></div></div>' +
        '<div class="settings__block"><p class="settings__label">Folder backup</p>' + fStatus + '</div>' +
        '<div class="settings__block"><p class="settings__label">PIN lock</p>' +
        (s.lock ? '<p class="settings__hint">Battles and Record need your PIN once per session.</p><div class="settings__row"><button class="btn btn--soft" type="button" data-action="pin-lock-now">Lock now</button><button class="btn btn--ghost" type="button" data-action="pin-remove">Remove PIN</button></div>'
          : '<p class="settings__hint">Hide Battles and Record behind a PIN. A privacy screen, not encryption.</p><div class="settings__row"><button class="btn btn--soft" type="button" data-action="pin-set">Set a PIN</button></div>') +
        '</div>';
    }

    // ── Wiring ─────────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-action]');
      if (!b) return;
      switch (b.dataset.action) {
        case 'snapshots-open': openSnapshots(); break;
        case 'folder-connect': connectFolder(); break;
        case 'folder-resume': resumeFolder(); break;
        case 'folder-now': writeFolder(true).then(function (ok) { if (ok) TD.toast('Backed up to “' + folder.name + '”'); }); break;
        case 'folder-off': disconnectFolder(); break;
        case 'pin-set': openSetPin(); break;
        case 'pin-lock-now': lockNow(); break;
        case 'pin-forgot': forgotPin(); break;
        case 'pin-remove':
          if (TD.isLocked()) forgotPin();
          else TD.confirm({ title: 'Remove the PIN?', text: 'Battles and Record will open without a PIN.', okLabel: 'Remove' }).then(function (ok) { if (ok) removeLock(); });
          break;
      }
    });

    var lastLock = null;
    TD.onRender(function () {
      dailySnapshot();
      scheduleWrite();
      var locked = TD.isLocked() && !TD.state.settings.privateMode;
      var pb = lockPanel('lock-battles', document.getElementById('private-note'), 'Battles');
      var pr = lockPanel('lock-record', document.getElementById('record-private'), 'The record and your letters');
      pb.hidden = pr.hidden = !locked;
      var key = !!TD.state.lock + ':' + locked;
      if (key !== lastLock) { lastLock = key; paintSettings(); }
    });

    // Restore the folder handle from last time.
    if (folder.supported) {
      Promise.all([kvGet('folder'), kvGet('folderLastAt')]).then(function (r) {
        if (!r[0]) return;
        folder.handle = r[0];
        folder.name = r[0].name;
        folder.lastAt = r[1] || null;
        return permission(r[0], false).then(function (ok) {
          if (ok) { setStatus('on'); scheduleWrite(); return; }
          setStatus('paused');
          var today = U.ymd(new Date());
          var asked = null;
          try { asked = localStorage.getItem('td-folder-asked'); } catch (e) {}
          if (asked !== today) {
            try { localStorage.setItem('td-folder-asked', today); } catch (e) {}
            TD.toast('Folder backup is paused', { sub: 'The browser needs your OK after a restart.', actions: [{ label: 'Resume', run: resumeFolder }] });
          }
        });
      }).catch(function () {});
    }

    dailySnapshot();
    refreshSettings();
    paintSettings();

    window.TDTrust = { snapshot: snapshot, list: list, restore: restore, useFolder: useFolder, writeFolder: writeFolder, weekKey: weekKey, hashPin: hashPin, folder: folder };
  }

  if (window.TD) boot();
  else document.addEventListener('td:ready', boot, { once: true });
})();
