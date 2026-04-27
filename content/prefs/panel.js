/* eslint-disable */
(function () {
  'use strict';

  function log(msg) {
    try {
      var Z = window.Zotero || (window.opener && window.opener.Zotero);
      if (Z && Z.debug) Z.debug('[zotero-copilot:prefs-panel] ' + msg, 1);
    } catch (e) {}
  }

  log('panel.js loaded; readyState=' + document.readyState);

  function $(id) {
    return document.getElementById(id);
  }

  function syncProviderVisibility() {
    var provSel = $('zc-provider');
    var provider = provSel ? provSel.value : 'gemini';
    var a = $('zc-anthropic-fields');
    var g = $('zc-gemini-fields');
    if (a) a.style.display = provider === 'anthropic' ? '' : 'none';
    if (g) g.style.display = provider === 'gemini' ? '' : 'none';
    log('provider visibility synced: ' + provider);
  }

  function init() {
    log('init starting');
    syncProviderVisibility();
    var provSel = $('zc-provider');
    if (provSel) {
      provSel.addEventListener('change', syncProviderVisibility);
      provSel.addEventListener('command', syncProviderVisibility);
    }
    log('init complete');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
