import type { EmbeddedChunk, IndexRecord, RetrievalResult, RetrievedChunk } from './types';

function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosineSim(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function retrieve(
  record: IndexRecord,
  queryEmbedding: number[],
  k: number = 8,
  query: string = '',
): RetrievalResult {
  const hits: RetrievedChunk[] = [];
  if (!record || !Array.isArray(record.chunks) || record.chunks.length === 0) {
    return { query, hits: [] };
  }
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
    return { query, hits: [] };
  }

  const queryNorm = norm(queryEmbedding);
  if (queryNorm === 0) return { query, hits: [] };

  const scored: RetrievedChunk[] = [];
  for (const chunk of record.chunks) {
    if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) continue;
    const score = cosineSim(queryEmbedding, chunk.embedding);
    scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  hits.push(...scored.slice(0, Math.max(1, k)));

  return { query, hits };
}

export function formatRetrievedExcerpts(hits: RetrievedChunk[], maxCharsPerExcerpt = 1200): string {
  const out: string[] = [];
  hits.forEach((h, i) => {
    const c: EmbeddedChunk = h.chunk;
    const score = h.score.toFixed(3);
    const header = `[${i + 1}] (score=${score}) ${c.title} — itemKey=${c.itemKey} chunk=${c.index}`;
    const body = c.text.length > maxCharsPerExcerpt ? c.text.slice(0, maxCharsPerExcerpt) + '\n[...]' : c.text;
    out.push(header + '\n' + body);
  });
  return out.join('\n\n');
}
