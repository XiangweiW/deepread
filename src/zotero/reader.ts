export type ReaderHandle = {
  reader: any;
  container: HTMLElement;
  detach: () => void;
};

export type ReaderHandlers = {
  onMount: (handle: ReaderHandle) => void;
  onUnmount: (handle: ReaderHandle) => void;
};

const POLL_INTERVAL_MS = 500;
const MAX_POLL_DURATION_MS = 60000;
const SIDEBAR_ID = 'zotero-copilot-sidebar';
const STYLE_ID = 'zotero-copilot-style';
const SIDEBAR_STYLE = [
  'position: absolute',
  'top: 0',
  'right: 0',
  'width: 380px',
  'height: 100%',
  'border-left: 1px solid #ccc',
  'background: white',
  'z-index: 1000',
  'overflow: hidden',
  '-moz-user-select: text',
  '-webkit-user-select: text',
  'user-select: text',
].join('; ');

const SIDEBAR_CSS = `
#${'zotero-copilot-sidebar'}, #${'zotero-copilot-sidebar'} * {
  -moz-user-select: text !important;
  -webkit-user-select: text !important;
  user-select: text !important;
}
#${'zotero-copilot-sidebar'} button,
#${'zotero-copilot-sidebar'} select,
#${'zotero-copilot-sidebar'} option {
  -moz-user-select: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
}
#${'zotero-copilot-sidebar'} ::selection {
  background-color: #b3d4fc !important;
  color: inherit !important;
}
#${'zotero-copilot-sidebar'} ::-moz-selection {
  background-color: #b3d4fc !important;
  color: inherit !important;
}
`;

const TRAP_EVENTS: ReadonlyArray<keyof HTMLElementEventMap> = [
  'contextmenu',
];

let handlers: ReaderHandlers | null = null;
let pollIntervalId: any = null;
let pollStartedAt = 0;
const attached = new WeakMap<any, ReaderHandle>();
const attachedReaders = new Set<any>();

function stopBubble(e: Event): void {
  try {
    e.stopPropagation();
  } catch {
  }
}

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? `${err.message}` : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function getReaderDoc(reader: any): Document | null {
  try {
    const doc = reader?._iframeWindow?.document;
    if (!doc) return null;
    if (doc.readyState !== 'complete' && doc.readyState !== 'interactive') return null;
    return doc as Document;
  } catch (err) {
    debug('getReaderDoc failed', err);
    return null;
  }
}

function findMountPoint(doc: Document): HTMLElement | null {
  try {
    const viewer = doc.querySelector('#viewerContainer');
    if (viewer && viewer.parentElement) return viewer.parentElement as HTMLElement;
    const main = doc.querySelector('#mainContainer');
    if (main) return main as HTMLElement;
    if (doc.body) return doc.body;
  } catch (err) {
    debug('findMountPoint failed', err);
  }
  return null;
}

function injectSidebar(reader: any): ReaderHandle | null {
  const doc = getReaderDoc(reader);
  if (!doc) return null;
  const mount = findMountPoint(doc);
  if (!mount) {
    debug('no mount point found in reader document');
    return null;
  }
  try {
    const existing = doc.getElementById(SIDEBAR_ID);
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }
  } catch (err) {
    debug('removing existing sidebar failed', err);
  }

  let container: HTMLElement;
  try {
    if (!doc.getElementById(STYLE_ID)) {
      const styleEl = doc.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = SIDEBAR_CSS;
      (doc.head || doc.documentElement || mount).appendChild(styleEl);
    }
    container = doc.createElement('div');
    container.id = SIDEBAR_ID;
    container.setAttribute('style', SIDEBAR_STYLE);
    for (const evt of TRAP_EVENTS) {
      container.addEventListener(evt, stopBubble as EventListener, false);
    }
    mount.appendChild(container);
  } catch (err) {
    debug('injectSidebar createElement/append failed', err);
    return null;
  }

  const handle: ReaderHandle = {
    reader,
    container,
    detach: () => {
      try {
        if (container && container.parentElement) {
          container.parentElement.removeChild(container);
        }
      } catch (err) {
        debug('detach removeChild failed', err);
      }
    },
  };
  return handle;
}

