import type { PaperContext, PaperMeta, IndexRecord, RetrievalResult } from '@deepread/shared';
import {
  embedQuery,
  DEFAULT_RAG_EMBEDDING_MODEL,
  formatRetrievedExcerpts,
  retrieve,
} from '@deepread/shared';
import { Prefs } from '../prefs/manager';
import { buildOrUpdateIndex } from './indexer';
import { loadIndex } from './store';

export type CollectionRagContextOptions = {
  topK?: number;
  embeddingModel?: string;
  apiKey?: string;
  buildIfMissing?: boolean;
};

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:rag/service] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function uniqueMetas(record: IndexRecord, hits: RetrievalResult['hits']): PaperMeta[] {
  const seen = new Set<string>();
  const metas: PaperMeta[] = [];
  for (const h of hits) {
    const key = h.chunk.itemKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    metas.push({
      itemID: h.chunk.itemID,
      itemKey: h.chunk.itemKey,
      title: h.chunk.title,
      authors: [],
    });
  }
  if (metas.length === 0) {
    const seen2 = new Set<string>();
    for (const c of record.chunks) {
      if (seen2.has(c.itemKey)) continue;
      seen2.add(c.itemKey);
      metas.push({ itemID: c.itemID, itemKey: c.itemKey, title: c.title, authors: [] });
      if (metas.length >= 8) break;
    }
  }
  return metas;
}

export async function getCollectionRagContext(
  collectionID: number,
  query: string,
  opts?: CollectionRagContextOptions,
): Promise<PaperContext> {
  const apiKey = opts?.apiKey ?? Prefs.getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured. Set it in DeepRead preferences.');
  }
  const embeddingModel = opts?.embeddingModel ?? DEFAULT_RAG_EMBEDDING_MODEL;
  const topK = Math.max(1, opts?.topK ?? 8);

  let record = await loadIndex(collectionID);
  const needBuild = !record || record.chunks.length === 0;
  if (needBuild && opts?.buildIfMissing !== false) {
    debug(`index missing or empty for collection ${collectionID}, building`);
    record = await buildOrUpdateIndex(collectionID, { embeddingModel, apiKey });
  }

  if (!record || record.chunks.length === 0) {
    return {
      source: 'collection',
      meta: [],
      collectionName: record?.collectionName,
    };
  }

  let queryVec: number[] = [];
  try {
    queryVec = await embedQuery(query, apiKey, embeddingModel);
  } catch (err) {
    debug('embedQuery failed', err);
    throw err;
  }

  const result = retrieve(record, queryVec, topK, query);
  const metas = uniqueMetas(record, result.hits);
  const excerpts = formatRetrievedExcerpts(result.hits);

  const ctx: PaperContext = {
    source: 'collection',
    meta: metas,
    collectionName: record.collectionName,
    fullText: excerpts,
  };
  return ctx;
}

export async function ensureIndex(
  collectionID: number,
  opts?: CollectionRagContextOptions,
): Promise<IndexRecord> {
  const existing = await loadIndex(collectionID);
  if (existing) return existing;
  const apiKey = opts?.apiKey ?? Prefs.getGeminiApiKey();
  return buildOrUpdateIndex(collectionID, {
    apiKey,
    embeddingModel: opts?.embeddingModel ?? DEFAULT_RAG_EMBEDDING_MODEL,
  });
}
