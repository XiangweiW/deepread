import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AnthropicProvider, GeminiProvider, type LLMProvider } from '../llm';
import { Prefs } from '../prefs/manager';
import { BUILTIN_TEMPLATES } from '../prompts';
import { Chat } from '../ui/chat';
import { getCollectionRagContext } from '../rag/service';
import { buildOrUpdateIndex } from '../rag/indexer';
import { loadIndex } from '../rag/store';
import type { PaperContext } from '../context/types';

type CollectionChatSession = {
  id: string;
  collectionID: number;
  collectionName: string;
  rootURI: string;
};

const sessions = new Map<string, CollectionChatSession>();
const roots = new Map<string, Root>();

let sessionCounter = 0;

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:collectionchat] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function buildProvider(): LLMProvider {
  const id = Prefs.getProvider();
  if (id === 'gemini') {
    return new GeminiProvider({
      apiKey: Prefs.getGeminiApiKey(),
      defaultModel: Prefs.getGeminiModel(),
    });
  }
  return new AnthropicProvider({
    apiKey: Prefs.getApiKey(),
    defaultModel: Prefs.getModel(),
  });
}

function makeId(): string {
  sessionCounter++;
  return `s${Date.now()}_${sessionCounter}`;
}

function getCollectionInfo(collectionID: number): { name: string } {
  try {
    const collection = Zotero.Collections?.get?.(collectionID);
    if (collection) return { name: String(collection.name ?? `Collection ${collectionID}`) };
  } catch (err) {
    debug('getCollectionInfo failed', err);
  }
  return { name: `Collection ${collectionID}` };
}

function showProgressWindow(title: string): any | null {
  try {
    if (Zotero?.ProgressWindow) {
      const pw = new Zotero.ProgressWindow({ closeOnClick: false });
      pw.changeHeadline(title);
      pw.show();
      return pw;
    }
  } catch (err) {
    debug('ProgressWindow create failed', err);
  }
  return null;
}

function updateProgress(pw: any | null, message: string): void {
  if (!pw) return;
  try {
    if (pw._lastItem && typeof pw._lastItem.setText === 'function') {
      pw._lastItem.setText(message);
      return;
    }
    if (Zotero?.ProgressWindow?.ItemProgress) {
      const item = new Zotero.ProgressWindow.ItemProgress('chrome://zotero/skin/tick.png', message);
      pw._lastItem = item;
      return;
    }
    if (typeof pw.addDescription === 'function') pw.addDescription(message);
  } catch (err) {
    debug('updateProgress failed', err);
  }
}

function closeProgress(pw: any | null, message?: string): void {
  if (!pw) return;
  try {
    if (message) pw.changeHeadline(message);
    if (typeof pw.startCloseTimer === 'function') pw.startCloseTimer(2500);
  } catch (err) {
    debug('closeProgress failed', err);
  }
}

export type OpenCollectionChatOptions = {
  rootURI: string;
};

