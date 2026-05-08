import { openCollectionChat } from './collectionchat';
import { buildCollectionPrimer, openCollectionInCursorWithIndex } from './cursorBridge';

const MENUITEM_ID = 'zotero-copilot-analyze-collection';
const CURSOR_MENUITEM_ID = 'zotero-copilot-ask-collection-in-cursor';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30000;

let installed = false;
let pollIntervalId: any = null;
let menuShowingHandler: ((e: any) => void) | null = null;
let unregisterFn: (() => void) | null = null;

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:collectionmenu] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function getMainWindow(): any | null {
  try {
    return Zotero?.getMainWindow?.() ?? null;
  } catch {
    return null;
  }
}

function findCollectionMenu(win: any): any | null {
  try {
    return win?.document?.getElementById('zotero-collectionmenu') ?? null;
  } catch {
    return null;
  }
}

function getSelectedCollectionID(win: any): number | undefined {
  try {
    const cv = win?.ZoteroPane?.collectionsView;
    if (!cv) return undefined;
    if (typeof cv.getSelectedCollection === 'function') {
      const c = cv.getSelectedCollection();
      if (c && typeof c.id === 'number') return c.id;
      if (c && typeof c.id === 'string') {
        const n = Number(c.id);
        if (Number.isFinite(n)) return n;
      }
    }
    const row = cv.selectedTreeRow;
    if (row && row.ref && typeof row.ref.id === 'number') {
      return row.ref.id;
    }
  } catch (err) {
    debug('getSelectedCollectionID failed', err);
  }
  return undefined;
}

function isCollectionRow(win: any): boolean {
  try {
    const cv = win?.ZoteroPane?.collectionsView;
    if (!cv) return false;
    const row = cv.selectedTreeRow;
    if (row && typeof row.isCollection === 'function') return !!row.isCollection();
  } catch (err) {
    debug('isCollectionRow failed', err);
  }
  return typeof getSelectedCollectionID(win) === 'number';
}

function ensureMenuItem(win: any, rootURI: string): boolean {
  const menu = findCollectionMenu(win);
  if (!menu) return false;
  try {
    const doc = win.document;
    let item = doc.getElementById(MENUITEM_ID);
    if (!item) {
      item = doc.createXULElement
        ? doc.createXULElement('menuitem')
        : doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
      item.setAttribute('id', MENUITEM_ID);
      item.setAttribute('label', 'Analyze with DeepRead');
      item.addEventListener('command', (event: any) => {
        try {
          event?.preventDefault?.();
          event?.stopPropagation?.();
        } catch {
        }
        try {
          const id = getSelectedCollectionID(win);
          if (typeof id !== 'number') {
            debug('no collection selected on command');
            return;
          }
          void openCollectionChat(id, { rootURI });
        } catch (err) {
          debug('command handler failed', err);
        }
      });
      menu.appendChild(item);
      try { Zotero.debug('[zotero-copilot] collection menuitem attached', 3); } catch {}
    }

    let cursorItem = doc.getElementById(CURSOR_MENUITEM_ID);
    if (!cursorItem) {
      cursorItem = doc.createXULElement
        ? doc.createXULElement('menuitem')
        : doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
      cursorItem.setAttribute('id', CURSOR_MENUITEM_ID);
      cursorItem.setAttribute('label', 'Ask in Cursor');
      cursorItem.addEventListener('command', (event: any) => {
        try { event?.preventDefault?.(); event?.stopPropagation?.(); } catch {}
        try {
          const id = getSelectedCollectionID(win);
          if (typeof id !== 'number') return;
          let name = '(unknown)';
          let count: number | undefined;
          try {
            const c: any = (Zotero as any).Collections?.get?.(id);
            if (c) {
              name = String(c.name ?? '(unknown)');
              try {
                const items = c.getChildItems?.(false, false) ?? [];
                count = Array.isArray(items) ? items.length : undefined;
              } catch {}
            }
          } catch {}
          const primer = buildCollectionPrimer({ collectionID: id, name, itemCount: count });
          const collection: any = (Zotero as any).Collections?.get?.(id);
          openCollectionInCursorWithIndex(collection, primer)
            .then((result) => {
              if (result?.reason) {
                try { (Zotero.getMainWindow?.() as any)?.alert(result.reason); } catch {}
              }
            })
            .catch((err: any) => debug('openCollectionInCursorWithIndex threw', err));
        } catch (err) {
          debug('cursor handler failed', err);
        }
      });
      menu.appendChild(cursorItem);
      try { Zotero.debug('[zotero-copilot] cursor collection menuitem attached', 3); } catch {}
    }
    return true;
  } catch (err) {
    debug('ensureMenuItem failed', err);
    return false;
  }
}

