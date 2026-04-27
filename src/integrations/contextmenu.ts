const PLUGIN_ID = 'zotero-copilot@xiangweiw.dev';
const HANDLERS_KEY = '__copilotChatHandlers';

let unregister: (() => void) | null = null;

export function registerSelectionPopup(): () => void {
  try {
    const handler = (event: any) => {
      try {
        const { reader, doc, append, params } = event ?? {};
        if (!doc || !append) return;
        const annotation = params?.annotation;
        const selectedText = annotation?.text || params?.text || reader?.getSelectedText?.() || '';
        if (!selectedText) return;

        const btn = doc.createElement('button');
        btn.textContent = 'Ask DeepRead';
        btn.style.cssText = 'margin: 0 4px; padding: 2px 8px; cursor: pointer;';
        btn.addEventListener('click', (e: Event) => {
          try { e.stopPropagation(); } catch {}
          try { e.preventDefault(); } catch {}
          try { Zotero.debug('[zotero-copilot] Ask Copilot button clicked, len=' + selectedText.length, 3); } catch {}
          callChatHandlers(selectedText);
        });
        append(btn);
      } catch (err) {
        try { Zotero.debug('[zotero-copilot] selection popup handler failed: ' + err, 1); } catch {}
      }
    };

    Zotero.Reader.registerEventListener('renderTextSelectionPopup', handler, PLUGIN_ID);
    try { Zotero.debug('[zotero-copilot] selection popup listener registered', 3); } catch {}

    unregister = () => {
      try {
        Zotero.Reader.unregisterEventListener?.('renderTextSelectionPopup', handler);
      } catch {}
    };
    return unregister;
  } catch (err) {
    try { Zotero.debug('[zotero-copilot] registerSelectionPopup failed: ' + err, 1); } catch {}
    unregister = () => {};
    return unregister;
  }
}

function callChatHandlers(text: string): void {
  try {
    const mainWin: any = Zotero?.getMainWindow?.();
    if (!mainWin) {
      try { Zotero.debug('[zotero-copilot] callChatHandlers: no main window', 1); } catch {}
      return;
    }
    const list: Array<(t: string) => void> = mainWin[HANDLERS_KEY];
    if (!Array.isArray(list) || list.length === 0) {
      try { Zotero.debug('[zotero-copilot] callChatHandlers: no chat handlers registered', 1); } catch {}
      return;
    }
    const message = `Explain this passage from the paper:\n\n${text}`;
    let invoked = 0;
    for (const fn of list) {
      try { fn(message); invoked++; } catch (err) {
        try { Zotero.debug('[zotero-copilot] chat handler threw: ' + err, 1); } catch {}
      }
    }
    try { Zotero.debug('[zotero-copilot] callChatHandlers invoked ' + invoked + '/' + list.length, 3); } catch {}
  } catch (err) {
    try { Zotero.debug('[zotero-copilot] callChatHandlers failed: ' + err, 1); } catch {}
  }
}
