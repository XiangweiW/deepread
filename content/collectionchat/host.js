/* eslint-disable */
(function () {
  'use strict';

  function log(msg) {
    try {
      var prefix = '[zotero-copilot:collectionchat-host] ';
      if (typeof Zotero !== 'undefined' && Zotero && Zotero.debug) {
        Zotero.debug(prefix + msg, 1);
        return;
      }
      if (window.opener && window.opener.Zotero && window.opener.Zotero.debug) {
        window.opener.Zotero.debug(prefix + msg, 1);
      }
    } catch (e) {}
  }

  function showStatus(text) {
    try {
      var root = document.getElementById('root');
      if (root) root.innerHTML = '<div class="zc-fallback">' + text + '</div>';
    } catch (e) {}
  }

  function getSessionId() {
    try {
      var search = window.location && window.location.search ? window.location.search : '';
      var m = /[?&]session=([^&]+)/.exec(search);
      if (m && m[1]) return decodeURIComponent(m[1]);
    } catch (e) {}
    return null;
  }

  function getMainScope() {
    try { if (window.opener) { return window.opener; } } catch (e) {}
    try {
      if (typeof Zotero !== 'undefined' && Zotero && typeof Zotero.getMainWindow === 'function') {
        var mw = Zotero.getMainWindow();
        if (mw) return mw;
      }
    } catch (e) {}
    return null;
  }

  function findBootstrap(scope) {
    if (!scope) return null;
    try {
      if (scope.ZoteroCopilot && typeof scope.ZoteroCopilot.bootstrapCollectionChatWindow === 'function') {
        return scope.ZoteroCopilot.bootstrapCollectionChatWindow;
      }
    } catch (e) { log('scope.ZoteroCopilot access failed: ' + e); }
    try {
      if (scope.Zotero && scope.Zotero.ZoteroCopilot && typeof scope.Zotero.ZoteroCopilot.bootstrapCollectionChatWindow === 'function') {
        return scope.Zotero.ZoteroCopilot.bootstrapCollectionChatWindow;
      }
    } catch (e) { log('scope.Zotero.ZoteroCopilot access failed: ' + e); }
    return null;
  }

  function init() {
    log('host.js init started');
    var sessionId = getSessionId();
    log('sessionId=' + sessionId);
    if (!sessionId) {
      showStatus('Missing session id in URL.');
      return;
    }
    var scope = getMainScope();
    log('main scope: ' + (scope ? 'found' : 'null'));
    if (!scope) {
      showStatus('Could not access main window. Check log for details.');
      return;
    }
    var attempts = 0;
    var maxAttempts = 40;
    showStatus('Loading…');
    var iv = setInterval(function () {
      attempts++;
      var fn = findBootstrap(scope);
      if (fn) {
        clearInterval(iv);
        log('bootstrap found after ' + attempts + ' attempts; calling');
        try {
          fn(window, sessionId);
          log('bootstrap call returned');
        } catch (e) {
          log('bootstrap call threw: ' + e);
          showStatus('Failed to mount chat: ' + e);
        }
        return;
      }
      if (attempts >= maxAttempts) {
        clearInterval(iv);
        log('bootstrap not found after ' + attempts + ' attempts');
        showStatus('Plugin global ZoteroCopilot.bootstrapCollectionChatWindow not found on the main window. Plugin may not be fully loaded.');
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
