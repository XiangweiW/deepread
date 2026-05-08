import { chunkText, embedTexts, DEFAULT_RAG_EMBEDDING_MODEL } from '@deepread/shared';
import type {
  BuildIndexOptions,
  EmbeddedChunk,
  IndexProgressCallback,
  IndexRecord,
} from '@deepread/shared';
import { extractFullText, extractMeta } from '../context/extractor';
import { Prefs } from '../prefs/manager';
import { loadIndex, saveIndex } from './store';

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:rag/indexer] ${msg}${detail ? ' :: ' + detail : ''}`, 3);
  } catch {
  }
}

function getCollectionItems(collectionID: number): { collectionName: string; items: any[] } {
  const out: { collectionName: string; items: any[] } = { collectionName: '', items: [] };
  try {
    const collection = Zotero.Collections?.get?.(collectionID);
    if (!collection) return out;
    out.collectionName = String(collection?.name ?? '');
    let items: any[] = [];
    try {
      items = collection.getChildItems?.(false, false) ?? [];
    } catch (err) {
      debug('getChildItems failed', err);
    }
    out.items = items.filter((it) => {
      try {
        if (it?.isAttachment?.()) return false;
        if (it?.isNote?.()) return false;
        return true;
      } catch {
        return false;
      }
    });
  } catch (err) {
    debug('getCollectionItems failed', err);
  }
  return out;
}

function getDateModified(item: any): string {
  try {
    const v = item?.dateModified || item?.getField?.('dateModified');
    if (v) return String(v);
  } catch {
  }
  return '';
}

function chunkKey(itemKey: string, index: number): string {
  return `${itemKey}#${index}`;
}

