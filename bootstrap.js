var ZoteroCopilot;

function log(msg) {
  try {
    Zotero.debug("[zotero-copilot] " + msg);
  } catch (e) {
    dump("[zotero-copilot] " + msg + "\n");
  }
}

function install(_data, _reason) {
  log("install");
}

async function startup({ id, version, rootURI }, _reason) {
  log("startup " + id + " v" + version);
  try {
    await Zotero.initializationPromise;

    var scope = {};
    var mainWin = Zotero.getMainWindow();
    if (mainWin) {
      scope.window = mainWin;
      scope.document = mainWin.document;
      scope.console = mainWin.console;
      scope.fetch = mainWin.fetch.bind(mainWin);
      scope.Headers = mainWin.Headers;
      scope.Request = mainWin.Request;
      scope.Response = mainWin.Response;
      scope.AbortController = mainWin.AbortController;
      scope.AbortSignal = mainWin.AbortSignal;
      scope.TextEncoder = mainWin.TextEncoder;
      scope.TextDecoder = mainWin.TextDecoder;
      scope.ReadableStream = mainWin.ReadableStream;
      scope.MutationObserver = mainWin.MutationObserver;
      scope.setTimeout = mainWin.setTimeout.bind(mainWin);
      scope.setInterval = mainWin.setInterval.bind(mainWin);
      scope.clearTimeout = mainWin.clearTimeout.bind(mainWin);
      scope.clearInterval = mainWin.clearInterval.bind(mainWin);
      scope.queueMicrotask = mainWin.queueMicrotask.bind(mainWin);
      scope.requestAnimationFrame = mainWin.requestAnimationFrame.bind(mainWin);
      scope.cancelAnimationFrame = mainWin.cancelAnimationFrame.bind(mainWin);
      scope.MessageChannel = mainWin.MessageChannel;
      scope.location = mainWin.location;
      scope.navigator = mainWin.navigator;
      scope.HTMLElement = mainWin.HTMLElement;
      scope.Element = mainWin.Element;
      scope.Node = mainWin.Node;
      scope.Event = mainWin.Event;
      scope.WeakMap = mainWin.WeakMap || WeakMap;
      try {
        scope.Components = Components;
        scope.Cc = Components.classes;
        scope.Ci = Components.interfaces;
      } catch (e) {}
    }
    Services.scriptloader.loadSubScript(rootURI + "index.js", scope);
    ZoteroCopilot = scope.ZoteroCopilot || scope;

    try {
      if (mainWin) mainWin.ZoteroCopilot = ZoteroCopilot;
      if (typeof Zotero !== "undefined") Zotero.ZoteroCopilot = ZoteroCopilot;
    } catch (e) {
      log("expose-global failed: " + e);
    }

    if (ZoteroCopilot && typeof ZoteroCopilot.onStartup === "function") {
      await ZoteroCopilot.onStartup({ id, version, rootURI });
    } else {
      log("index.js loaded but onStartup is not a function. scope keys=" + Object.keys(scope).join(","));
    }
  } catch (e) {
    log("startup error: " + (e && e.stack ? e.stack : e));
  }
}

function shutdown(_data, _reason) {
  log("shutdown");
  try {
    if (ZoteroCopilot && typeof ZoteroCopilot.onShutdown === "function") {
      ZoteroCopilot.onShutdown();
    }
  } catch (e) {
    log("shutdown error: " + (e && e.stack ? e.stack : e));
  } finally {
    ZoteroCopilot = undefined;
  }
}

function uninstall(_data, _reason) {
  log("uninstall");
}
