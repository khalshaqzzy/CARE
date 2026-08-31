(function () {
  'use strict';

  var bootTimer;
  var mounted = false;

  if (typeof window.globalThis === 'undefined') window.globalThis = window;

  if (typeof Object.fromEntries !== 'function') {
    Object.fromEntries = function (entries) {
      var result = {};
      var iterator = entries[Symbol.iterator]();
      var step;
      while (!(step = iterator.next()).done) result[step.value[0]] = step.value[1];
      return result;
    };
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    String.prototype.replaceAll = function (search, replacement) {
      if (search instanceof RegExp) {
        if (!search.global) throw new TypeError('replaceAll RegExp must use the global flag');
        return this.replace(search, replacement);
      }
      return this.split(String(search)).join(String(replacement));
    };
  }

  if (typeof Array.prototype.at !== 'function') {
    Array.prototype.at = function (index) {
      var position = Number(index) || 0;
      if (position < 0) position += this.length;
      return position < 0 || position >= this.length ? undefined : this[position];
    };
  }

  if (typeof window.queueMicrotask !== 'function') {
    window.queueMicrotask = function (callback) {
      Promise.resolve()
        .then(callback)
        .catch(function (error) {
          window.setTimeout(function () {
            throw error;
          }, 0);
        });
    };
  }

  function renderFallback(title, message) {
    var root = document.getElementById('root');
    if (!root || mounted) return;
    var titleNode = root.querySelector('[data-care-boot-title]');
    var messageNode = root.querySelector('[data-care-boot-message]');
    var retry = root.querySelector('[data-care-boot-retry]');
    if (titleNode) titleNode.textContent = title;
    if (messageNode) messageNode.textContent = message;
    if (retry) retry.removeAttribute('hidden');
    root.setAttribute('data-care-boot-state', 'failed');
  }

  window.__CARE_BOOT__ = {
    markMounted: function () {
      mounted = true;
      if (bootTimer) window.clearTimeout(bootTimer);
      var root = document.getElementById('root');
      if (root) root.setAttribute('data-care-boot-state', 'mounted');
    },
    showUnsupported: function (message) {
      renderFallback('Perangkat belum didukung', message);
    },
    showFailure: function () {
      renderFallback(
        'CARE gagal dimuat',
        'Periksa koneksi, lalu muat ulang. Jika masalah berlanjut, buka CARE melalui Safari.',
      );
    },
  };

  bootTimer = window.setTimeout(function () {
    window.__CARE_BOOT__.showFailure();
  }, 8000);
})();
