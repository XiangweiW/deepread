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

  var MCP_SNIPPETS = {
    cursorDeeplink: function () {
      // Cursor's documented deeplink format:
      // cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64-of-json>
      var config = { command: 'npx', args: ['-y', 'deepread-mcp'] };
      var b64 = btoa(JSON.stringify(config));
      return 'cursor://anysphere.cursor-deeplink/mcp/install?name=deepread&config=' + encodeURIComponent(b64);
    },
    claudeCommand: 'claude mcp add --scope user deepread -- npx -y deepread-mcp',
    codexToml: '[mcp_servers.deepread]\ncommand = "npx"\nargs = ["-y", "deepread-mcp"]',
    genericJson: JSON.stringify(
      {
        mcpServers: {
          deepread: { command: 'npx', args: ['-y', 'deepread-mcp'] },
        },
      },
      null,
      2
    ),
  };

  function copyText(text) {
    try {
      var Cc = Components.classes['@mozilla.org/widget/clipboardhelper;1'];
      if (Cc) {
        Cc.getService(Components.interfaces.nsIClipboardHelper).copyString(text);
        return true;
      }
    } catch (e) {}
    try {
      navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
    return false;
  }

  function flashLabel(btn, msg) {
    var orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () {
      btn.textContent = orig;
    }, 1200);
  }

  function wireMcpButtons() {
    var cursorBtn = $('zc-mcp-add-cursor');
    if (cursorBtn) {
      cursorBtn.addEventListener('click', function () {
        try {
          var url = MCP_SNIPPETS.cursorDeeplink();
          var win = window.opener || window;
          if (win.Zotero && typeof win.Zotero.launchURL === 'function') {
            win.Zotero.launchURL(url);
          } else {
            win.open(url, '_blank');
          }
        } catch (e) {
          log('Cursor deeplink failed: ' + e);
        }
      });
    }

    var claudeBtn = $('zc-mcp-copy-claude');
    if (claudeBtn) {
      claudeBtn.addEventListener('click', function () {
        if (copyText(MCP_SNIPPETS.claudeCommand)) flashLabel(claudeBtn, 'Copied!');
      });
    }

    var codexBtn = $('zc-mcp-copy-codex');
    if (codexBtn) {
      codexBtn.addEventListener('click', function () {
        if (copyText(MCP_SNIPPETS.codexToml)) flashLabel(codexBtn, 'Copied!');
      });
    }

    var genericBtn = $('zc-mcp-copy-generic');
    if (genericBtn) {
      genericBtn.addEventListener('click', function () {
        if (copyText(MCP_SNIPPETS.genericJson)) flashLabel(genericBtn, 'Copied!');
      });
    }
  }

  function init() {
    log('init starting');
    syncProviderVisibility();
    var provSel = $('zc-provider');
    if (provSel) {
      provSel.addEventListener('change', syncProviderVisibility);
      provSel.addEventListener('command', syncProviderVisibility);
    }
    wireMcpButtons();
    log('init complete');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