function getCurrentReaders(): any[] {
  try {
    const list = Zotero?.Reader?._readers;
    if (Array.isArray(list)) return list.slice();
  } catch (err) {
    debug('reading Zotero.Reader._readers failed', err);
  }
  return [];
}

function tick(): void {
  if (!handlers) return;
  const now = Date.now();
  if (now - pollStartedAt > MAX_POLL_DURATION_MS && attachedReaders.size === 0) {
    debug('poll cap reached with no readers — leaving interval running');
  }
  let readers: any[] = [];
  try {
    readers = getCurrentReaders();
  } catch (err) {
    debug('tick getCurrentReaders failed', err);
    return;
  }
  const present = new Set<any>(readers);

  for (const reader of readers) {
    if (attachedReaders.has(reader)) continue;
    try {
      const handle = injectSidebar(reader);
      if (!handle) continue;
      attached.set(reader, handle);
      attachedReaders.add(reader);
      try {
        handlers.onMount(handle);
      } catch (err) {
        debug('onMount handler threw', err);
      }
    } catch (err) {
      debug('injecting sidebar for reader failed', err);
    }
  }

  for (const reader of Array.from(attachedReaders)) {
    if (present.has(reader)) continue;
    const handle = attached.get(reader);
    attachedReaders.delete(reader);
    if (!handle) continue;
    try {
      handlers.onUnmount(handle);
    } catch (err) {
      debug('onUnmount handler threw', err);
    }
    try {
      handle.detach();
    } catch (err) {
      debug('handle.detach failed', err);
    }
    attached.delete(reader);
  }
}

export function registerReaderIntegration(h: ReaderHandlers): void {
  if (handlers) {
    debug('registerReaderIntegration called twice; replacing handlers');
    unregisterReaderIntegration();
  }
  handlers = h;
  pollStartedAt = Date.now();
  try {
    const win: any = Zotero?.getMainWindow?.();
    const setIntervalFn: any = (win && win.setInterval) || (globalThis as any).setInterval;
    pollIntervalId = setIntervalFn(tick, POLL_INTERVAL_MS);
  } catch (err) {
    debug('registerReaderIntegration setInterval failed', err);
  }
  try {
    tick();
  } catch (err) {
    debug('initial tick failed', err);
  }
}

export function unregisterReaderIntegration(): void {
  try {
    if (pollIntervalId != null) {
      const win: any = Zotero?.getMainWindow?.();
      const clearIntervalFn: any = (win && win.clearInterval) || (globalThis as any).clearInterval;
      clearIntervalFn(pollIntervalId);
    }
  } catch (err) {
    debug('clearInterval failed', err);
  }
  pollIntervalId = null;

  for (const reader of Array.from(attachedReaders)) {
    const handle = attached.get(reader);
    attachedReaders.delete(reader);
    if (!handle) continue;
    try {
      if (handlers) handlers.onUnmount(handle);
    } catch (err) {
      debug('onUnmount during unregister threw', err);
    }
    try {
      handle.detach();
    } catch (err) {
      debug('handle.detach during unregister failed', err);
    }
    attached.delete(reader);
  }
  handlers = null;
}

export function getReaderForItem(itemID: number): any | undefined {
  try {
    const readers = getCurrentReaders();
    for (const r of readers) {
      try {
        if (Number(r?.itemID) === Number(itemID)) return r;
      } catch (err) {
        debug('getReaderForItem compare failed', err);
      }
    }
  } catch (err) {
    debug('getReaderForItem failed', err);
  }
  return undefined;
}

export function getCurrentReader(): any | undefined {
  try {
    const win: any = Zotero?.getMainWindow?.();
    const selectedID = win?.Zotero_Tabs?.selectedID;
    if (selectedID == null) return undefined;
    const readers = getCurrentReaders();
    for (const r of readers) {
      try {
        if (r?.tabID === selectedID) return r;
      } catch (err) {
        debug('getCurrentReader compare failed', err);
      }
    }
  } catch (err) {
    debug('getCurrentReader failed', err);
  }
  return undefined;
}
