import { AnthropicProvider, GeminiProvider, type LLMProvider } from './llm';
import { Prefs } from './prefs';
import { extractFromReader } from './context';
import { BUILTIN_TEMPLATES } from './prompts';
import { mountSidebar, unmountSidebar } from './ui';
import {
  registerReaderIntegration,
  unregisterReaderIntegration,
  saveChatAsNote,
  type ReaderHandle,
  type ChatTurn,
} from './zotero';
import { registerSelectionPopup } from './integrations/contextmenu';
import { registerPrefsPane } from './integrations/prefspanel';
import { registerCollectionMenu } from './integrations/collectionmenu';
import {
  bootstrapCollectionChatWindow,
  unmountAllCollectionChats,
} from './integrations/collectionchat';
import { getCollectionRagContext } from './rag';

let unregisterSelection: (() => void) | null = null;
let unregisterCollection: (() => void) | null = null;

function debug(msg: string, level: number = 3): void {
  try {
    Zotero.debug('[zotero-copilot] ' + msg, level);
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

function makeBuildContext(handle: ReaderHandle) {
  return async () => {
    try {
      return await extractFromReader(handle.reader, {
        includeFullText: Prefs.getAllowFullTextUpload(),
      });
    } catch (e) {
      debug('context build failed: ' + e, 1);
      return undefined;
    }
  };
}

function makeOnSaveToNote(handle: ReaderHandle) {
  return async (transcript: { role: string; content: string }[]): Promise<void> => {
    try {
      const reader: any = handle.reader;
      const itemID: number | undefined = reader?.itemID ?? reader?._item?.id;
      if (!itemID) {
        debug('saveChatAsNote: no itemID on reader', 1);
        return;
      }
      const item = Zotero.Items.get(itemID);
      if (!item) {
        debug('saveChatAsNote: Items.get(' + itemID + ') returned nothing', 1);
        return;
      }
      const parent = item.isAttachment?.() && item.parentItem ? item.parentItem : item;
      const parentID: number = Number(parent?.id ?? itemID);
      const turns: ChatTurn[] = transcript
        .filter((t) => t.role === 'user' || t.role === 'assistant')
        .map((t) => ({ role: t.role as 'user' | 'assistant', content: t.content }));
      await saveChatAsNote(parentID, turns, { templateName: 'Chat' });
    } catch (e) {
      debug('saveChatAsNote failed: ' + e, 1);
      throw e;
    }
  };
}

function mountChat(handle: ReaderHandle): void {
  try {
    mountSidebar(handle.container, {
      chatProps: {
        provider: buildProvider(),
        templates: BUILTIN_TEMPLATES,
        buildContext: makeBuildContext(handle),
        systemPrompt: Prefs.getSystemPrompt(),
        model: Prefs.getActiveModel(),
        onSaveToNote: makeOnSaveToNote(handle),
      },
      onClose: () => {
        try { handle.detach(); } catch (e) { debug('detach failed: ' + e, 1); }
      },
    });
  } catch (e) {
    debug('mountChat failed: ' + e, 1);
  }
}

function unmountChat(handle: ReaderHandle): void {
  try {
    unmountSidebar(handle.container);
  } catch (e) {
    debug('unmountChat failed: ' + e, 1);
  }
}

export async function onStartup(args: { id: string; version: string; rootURI: string }): Promise<void> {
  try {
    if (Zotero?.uiReadyPromise) {
      await Zotero.uiReadyPromise;
    }

    registerReaderIntegration({
      onMount: (handle: ReaderHandle) => {
        mountChat(handle);
      },
      onUnmount: (handle: ReaderHandle) => {
        unmountChat(handle);
      },
    });

    try {
      unregisterSelection = registerSelectionPopup();
    } catch (e) {
      debug('registerSelectionPopup failed: ' + e, 1);
    }

    try {
      registerPrefsPane(args.rootURI);
    } catch (e) {
      debug('registerPrefsPane failed: ' + e, 1);
    }

    try {
      unregisterCollection = registerCollectionMenu({ rootURI: args.rootURI });
    } catch (e) {
      debug('registerCollectionMenu failed: ' + e, 1);
    }

    debug('startup complete v' + args.version);
  } catch (e) {
    debug('startup failed: ' + e, 1);
  }
}

export function onShutdown(): void {
  try {
    if (unregisterSelection) { try { unregisterSelection(); } catch {} unregisterSelection = null; }
    if (unregisterCollection) { try { unregisterCollection(); } catch {} unregisterCollection = null; }
    try { unmountAllCollectionChats(); } catch (e) { debug('unmountAllCollectionChats failed: ' + e, 1); }
    unregisterReaderIntegration();
  } catch (e) {
    debug('shutdown error: ' + e, 1);
  }
}

export { bootstrapCollectionChatWindow, getCollectionRagContext };