export async function openCollectionChat(
  collectionID: number,
  opts: OpenCollectionChatOptions,
): Promise<void> {
  const mainWin: any = Zotero?.getMainWindow?.();
  if (!mainWin) {
    debug('no main window available');
    return;
  }
  const { name } = getCollectionInfo(collectionID);
  const sessionId = makeId();
  sessions.set(sessionId, {
    id: sessionId,
    collectionID,
    collectionName: name,
    rootURI: opts.rootURI,
  });

  const apiKey = Prefs.getGeminiApiKey();
  if (!apiKey) {
    try {
      mainWin.alert('DeepRead: please set the Gemini API key in preferences before analyzing a collection.');
    } catch {
    }
    sessions.delete(sessionId);
    return;
  }

  const pw = showProgressWindow(`DeepRead — preparing index for "${name}"`);
  try {
    const existing = await loadIndex(collectionID);
    if (!existing) {
      updateProgress(pw, 'Building index (first run may take 1-2 minutes)…');
    } else {
      updateProgress(pw, `Reusing existing index (${existing.chunks.length} chunks). Refreshing…`);
    }
    await buildOrUpdateIndex(collectionID, { apiKey }, (event) => {
      if (event.kind === 'item') {
        updateProgress(
          pw,
          `Indexed ${event.itemIndex + 1}/${event.totalItems}: ${event.title} (+${event.chunksEmbedded}, reused ${event.chunksReused})`,
        );
      } else if (event.kind === 'item-skipped') {
        updateProgress(pw, `Skipped ${event.itemIndex + 1}/${event.totalItems}: ${event.title} — ${event.reason}`);
      } else if (event.kind === 'error') {
        updateProgress(pw, `Warning: ${event.message}`);
      } else if (event.kind === 'done') {
        updateProgress(pw, `Done: ${event.totalChunks} chunks across ${event.totalItems} items.`);
      }
    });
    closeProgress(pw, `DeepRead — index ready for "${name}"`);
  } catch (err) {
    closeProgress(pw, `DeepRead — indexing failed`);
    debug('index build failed', err);
    try {
      mainWin.alert('DeepRead: failed to build index — ' + (err instanceof Error ? err.message : String(err)));
    } catch {
    }
    sessions.delete(sessionId);
    return;
  }

  try {
    debug('mounting overlay in main window for session ' + sessionId);
    mountOverlay(mainWin, sessionId);
    debug('overlay mounted ok');
  } catch (err) {
    debug('mountOverlay threw', err);
    try { mainWin.alert('Failed to open DeepRead chat: ' + err); } catch {}
    sessions.delete(sessionId);
  }
}

const OVERLAY_ID_PREFIX = 'zotero-copilot-overlay-';

const HTML_NS = 'http://www.w3.org/1999/xhtml';

function mountOverlay(mainWin: any, sessionId: string): void {
  const doc = mainWin.document;
  const target: any = doc.body || doc.getElementById('main-window') || doc.documentElement;
  if (!target) {
    throw new Error('no suitable mount target in main window');
  }
  const existingId = OVERLAY_ID_PREFIX + sessionId;
  const existing = doc.getElementById(existingId);
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const overlay = doc.createElementNS(HTML_NS, 'div');
  overlay.id = existingId;
  overlay.style.cssText = [
    'position: fixed',
    'top: 60px',
    'right: 40px',
    'width: 820px',
    'height: 700px',
    'min-width: 360px',
    'min-height: 280px',
    'max-width: 95vw',
    'max-height: 95vh',
    'background: #ffffff',
    'border: 1px solid #c9ccd0',
    'border-radius: 8px',
    'box-shadow: 0 6px 30px rgba(0,0,0,0.18)',
    'z-index: 99999',
    'display: flex',
    'flex-direction: column',
    'overflow: hidden',
    'resize: both',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'color: #1a1a1a',
  ].join('; ');

  const header = doc.createElementNS(HTML_NS, 'div');
  header.style.cssText = 'padding:8px 12px; background:#f4f6f8; border-bottom:1px solid #d0d7de; display:flex; align-items:center; justify-content:space-between; cursor:move; user-select:none; flex: 0 0 auto;';
  const session = sessions.get(sessionId);
  const title = doc.createElementNS(HTML_NS, 'div');
  title.style.cssText = 'font-weight:600; font-size:13px; flex:1 1 auto;';
  title.textContent = 'DeepRead — Collection: ' + (session?.collectionName || '');

  const closeBtn = doc.createElementNS(HTML_NS, 'button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; font-size:16px; padding:2px 8px; color:#555;';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => {
    try {
      const r = roots.get(sessionId);
      if (r) { r.unmount(); roots.delete(sessionId); }
    } catch {}
    try {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    } catch {}
    sessions.delete(sessionId);
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  const rootDiv = doc.createElementNS(HTML_NS, 'div');
  rootDiv.id = 'zotero-copilot-collection-root-' + sessionId;
  rootDiv.style.cssText = 'flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden;';

  // Drag-to-move
  let dragStart: { x: number; y: number; left: number; top: number } | null = null;
  header.addEventListener('mousedown', (e: MouseEvent) => {
    const rect = overlay.getBoundingClientRect();
    dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    e.preventDefault();
  });
  doc.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    overlay.style.left = (dragStart.left + dx) + 'px';
    overlay.style.top = (dragStart.top + dy) + 'px';
    overlay.style.right = 'auto';
  });
  doc.addEventListener('mouseup', () => { dragStart = null; });

  overlay.appendChild(header);
  overlay.appendChild(rootDiv);
  target.appendChild(overlay);

  bootstrapCollectionChatWindow(mainWin, sessionId, rootDiv as unknown as HTMLElement);
}

