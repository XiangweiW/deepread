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

function appleScriptStringLiteral(s: string): string {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function activateCursorOpenFileAndPaste(filePath: string | null, autoSubmit: boolean = true): boolean {
  // One unified AppleScript: detect cold/warm Cursor, wait appropriately so PDF plugin
  // has time to initialize before we open the file, then Cmd+L → wait for MCP handshake → Cmd+V → optional Return.
  // Splitting this into multiple shell calls races: cold start drops the PDF into the default text editor (raw bytes) and loses Cmd+L keystrokes.
  const lines: string[] = [
    'tell application "System Events"',
    '  set isRunning to (exists (processes where name is "Cursor"))',
    'end tell',
    'tell application "Cursor" to activate',
    'if isRunning then',
    '  delay 0.8',
    'else',
    '  delay 3.5',
    'end if',
  ];
  if (filePath) {
    lines.push(`do shell script "open -a Cursor " & quoted form of ${appleScriptStringLiteral(filePath)}`);
    lines.push('delay 1.2');
    lines.push('tell application "Cursor" to activate');
    lines.push('delay 0.3');
  }
  lines.push('tell application "System Events"');
  lines.push('  keystroke "l" using command down');
  lines.push('  delay 1.8');
  lines.push('  keystroke "v" using command down');
  if (autoSubmit) {
    lines.push('  delay 0.6');
    lines.push('  key code 36');
  }
  lines.push('end tell');
  return runProcess('/usr/bin/osascript', ['-e', lines.join('\n')]);
}

function openCursorOnly(): boolean {
  return runProcess('/usr/bin/open', ['-a', 'Cursor']);
}

function getItemPdfPath(item: any): string | null {
  try {
    const attIDs: number[] = item?.getAttachments?.() ?? [];
    const Z: any = (globalThis as any).Zotero;
    for (const aid of attIDs) {
      try {
        const att = Z?.Items?.get?.(aid);
        if (att?.attachmentContentType === 'application/pdf') {
          const p = att.getFilePath?.();
          if (typeof p === 'string' && p.length > 0) return p;
        }
      } catch {}
    }
  } catch {}
  return null;
}

async function writeTempFile(filename: string, content: string): Promise<string | null> {
  try {
    const Z: any = (globalThis as any).Zotero;
    const path = '/tmp/' + filename;
    if (Z?.File?.putContentsAsync) {
      await Z.File.putContentsAsync(path, content);
      return path;
    }
  } catch (err) {
    debug('writeTempFile failed: ' + err, 1);
  }
  return null;
}

function escapeMdLinkText(s: string): string {
  return String(s ?? '(untitled)').replace(/[\[\]]/g, (c) => '\\' + c);
}

function buildCollectionMarkdown(collection: any): string {
  let name = '(unnamed)';
  let id: number | undefined;
  let items: any[] = [];
  try { name = String(collection?.name ?? '(unnamed)'); } catch {}
  try { id = Number(collection?.id); } catch {}
  try { items = collection?.getChildItems?.(false, false) ?? []; } catch {}

  const filtered = items.filter((it: any) => {
    try { return !it?.isNote?.() && !it?.isAttachment?.(); } catch { return false; }
  });

  const lines: string[] = [];
  lines.push(`# ${escapeMdLinkText(name)}`);
  lines.push('');
  lines.push(`${filtered.length} items — collectionID \`${id ?? '?'}\``);
  lines.push('');
  lines.push('Click a title to open the PDF in Cursor. Open chat (Cmd+L) and ask DeepRead anything across the whole collection — `rag_query`, `search_collection`, `get_item_fulltext` are all wired.');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const it of filtered) {
    try {
      const title = String(it.getField?.('title') ?? '(untitled)');
      const dateRaw = String(it.getField?.('date') ?? '');
      const year = dateRaw.match(/\d{4}/)?.[0] ?? '';
      const creators: any[] = it.getCreators?.() ?? [];
      const firstAuthor: string = creators[0]?.lastName ?? creators[0]?.name ?? '';
      const moreAuthors = creators.length > 1 ? ' et al.' : '';
      const itemKey = String(it.key ?? '');
      const pdfPath = getItemPdfPath(it);
      const headline = pdfPath
        ? `[${escapeMdLinkText(title)}](file://${encodeURI(pdfPath)})`
        : `**${escapeMdLinkText(title)}** _(no PDF attached)_`;
      const meta = [firstAuthor + moreAuthors, year].filter(Boolean).join(' · ');
      const metaSuffix = meta ? ` — ${meta}` : '';
      lines.push(`- ${headline}${metaSuffix} \`${itemKey}\``);
    } catch {
    }
  }

  if (filtered.length === 0) {
    lines.push('_No regular items in this collection._');
  }

  return lines.join('\n');
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
    const meta: string[] = [];
    if (it.title) meta.push('Title: ' + escapeForPrompt(it.title));
    if (it.authors && it.authors.length > 0) meta.push('Authors: ' + it.authors.slice(0, 6).map(escapeForPrompt).join(', ') + (it.authors.length > 6 ? ', et al.' : ''));
    if (it.year) meta.push('Year: ' + it.year);
    meta.push('Item key: ' + it.itemKey);

    return [
      "I'm opening this Zotero paper. Use the DeepRead MCP tools (the deepread server is connected — if you don't see the tools, list your available MCP tools first):",
      '',
      meta.join('\n'),
      '',
      'Steps:',
      `1. Call the get_item tool with itemKey "${it.itemKey}" for metadata.`,
      `2. Call get_item_fulltext with itemKey "${it.itemKey}" for the full PDF text.`,
      `3. Call get_annotations with itemKey "${it.itemKey}" to see my existing highlights.`,
      '4. Then write a tight first read: problem, approach, key contributions, methods, main findings, limitations.',
      '5. Then wait for my follow-up questions.',
      '',
      'Do NOT fall back to public sources or to reading sqlite directly — the local MCP tools are the source of truth and respect my privacy settings.',
    ].join('\n');
  }
  const lines: string[] = [
    "I'm opening multiple Zotero papers in Cursor.",
    '',
    'Selected items:',
  ];
  for (const it of items) {
    const t = it.title ? escapeForPrompt(it.title) : '(untitled)';
    const a = it.authors && it.authors.length > 0 ? ' — ' + escapeForPrompt(it.authors[0]) + (it.authors.length > 1 ? ' et al.' : '') : '';
    const y = it.year ? ' (' + it.year + ')' : '';
    lines.push('- ' + t + a + y + ' [key=' + it.itemKey + ']');
  }
  lines.push('');
  lines.push('Use the DeepRead MCP tools (server name: deepread). For each paper, call get_item and get_item_fulltext with the itemKey above. Then write a brief comparative read: each paper\'s core claim, then where they agree or disagree. Wait for my follow-ups. Do NOT fall back to public sources.');
  return lines.join('\n');
}

