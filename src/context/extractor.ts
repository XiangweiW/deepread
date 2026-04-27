import type { Annotation, PaperContext, PaperMeta } from './types';

const AUTHOR_TYPES = new Set(['author', 'contributor']);
const ANNOTATION_TYPES = new Set<Annotation['type']>([
  'highlight',
  'note',
  'underline',
  'strikethrough',
  'image',
  'ink',
]);

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? `${err.message}` : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

export function stripHtml(html: string): string {
  if (!html) return '';
  let out = String(html).replace(/<\s*br\s*\/?\s*>/gi, '\n');
  out = out.replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, '\n');
  out = out.replace(/<[^>]+>/g, '');
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  out = out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function safeField(item: any, field: string): string {
  try {
    const v = item.getField(field);
    return v == null ? '' : String(v);
  } catch (err) {
    debug(`getField(${field}) failed`, err);
    return '';
  }
}

function parseYear(date: string): number | undefined {
  if (!date) return undefined;
  const m = date.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

export async function extractMeta(item: any): Promise<PaperMeta> {
  const meta: PaperMeta = {
    itemID: 0,
    itemKey: '',
    title: '',
    authors: [],
  };
  try {
    meta.itemID = Number(item?.id ?? item?.itemID ?? 0) || 0;
    meta.itemKey = String(item?.key ?? '');
    meta.title = safeField(item, 'title');
    const date = safeField(item, 'date');
    const year = parseYear(date);
    if (year) meta.year = year;
    const journal = safeField(item, 'publicationTitle') || safeField(item, 'bookTitle');
    if (journal) meta.journal = journal;
    const doi = safeField(item, 'DOI');
    if (doi) meta.doi = doi;
    const abstract = safeField(item, 'abstractNote');
    if (abstract) meta.abstract = abstract;
    try {
      const creators = item.getCreators?.() ?? [];
      meta.authors = creators
        .filter((c: any) => {
          const t = String(c?.creatorType ?? '').toLowerCase();
          return AUTHOR_TYPES.has(t);
        })
        .map((c: any) => {
          const first = String(c?.firstName ?? '').trim();
          const last = String(c?.lastName ?? '').trim();
          return [first, last].filter(Boolean).join(' ');
        })
        .filter((s: string) => s.length > 0);
    } catch (err) {
      debug('getCreators failed', err);
    }
  } catch (err) {
    debug('extractMeta failed', err);
  }
  return meta;
}

async function getPdfAttachments(item: any): Promise<any[]> {
  const out: any[] = [];
  try {
    if (item?.isAttachment?.() && item?.attachmentContentType === 'application/pdf') {
      out.push(item);
      return out;
    }
    let best: any = null;
    try {
      if (typeof item?.getBestAttachment === 'function') {
        best = await item.getBestAttachment();
      }
    } catch (err) {
      debug('getBestAttachment failed', err);
    }
    if (best && best.attachmentContentType === 'application/pdf') {
      out.push(best);
    }
    let attIDs: number[] = [];
    try {
      attIDs = item.getAttachments?.() ?? [];
    } catch (err) {
      debug('getAttachments failed', err);
    }
    for (const id of attIDs) {
      try {
        const att = Zotero.Items.get(id);
        if (att && att.attachmentContentType === 'application/pdf' && !out.includes(att)) {
          out.push(att);
        }
      } catch (err) {
        debug('Items.get(attachment) failed', err);
      }
    }
  } catch (err) {
    debug('getPdfAttachments failed', err);
  }
  return out;
}

export async function extractFullText(item: any): Promise<string | undefined> {
  try {
    const atts = await getPdfAttachments(item);
    for (const att of atts) {
      try {
        const attID = Number(att?.id ?? att?.itemID ?? 0);
        if (Zotero?.Fulltext?.getItemContent && attID) {
          const text = await Zotero.Fulltext.getItemContent(attID);
          if (text && String(text).trim().length > 0) {
            return String(text);
          }
        }
      } catch (err) {
        debug('Fulltext.getItemContent failed', err);
      }
      try {
        const cached = att?.attachmentText;
        if (cached && String(cached).trim().length > 0) {
          return String(cached);
        }
      } catch (err) {
        debug('attachmentText failed', err);
      }
    }
  } catch (err) {
    debug('extractFullText failed', err);
  }
  return undefined;
}

export async function extractAnnotations(item: any): Promise<Annotation[]> {
  const out: Annotation[] = [];
  try {
    const atts = await getPdfAttachments(item);
    for (const att of atts) {
      let anns: any[] = [];
      try {
        anns = att.getAnnotations?.() ?? [];
      } catch (err) {
        debug('getAnnotations failed', err);
        continue;
      }
      for (const ann of anns) {
        try {
          const t = String(ann?.annotationType ?? '').toLowerCase() as Annotation['type'];
          if (!ANNOTATION_TYPES.has(t)) continue;
          const a: Annotation = { type: t };
          const text = ann?.annotationText;
          if (text) a.text = String(text);
          const comment = ann?.annotationComment;
          if (comment) a.comment = String(comment);
          const pageLabel = ann?.annotationPageLabel;
          if (pageLabel != null && pageLabel !== '') a.pageLabel = String(pageLabel);
          const color = ann?.annotationColor;
          if (color) a.color = String(color);
          out.push(a);
        } catch (err) {
          debug('mapping annotation failed', err);
        }
      }
    }
  } catch (err) {
    debug('extractAnnotations failed', err);
  }
  return out;
}

export async function extractChildNotes(item: any): Promise<string[]> {
  const out: string[] = [];
  try {
    let noteIDs: number[] = [];
    try {
      noteIDs = item.getNotes?.() ?? [];
    } catch (err) {
      debug('getNotes failed', err);
      return out;
    }
    for (const id of noteIDs) {
      try {
        const note = Zotero.Items.get(id);
        const html = note?.getNote?.() ?? '';
        const text = stripHtml(String(html));
        if (text) out.push(text);
      } catch (err) {
        debug('reading note failed', err);
      }
    }
  } catch (err) {
    debug('extractChildNotes failed', err);
  }
  return out;
}

export async function extractFromItem(
  itemID: number,
  opts?: { includeFullText?: boolean }
): Promise<PaperContext> {
  const includeFullText = opts?.includeFullText === true;
  const ctx: PaperContext = {
    source: 'item',
    meta: {
      itemID: itemID,
      itemKey: '',
      title: '',
      authors: [],
    },
  };
  try {
    const item = Zotero.Items.get(itemID);
    if (!item) {
      debug(`Items.get(${itemID}) returned nothing`);
      return ctx;
    }
    ctx.meta = await extractMeta(item);
    const annotations = await extractAnnotations(item);
    if (annotations.length) ctx.annotations = annotations;
    const notes = await extractChildNotes(item);
    if (notes.length) ctx.childNotes = notes;
    if (includeFullText) {
      const ft = await extractFullText(item);
      if (ft) ctx.fullText = ft;
    }
  } catch (err) {
    debug('extractFromItem failed', err);
  }
  return ctx;
}

export async function extractFromReader(
  reader: any,
  opts?: { includeFullText?: boolean }
): Promise<PaperContext> {
  const includeFullText = opts?.includeFullText === true;
  let item: any = null;
  try {
    if (reader?._item) {
      item = reader._item;
    } else if (reader?.itemID) {
      item = Zotero.Items.get(reader.itemID);
    }
  } catch (err) {
    debug('reader item lookup failed', err);
  }

  let parentItem = item;
  try {
    if (item?.isAttachment?.() && typeof item.parentID === 'number') {
      const parent = Zotero.Items.get(item.parentID);
      if (parent) parentItem = parent;
    }
  } catch (err) {
    debug('reader parent lookup failed', err);
  }

  const meta: PaperMeta = parentItem
    ? await extractMeta(parentItem)
    : { itemID: 0, itemKey: '', title: '', authors: [] };

  let selectedText: string | undefined;
  try {
    if (typeof reader?.getSelectedText === 'function') {
      const s = await reader.getSelectedText();
      if (s && String(s).trim().length > 0) selectedText = String(s);
    }
  } catch (err) {
    debug('reader.getSelectedText failed', err);
  }

  let pageLabel: string | undefined;
  let pageText: string | undefined;
  try {
    const pageIndex = reader?.state?.primaryViewState?.pageIndex;
    const pdfApp = reader?._iframeWindow?.PDFViewerApplication;
    if (pdfApp?.pdfDocument && typeof pageIndex === 'number') {
      try {
        const page = await pdfApp.pdfDocument.getPage(pageIndex + 1);
        const labels = await pdfApp.pdfDocument.getPageLabels?.();
        if (labels && labels[pageIndex]) {
          pageLabel = String(labels[pageIndex]);
        } else {
          pageLabel = String(pageIndex + 1);
        }
        try {
          const tc = await page.getTextContent();
          const items = Array.isArray(tc?.items) ? tc.items : [];
          const text = items.map((it: any) => String(it?.str ?? '')).join(' ').trim();
          if (text) pageText = text;
        } catch (err) {
          debug('page.getTextContent failed', err);
        }
      } catch (err) {
        debug('pdfDocument.getPage failed', err);
      }
    }
  } catch (err) {
    debug('reader page lookup failed', err);
  }

  const ctx: PaperContext = {
    source: selectedText ? 'reader-selection' : 'reader-page',
    meta,
  };
  if (selectedText) ctx.selectedText = selectedText;
  if (pageText) ctx.pageText = pageText;
  if (pageLabel) ctx.pageLabel = pageLabel;

  if (parentItem) {
    try {
      const annotations = await extractAnnotations(parentItem);
      if (annotations.length) ctx.annotations = annotations;
    } catch (err) {
      debug('reader annotations failed', err);
    }
    try {
      const notes = await extractChildNotes(parentItem);
      if (notes.length) ctx.childNotes = notes;
    } catch (err) {
      debug('reader notes failed', err);
    }
    if (includeFullText) {
      try {
        const ft = await extractFullText(parentItem);
        if (ft) ctx.fullText = ft;
      } catch (err) {
        debug('reader fullText failed', err);
      }
    }
  }

  return ctx;
}

export async function extractFromCollection(
  collectionID: number,
  opts?: { maxItems?: number }
): Promise<PaperContext> {
  const max = Math.max(1, opts?.maxItems ?? 50);
  const ctx: PaperContext = {
    source: 'collection',
    meta: [],
  };
  try {
    const collection = Zotero.Collections?.get?.(collectionID);
    if (!collection) {
      debug(`Collections.get(${collectionID}) returned nothing`);
      return ctx;
    }
    try {
      const name = String(collection?.name ?? '');
      if (name) ctx.collectionName = name;
    } catch (err) {
      debug('collection.name failed', err);
    }
    let items: any[] = [];
    try {
      items = collection.getChildItems?.(false, false) ?? [];
    } catch (err) {
      debug('collection.getChildItems failed', err);
    }
    const metas: PaperMeta[] = [];
    for (const item of items.slice(0, max)) {
      try {
        if (item?.isAttachment?.() || item?.isNote?.()) continue;
        const m = await extractMeta(item);
        metas.push(m);
      } catch (err) {
        debug('collection item meta failed', err);
      }
    }
    ctx.meta = metas;
  } catch (err) {
    debug('extractFromCollection failed', err);
  }
  return ctx;
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max)) + '\n[...truncated]';
}