function makeRagBuildContext(
  collectionID: number,
  queryRef: { current: string },
): () => Promise<PaperContext | undefined> {
  return async () => {
    try {
      return await getCollectionRagContext(collectionID, queryRef.current || '', {
        buildIfMissing: true,
      });
    } catch (err) {
      debug('rag buildContext failed', err);
      return undefined;
    }
  };
}

export function bootstrapCollectionChatWindow(win: any, sessionId: string, rootEl?: HTMLElement): void {
  const session = sessions.get(sessionId);
  if (!session) {
    debug(`bootstrapCollectionChatWindow: no session ${sessionId}`);
    try { if (rootEl) rootEl.textContent = 'Session not found.'; } catch {}
    return;
  }
  try {
    if (!rootEl) win.document.title = `DeepRead — ${session.collectionName}`;
  } catch {
  }
  const root = rootEl ?? win.document.getElementById('root');
  if (!root) {
    debug('bootstrapCollectionChatWindow: #root not found');
    return;
  }

  const queryRef: { current: string } = { current: '' };
  const buildCtxBase = makeRagBuildContext(session.collectionID, queryRef);
  const provider = buildProvider();
  const baseSystem = Prefs.getSystemPrompt();
  const systemPrompt =
    baseSystem +
    '\n\nYou are answering questions about a collection of papers. The user has selected the collection "' +
    session.collectionName +
    '". The provided context contains the most relevant excerpts retrieved from across the collection. Cite paper titles and chunk numbers (e.g. [1], [2]) when supporting your answer. If the excerpts do not contain enough information, say so plainly.';

  const captureQueryWrapper = async (): Promise<PaperContext | undefined> => {
    try {
      const ta = win.document.querySelector('textarea');
      if (ta && typeof ta.value === 'string') queryRef.current = ta.value;
    } catch {
    }
    return buildCtxBase();
  };

  const reactRoot = createRoot(root as HTMLElement);
  roots.set(sessionId, reactRoot);
  reactRoot.render(
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          minHeight: 0,
          boxSizing: 'border-box',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: 13,
          color: '#1a1a1a',
          background: '#ffffff',
        },
      },
      React.createElement(Chat, {
        provider,
        templates: BUILTIN_TEMPLATES,
        buildContext: captureQueryWrapper,
        systemPrompt,
        model: Prefs.getActiveModel(),
      }),
    ),
  );

  try {
    win.addEventListener('unload', () => {
      try {
        const r = roots.get(sessionId);
        if (r) {
          r.unmount();
          roots.delete(sessionId);
        }
      } catch (err) {
        debug('unmount on unload failed', err);
      }
      sessions.delete(sessionId);
    });
  } catch (err) {
    debug('register unload failed', err);
  }
}

export function unmountAllCollectionChats(): void {
  for (const [id, r] of roots.entries()) {
    try {
      r.unmount();
    } catch (err) {
      debug('unmount failed', err);
    }
    roots.delete(id);
  }
  sessions.clear();
}
