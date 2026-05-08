declare const Components: any;

function debug(msg: string, level: number = 3): void {
  try { Zotero.debug('[deepread:cursor-bridge] ' + msg, level); } catch {}
}

function copyToClipboard(text: string): boolean {
  try {
    const Cc: any = Components?.classes;
    const Ci: any = Components?.interfaces;
    if (!Cc || !Ci) return false;
    const helper = Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper);
    helper.copyString(text);
    return true;
  } catch (err) {
    debug('clipboard failed: ' + err, 1);
    return false;
  }
}

function runProcess(execPath: string, args: string[]): boolean {
  try {
    const Cc: any = Components?.classes;
    const Ci: any = Components?.interfaces;
    if (!Cc || !Ci) return false;
    const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
    file.initWithPath(execPath);
    if (!file.exists()) {
      debug('exec not found: ' + execPath, 1);
      return false;
    }
    const proc = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
    proc.init(file);
    proc.runAsync(args, args.length, null);
    return true;
  } catch (err) {
    debug('runProcess failed: ' + err, 1);
    return false;
  }
}

function isCursorInstalled(): boolean {
  try {
    const Cc: any = Components?.classes;
    const Ci: any = Components?.interfaces;
    const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
    file.initWithPath('/Applications/Cursor.app');
    return file.exists();
  } catch {
    return false;
  }
}

function activateCursorAndPaste(): boolean {
  // AppleScript: activate Cursor → wait → Cmd+L (open chat) → wait → Cmd+V (paste).
  // We do NOT press Return — the user types their actual question first.
  const script = [
    'tell application "Cursor" to activate',
    'delay 0.6',
    'tell application "System Events"',
    '  keystroke "l" using command down',
    '  delay 0.4',
    '  keystroke "v" using command down',
    'end tell',
  ].join('\n');
  return runProcess('/usr/bin/osascript', ['-e', script]);
}

function openCursorOnly(): boolean {
  return runProcess('/usr/bin/open', ['-a', 'Cursor']);
}

function escapeForPrompt(s: string): string {
  return String(s ?? '').replace(/\r/g, '').slice(0, 2000);
}

export type ItemPrimerInput = {
  itemKey: string;
  title?: string;
  authors?: string[];
  year?: string | number;
};

export type CollectionPrimerInput = {
  collectionID: number;
  name: string;
  itemCount?: number;
};

export function buildItemPrimer(items: ItemPrimerInput[]): string {
  if (items.length === 1) {
    const it = items[0];
    const lines: string[] = [];
    lines.push("I'm reading this paper in Zotero. Use the deepread MCP tools to load it:");
    lines.push('- `deepread.get_item` itemKey=' + it.itemKey + ' for metadata');
    lines.push('- `deepread.get_item_fulltext` itemKey=' + it.itemKey + ' for full PDF text');
    lines.push('- `deepread.get_annotations` itemKey=' + it.itemKey + " for my highlights & notes");
    lines.push('');
    if (it.title) lines.push('Paper: ' + escapeForPrompt(it.title));
    if (it.authors && it.authors.length > 0) lines.push('Authors: ' + it.authors.slice(0, 6).map(escapeForPrompt).join(', ') + (it.authors.length > 6 ? ', et al.' : ''));
    if (it.year) lines.push('Year: ' + it.year);
    lines.push('Item key: ' + it.itemKey);
    lines.push('');
    lines.push('Help me with: ');
    return lines.join('\n');
  }
  const lines: string[] = [];
  lines.push("I'm reading these papers in Zotero. Use deepread MCP tools to load any of them:");
  lines.push('- `deepread.get_item` itemKey=<key> for metadata');
  lines.push('- `deepread.get_item_fulltext` itemKey=<key> for full PDF text');
  lines.push('- `deepread.get_annotations` itemKey=<key> for my highlights & notes');
  lines.push('');
  lines.push('Selected items:');
  for (const it of items) {
    const t = it.title ? escapeForPrompt(it.title) : '(untitled)';
    const a = it.authors && it.authors.length > 0 ? ' — ' + escapeForPrompt(it.authors[0]) + (it.authors.length > 1 ? ' et al.' : '') : '';
    const y = it.year ? ' (' + it.year + ')' : '';
    lines.push('- ' + t + a + y + ' [key=' + it.itemKey + ']');
  }
  lines.push('');
  lines.push('Help me with: ');
  return lines.join('\n');
}

export function buildCollectionPrimer(coll: CollectionPrimerInput): string {
  const lines: string[] = [];
  lines.push("I'm focused on this Zotero collection. Use deepread MCP for any cross-paper question:");
  lines.push('- `deepread.list_collections` to confirm context');
  lines.push('- `deepread.search_collection` collectionID=' + coll.collectionID + ' query=... to find specific papers');
  lines.push('- `deepread.rag_query` collectionID=' + coll.collectionID + ' query=... for retrieval-augmented answers across the whole collection');
  lines.push('- `deepread.get_item` / `get_item_fulltext` / `get_annotations` for individual papers in the collection');
  lines.push('');
  lines.push('Collection: ' + escapeForPrompt(coll.name));
  lines.push('Collection ID: ' + coll.collectionID);
  if (typeof coll.itemCount === 'number') lines.push('Item count: ' + coll.itemCount);
  lines.push('');
  lines.push('Help me with: ');
  return lines.join('\n');
}

export function openInCursor(prompt: string): { ok: boolean; reason?: string } {
  debug('openInCursor called, prompt len=' + prompt.length);
  if (!isCursorInstalled()) {
    debug('Cursor.app not found');
    return { ok: false, reason: 'Cursor.app not found at /Applications/Cursor.app. Install Cursor and retry.' };
  }
  const copied = copyToClipboard(prompt);
  debug('clipboard copied=' + copied);
  if (!copied) {
    return { ok: false, reason: 'Failed to copy prompt to clipboard.' };
  }
  const launched = activateCursorAndPaste();
  debug('osascript launched=' + launched);
  if (!launched) {
    openCursorOnly();
    return { ok: true, reason: 'Cursor opened, but auto-paste failed. The prompt is on your clipboard — open chat (Cmd+L) and paste (Cmd+V) manually. macOS may prompt you for Accessibility permission for Zotero the first time — once granted, future clicks paste automatically.' };
  }
  return { ok: true };
}
