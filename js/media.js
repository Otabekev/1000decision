/*
 * 1000 Decisions — private audio storage (IndexedDB).
 * Voice notes are too big for localStorage, so the audio lives here and only
 * the metadata (title, date, length) lives in the main state.
 * Browser: window.TDMedia.
 */
(function (root) {
  'use strict';
  var DB = 'thousand-decisions-media';
  var STORE = 'voice';
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!root.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var req = root.indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var result = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(result && 'result' in result ? result.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  root.TDMedia = {
    put: function (id, blob) { return tx('readwrite', function (s) { return s.put(blob, id); }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    remove: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); },
    supported: function () { return !!(root.indexedDB && root.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
  };
})(typeof self !== 'undefined' ? self : this);
