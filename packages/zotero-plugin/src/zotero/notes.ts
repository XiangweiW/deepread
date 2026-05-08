export type ChatTurn = { role: 'user' | 'assistant'; content: string; ts?: number };

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? `${err.message}` : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMd(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, t: string) => `<strong>${t}</strong>`);
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre: string, t: string) => `${pre}<em>${t}</em>`);
  out = out.replace(/_([^_\n]+)_/g, (_m, t: string) => `<em>${t}</em>`);
  return out;
}

function mdToHtml(md: string): string {
  if (!md) return '';
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let inList: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${inlineMd(ulMatch[1])}</li>`);
      i++;
      continue;
    }
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${inlineMd(olMatch[1])}</li>`);
      i++;
      continue;
    }

    closeList();
    const para: string[] = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^```/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inlineMd(para.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

function renderTurns(turns: ChatTurn[]): string {
  const parts: string[] = [];
  for (const turn of turns) {
    const label = turn.role === 'user' ? 'You' : 'DeepRead';
    const body = mdToHtml(String(turn.content ?? ''));
    parts.push(`<p><strong>${label}:</strong></p>`);
    parts.push(`<blockquote>${body}</blockquote>`);
  }
  return parts.join('\n');
}

export async function saveChatAsNote(
  parentItemID: number,
  turns: ChatTurn[],
  opts?: { title?: string; templateName?: string }
): Promise<number> {
  const parent = Zotero.Items.get(parentItemID);
  if (!parent) {
    throw new Error(`saveChatAsNote: no item with id ${parentItemID}`);
  }
  const titleLabel = opts?.title || opts?.templateName || 'Chat';
  const stamp = formatTimestamp(new Date());
  const titleLine = `DeepRead — ${titleLabel} — ${stamp}`;
  const body = renderTurns(turns);
  const html = `<h1>${escapeHtml(titleLine)}</h1>\n${body}`;

  try {
    const note = new Zotero.Item('note');
    note.parentItemID = parentItemID;
    note.setNote(html);
    try {
      note.addTag('copilot');
    } catch (err) {
      debug('addTag(copilot) failed', err);
    }
    const id = await note.saveTx();
    return Number(id ?? note.id);
  } catch (err) {
    debug('saveChatAsNote failed', err);
    throw err;
  }
}

export async function appendToNote(noteID: number, html: string): Promise<void> {
  try {
    const note = Zotero.Items.get(noteID);
    if (!note) {
      throw new Error(`appendToNote: no item with id ${noteID}`);
    }
    const existing = String(note.getNote?.() ?? '');
    const combined = existing + (existing.endsWith('\n') ? '' : '\n') + html;
    note.setNote(combined);
    await note.saveTx();
  } catch (err) {
    debug('appendToNote failed', err);
    throw err;
  }
}