function metaLine(m: PaperMeta): string {
  const parts: string[] = [];
  parts.push(`Title: ${m.title || '(untitled)'}`);
  if (m.authors && m.authors.length) parts.push(`Authors: ${m.authors.join(', ')}`);
  if (m.year) parts.push(`Year: ${m.year}`);
  if (m.journal) parts.push(`Journal: ${m.journal}`);
  if (m.doi) parts.push(`DOI: ${m.doi}`);
  return parts.join(' | ');
}

export function formatContextForPrompt(ctx: PaperContext, budgetChars?: number): string {
  const budget = Math.max(1000, budgetChars ?? 80000);
  const out: string[] = [];

  if (ctx.source === 'collection') {
    const metas = Array.isArray(ctx.meta) ? ctx.meta : [];
    out.push(`[Collection] ${ctx.collectionName ?? '(unnamed)'} — ${metas.length} item(s)`);
    metas.forEach((m, i) => {
      out.push(`${i + 1}. ${metaLine(m)}`);
      if (m.abstract) {
        out.push(`   Abstract: ${truncate(m.abstract, 600)}`);
      }
    });
    return truncate(out.join('\n'), budget);
  }

  const m = Array.isArray(ctx.meta) ? ctx.meta[0] : ctx.meta;
  if (m) {
    out.push(`[Paper] ${metaLine(m)}`);
    if (m.abstract) {
      out.push('[Abstract]');
      out.push(m.abstract);
    }
  }

  if (ctx.selectedText) {
    out.push('[Selected text]');
    out.push(ctx.selectedText);
  }

  if (ctx.pageText) {
    const label = ctx.pageLabel ? ` (p.${ctx.pageLabel})` : '';
    out.push(`[Page text${label}]`);
    out.push(ctx.pageText);
  } else if (ctx.pageLabel) {
    out.push(`[Page] ${ctx.pageLabel}`);
  }

  if (ctx.annotations && ctx.annotations.length) {
    out.push('[Annotations]');
    for (const a of ctx.annotations) {
      const page = a.pageLabel ? `p.${a.pageLabel}: ` : '';
      const text = a.text ? `"${a.text.replace(/\s+/g, ' ').trim()}"` : `(${a.type})`;
      const comment = a.comment ? `  comment: ${a.comment.replace(/\s+/g, ' ').trim()}` : '';
      out.push(`- ${page}${text}${comment}`);
    }
  }

  if (ctx.childNotes && ctx.childNotes.length) {
    out.push('[Notes]');
    for (const n of ctx.childNotes) {
      out.push(n);
    }
  }

  if (ctx.fullText) {
    const ftBudget = Math.floor(budget / 2);
    out.push('[Full text]');
    out.push(truncate(ctx.fullText, ftBudget));
  }

  return truncate(out.join('\n\n'), budget);
}