export function buildCollectionPrimer(coll: CollectionPrimerInput): string {
  const lines: string[] = [
    "I'm opening this Zotero collection in Cursor.",
    '',
    'Collection: ' + escapeForPrompt(coll.name),
    'Collection ID: ' + coll.collectionID,
  ];
  if (typeof coll.itemCount === 'number') lines.push('Item count: ' + coll.itemCount);
  lines.push('');
  lines.push('Use the DeepRead MCP tools (server name: deepread). If you don\'t see them, list your available MCP tools first.');
  lines.push('');
  lines.push('Steps:');
  lines.push(`1. Call the rag_query tool with collectionID ${coll.collectionID} and query "dominant themes and main contributions across this collection", topK 10.`);
  lines.push(`2. From the retrieved excerpts, give me: 3-5 dominant themes, the most cited / pivotal papers, and any obvious disagreements or gaps.`);
  lines.push(`3. If something needs more depth, follow up with search_collection or get_item_fulltext on specific items.`);
  lines.push('4. Then wait for my follow-up questions.');
  lines.push('');
  lines.push('Do NOT fall back to public sources — the local MCP index has my actual papers.');
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
  const launched = activateCursorOpenFileAndPaste(null);
  debug('osascript launched=' + launched);
  if (!launched) {
    openCursorOnly();
    return { ok: true, reason: 'Cursor opened, but auto-paste failed. The prompt is on your clipboard — open chat (Cmd+L) and paste (Cmd+V) manually. macOS may prompt you for Accessibility permission for Zotero the first time — once granted, future clicks paste automatically.' };
  }
  return { ok: true };
}

export async function openItemInCursorWithPdf(item: any, prompt: string): Promise<{ ok: boolean; reason?: string }> {
  debug('openItemInCursorWithPdf for item ' + (item?.key ?? '?'));
  if (!isCursorInstalled()) {
    return { ok: false, reason: 'Cursor.app not found at /Applications/Cursor.app.' };
  }
  if (!copyToClipboard(prompt)) {
    return { ok: false, reason: 'Failed to copy prompt to clipboard.' };
  }
  const pdfPath = getItemPdfPath(item);
  if (pdfPath) {
    debug('opening pdf in cursor: ' + pdfPath);
  } else {
    debug('no PDF path for item; just opening Cursor');
  }
  if (!activateCursorOpenFileAndPaste(pdfPath)) {
    return { ok: true, reason: 'Auto-paste failed. Cmd+L → Cmd+V manually. (Grant Zotero macOS Accessibility permission to skip this next time.)' };
  }
  return { ok: true, reason: pdfPath ? undefined : 'No PDF attached to this item — only the chat was opened.' };
}

export async function openCollectionInCursorWithIndex(collection: any, prompt: string): Promise<{ ok: boolean; reason?: string }> {
  debug('openCollectionInCursorWithIndex for collection ' + (collection?.id ?? '?'));
  if (!isCursorInstalled()) {
    return { ok: false, reason: 'Cursor.app not found at /Applications/Cursor.app.' };
  }
  if (!copyToClipboard(prompt)) {
    return { ok: false, reason: 'Failed to copy prompt to clipboard.' };
  }
  const md = buildCollectionMarkdown(collection);
  const filename = `deepread-collection-${collection?.id ?? 'unknown'}.md`;
  const path = await writeTempFile(filename, md);
  if (path) {
    debug('opening collection index in cursor: ' + path);
  }
  if (!activateCursorOpenFileAndPaste(path)) {
    return { ok: true, reason: 'Auto-paste failed. Cmd+L → Cmd+V manually.' };
  }
  return { ok: true };
}
