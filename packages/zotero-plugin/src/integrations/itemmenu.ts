import { buildItemPrimer, openInCursor, type ItemPrimerInput } from './cursorBridge';

const MENUITEM_ID = 'zotero-copilot-ask-item-in-cursor';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30000;

let installed = false;
let pollIntervalId: any = null;
let menuShowingHandler: ((e: any) => void) | null = null;
let unregisterFn: (() => void) | null = null;

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:itemmenu] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {}
}

function getMainWindow(): any | null {
  try { return Zotero?.getMainWindow?.() ?? null; } catch { return null; }
}

function findItemMenu(win: any): any | null {
  try { return win?.document?.getElementById('zotero-itemmenu') ?? null; } catch { return null; }
}

function getSelectedRegularItems(win: any): any[] {
  try {
    const items: any[] = win?.ZoteroPane?.getSelectedItems?.() ?? [];
    return items.filter((it) => {
      try {
        if (it?.isNote?.()) return false;
        if (it?.isAttachment?.()) {
          const parent = it?.parentItem;
          if (parent && !parent.isNote?.()) return parent;
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }).map((it) => {
      try {
        if (it?.isAttachment?.()) {
          const p = it?.parentItem;
          return p || it;
        }
      } catch {}
      return it;
    });
  } catch (err) {
    debug('getSelectedRegularItems failed', err);
    return [];
  }
}

function toPrimerInput(item: any): ItemPrimerInput | null {
  try {
    const itemKey = String(item?.key ?? '');
    if (!itemKey) return null;
    const title = String(item?.getField?.('title') ?? '');
    const year = String(item?.getField?.('date') ?? '').match(/\d{4}/)?.[0];
    let authors: string[] = [];
    try {
      const creators = item?.getCreators?.() ?? [];
      authors = creators
        .filter((c: any) => c?.creatorType === 'author' || !c?.creatorType)
        .map((c: any) => {
          const first = c?.firstName ?? '';
          const last = c?.lastName ?? c?.name ?? '';
          return `${first} ${last}`.trim();
        })
        .filter((s: string) => s.length > 0);
    } catch {}
    return { itemKey, title, authors, year };
  } catch (err) {
    debug('toPrimerInput failed', err);
    return null;
  }
}

function ensureMenuItem(win: any): boolean {
  const menu = findItemMenu(win);
  if (!menu) return false;
  try {
    const doc = win.document;
    let item = doc.getElementById(MENUITEM_ID);
    if (item) return true;
    item = doc.createXULElement
      ? doc.createXULElement('menuitem')
      : doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'menuitem');
    item.setAttribute('id', MENUITEM_ID);
    item.setAttribute('label', 'Ask in Cursor');
    item.addEventListener('command', (event: any) => {
      try { Zotero.debug('[zotero-copilot:itemmenu] command fired', 3); } catch {}
      try { event?.preventDefault?.(); event?.stopPropagation?.(); } catch {}
      try {
        const items = getSelectedRegularItems(win);
        try { Zotero.debug('[zotero-copilot:itemmenu] selected count=' + items.length, 3); } catch {}
        if (items.length === 0) {
          debug('no regular items selected');
          return;
        }
        const inputs = items.map(toPrimerInput).filter((x): x is ItemPrimerInput => x !== null);
        if (inputs.length === 0) {
          debug('no primer inputs after mapping');
          return;
        }
        const primer = buildItemPrimer(inputs);
        const result = openInCursor(primer);
        if (result.reason) {
          try { (Zotero.getMainWindow?.() as any)?.alert(result.reason); } catch {}
        }
      } catch (err) {
        debug('command handler failed', err);
      }
    });
    menu.appendChild(item);
    try { Zotero.debug('[zotero-copilot] item menuitem attached', 3); } catch {}
    return true;
  } catch (err) {
    debug('ensureMenuItem failed', err);
    return false;
  }
}

function attachShowingHandler(win: any): void {
  const menu = findItemMenu(win);
  if (!menu) return;
  if (menuShowingHandler) {
    try { menu.removeEventListener('popupshowing', menuShowingHandler); } catch {}
  }
  menuShowingHandler = () => {
    try {
      const item = win.document.getElementById(MENUITEM_ID);
      if (!item) {
        try { Zotero.debug('[zotero-copilot:itemmenu] popupshowing: menuitem not found', 1); } catch {}
        return;
      }
      const has = getSelectedRegularItems(win).length > 0;
      item.hidden = !has;
      try { Zotero.debug('[zotero-copilot:itemmenu] popupshowing: hidden=' + (!has), 3); } catch {}
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
  } catch (err) {
    debug('removeMenuItem failed', err);
  }
  try {
    const menu = findItemMenu(win);
    if (menu && menuShowingHandler) {
      menu.removeEventListener('popupshowing', menuShowingHandler);
    }
  } catch {}
  menuShowingHandler = null;
}

export function registerItemMenu(): () => void {
  if (installed && unregisterFn) return unregisterFn;
  installed = true;

  const startedAt = Date.now();
  const tryInstall = (): boolean => {
    const win = getMainWindow();
    if (!win) return false;
    const ok = ensureMenuItem(win);
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
      debug('setInterval failed', err);
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
    } catch {}
    const win = getMainWindow();
    if (win) removeMenuItem(win);
    installed = false;
    unregisterFn = null;
  };
  return unregisterFn;
}