export async function buildOrUpdateIndex(
  collectionID: number,
  opts?: BuildIndexOptions,
  progress?: IndexProgressCallback,
): Promise<IndexRecord> {
  const startedAt = Date.now();
  const apiKey = opts?.apiKey ?? Prefs.getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set it in DeepRead preferences.');
  }
  const embeddingModel = opts?.embeddingModel ?? DEFAULT_RAG_EMBEDDING_MODEL;
  const force = !!opts?.force;

  const { collectionName, items } = getCollectionItems(collectionID);

  let existing = force ? null : await loadIndex(collectionID);
  if (existing && existing.embeddingModel !== embeddingModel) {
    existing = null;
  }

  const existingByKey = new Map<string, EmbeddedChunk>();
  if (existing) {
    for (const c of existing.chunks) {
      existingByKey.set(c.id, c);
    }
  }

  progress?.({ kind: 'start', totalItems: items.length });

  const finalChunks: EmbeddedChunk[] = [];
  let embeddingDim = existing?.embeddingDim ?? 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let title = '';
    let itemKey = '';
    let itemID = 0;
    let dateModified = '';
    try {
      const meta = await extractMeta(item);
      title = meta.title || '(untitled)';
      itemKey = meta.itemKey;
      itemID = meta.itemID;
    } catch (err) {
      debug('extractMeta failed', err);
    }
    if (!itemKey) {
      progress?.({ kind: 'item-skipped', itemIndex: i, totalItems: items.length, title, reason: 'missing item key' });
      continue;
    }
    dateModified = getDateModified(item);

    let fullText: string | undefined;
    try {
      fullText = await extractFullText(item);
    } catch (err) {
      debug('extractFullText failed', err);
    }

    if (!fullText || fullText.trim().length < 200) {
      try {
        const attachmentIDs: number[] = (item.getAttachments?.() ?? []) as number[];
        const pdfIDs: number[] = [];
        for (const aid of attachmentIDs) {
          try {
            const att: any = Zotero.Items.get(aid);
            if (att?.attachmentContentType === 'application/pdf') pdfIDs.push(Number(aid));
          } catch {
          }
        }
        if (pdfIDs.length > 0 && Zotero?.Fulltext?.indexItems) {
          debug(`triggering full-text index for ${title} (${pdfIDs.length} PDF attachments)`);
          await Zotero.Fulltext.indexItems(pdfIDs, true);
          fullText = await extractFullText(item);
        }
      } catch (err) {
        debug('fulltext indexItems failed', err);
      }
    }

    if (!fullText || fullText.trim().length < 200) {
      try {
        const meta = await extractMeta(item);
        const parts = [
          meta.title ? `Title: ${meta.title}` : '',
          meta.authors && meta.authors.length > 0 ? `Authors: ${meta.authors.join(', ')}` : '',
          meta.year ? `Year: ${meta.year}` : '',
          meta.journal ? `Venue: ${meta.journal}` : '',
          meta.abstract ? `Abstract: ${meta.abstract}` : '',
        ].filter(Boolean);
        const fallback = parts.join('\n\n');
        if (fallback.trim().length >= 50) {
          fullText = fallback;
          debug(`using metadata fallback for ${title} (${fallback.length} chars)`);
        }
      } catch (err) {
        debug('metadata fallback failed', err);
      }
    }

    if (!fullText || fullText.trim().length < 50) {
      progress?.({ kind: 'item-skipped', itemIndex: i, totalItems: items.length, title, reason: 'no full text or metadata' });
      continue;
    }

    const textChunks = chunkText(fullText, {
      chunkSize: opts?.chunkSize,
      chunkOverlap: opts?.chunkOverlap,
    });
    if (textChunks.length === 0) {
      progress?.({ kind: 'item-skipped', itemIndex: i, totalItems: items.length, title, reason: 'no chunks' });
      continue;
    }

    const reused: EmbeddedChunk[] = [];
    const toEmbedTexts: string[] = [];
    const toEmbedMeta: { id: string; index: number; text: string; charStart: number; charEnd: number }[] = [];

    for (let ci = 0; ci < textChunks.length; ci++) {
      const c = textChunks[ci];
      const id = chunkKey(itemKey, ci);
      const prev = existingByKey.get(id);
      if (
        prev &&
        prev.dateModified === dateModified &&
        prev.text === c.text &&
        prev.embeddingModel === embeddingModel &&
        Array.isArray(prev.embedding) &&
        prev.embedding.length > 0
      ) {
        reused.push(prev);
      } else {
        toEmbedTexts.push(c.text);
        toEmbedMeta.push({ id, index: ci, text: c.text, charStart: c.charStart, charEnd: c.charEnd });
      }
    }

    let newlyEmbedded: EmbeddedChunk[] = [];
    if (toEmbedTexts.length > 0) {
      try {
        const vectors = await embedTexts(toEmbedTexts, apiKey, embeddingModel);
        newlyEmbedded = toEmbedMeta.map((m, idx) => {
          const vec = vectors[idx] || [];
          if (vec.length > 0 && embeddingDim === 0) embeddingDim = vec.length;
          return {
            id: m.id,
            itemKey,
            itemID,
            title,
            index: m.index,
            text: m.text,
            charStart: m.charStart,
            charEnd: m.charEnd,
            embedding: vec,
            dateModified,
            embeddingModel,
          };
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        progress?.({ kind: 'error', message: `embedding failed for "${title}": ${msg}` });
        debug(`embedTexts failed for ${title}`, err);
        continue;
      }
    }

    const merged = [...reused, ...newlyEmbedded].sort((a, b) => a.index - b.index);
    finalChunks.push(...merged);

    progress?.({
      kind: 'item',
      itemIndex: i,
      totalItems: items.length,
      title,
      chunksEmbedded: newlyEmbedded.length,
      chunksReused: reused.length,
    });
  }

  const record: IndexRecord = {
    version: 1,
    collectionID,
    collectionName,
    embeddingModel,
    embeddingDim,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chunks: finalChunks,
  };

  try {
    await saveIndex(record);
  } catch (err) {
    debug('saveIndex failed', err);
  }

  progress?.({
    kind: 'done',
    totalItems: items.length,
    totalChunks: finalChunks.length,
    durationMs: Date.now() - startedAt,
  });

  return record;
}