function attachShowingHandler(win: any): void {
  const menu = findCollectionMenu(win);
  if (!menu) return;
  if (menuShowingHandler) {
    try { menu.removeEventListener('popupshowing', menuShowingHandler); } catch {}
  }
  menuShowingHandler = () => {
    try {
      const isColl = isCollectionRow(win);
      const item = win.document.getElementById(MENUITEM_ID);
      if (item) item.hidden = !isColl;
      const cursorItem = win.document.getElementById(CURSOR_MENUITEM_ID);
      if (cursorItem) cursorItem.hidden = !isColl;
    } catch (err) {
      debug('popupshowing handler failed', err);
    }
  };
  try {
    menu.addEventListener('popupshowing', menuShowingHandler);
  } catch (err) {
    debug('addEventListener popupshowing failed', err);
  }
}

function removeMenuItem(win: any): void {
  try {
    const item = win?.document?.getElementById(MENUITEM_ID);
    if (item && item.parentNode) item.parentNode.removeChild(item);
    const cursorItem = win?.document?.getElementById(CURSOR_MENUITEM_ID);
    if (cursorItem && cursorItem.parentNode) cursorItem.parentNode.removeChild(cursorItem);
  } catch (err) {
    debug('removeMenuItem failed', err);
  }
  try {
    const menu = findCollectionMenu(win);
    if (menu && menuShowingHandler) {
      menu.removeEventListener('popupshowing', menuShowingHandler);
    }
  } catch (err) {
    debug('removing popupshowing handler failed', err);
  }
  menuShowingHandler = null;
}

export type RegisterCollectionMenuOptions = {
  rootURI: string;
};

export function registerCollectionMenu(opts: RegisterCollectionMenuOptions): () => void {
  if (installed && unregisterFn) {
    return unregisterFn;
  }
  installed = true;

  const startedAt = Date.now();
  const tryInstall = (): boolean => {
    const win = getMainWindow();
    if (!win) return false;
    const ok = ensureMenuItem(win, opts.rootURI);
    if (ok) attachShowingHandler(win);
    return ok;
  };

  if (!tryInstall()) {
    try {
      const win = getMainWindow();
      const setIntervalFn: any = (win && win.setInterval) || (globalThis as any).setInterval;
      const clearIntervalFn: any = (win && win.clearInterval) || (globalThis as any).clearInterval;
      pollIntervalId = setIntervalFn(() => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          try { clearIntervalFn(pollIntervalId); } catch {}
          pollIntervalId = null;
          return;
        }
        if (tryInstall()) {
          try { clearIntervalFn(pollIntervalId); } catch {}
          pollIntervalId = null;
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      debug('setInterval for menu install failed', err);
    }
  }

  unregisterFn = () => {
    try {
      if (pollIntervalId != null) {
        const win = getMainWindow();
        const clearIntervalFn: any = (win && win.clearInterval) || (globalThis as any).clearInterval;
        clearIntervalFn(pollIntervalId);
        pollIntervalId = null;
      }
    } catch (err) {
      debug('clearInterval on unregister failed', err);
    }
    const win = getMainWindow();
    if (win) removeMenuItem(win);
    installed = false;
    unregisterFn = null;
  };
  return unregisterFn;
}
