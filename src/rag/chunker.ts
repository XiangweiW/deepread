import type { ChunkOptions } from './types';

const DEFAULT_CHUNK_SIZE_TOKENS = 500;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 100;
const CHARS_PER_TOKEN = 4;

export type TextChunk = {
  text: string;
  charStart: number;
  charEnd: number;
};

function normalizeWhitespace(text: string): string {
  let out = text.replace(/\r\n/g, '\n');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function splitParagraphs(text: string): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  const re = /\n{2,}/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const piece = text.slice(lastIdx, m.index);
    if (piece.trim().length > 0) out.push({ text: piece, offset: lastIdx });
    lastIdx = m.index + m[0].length;
  }
  const tail = text.slice(lastIdx);
  if (tail.trim().length > 0) out.push({ text: tail, offset: lastIdx });
  if (out.length === 0 && text.length > 0) out.push({ text, offset: 0 });
  return out;
}

function hardSplit(text: string, offset: number, maxChars: number): { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + maxChars);
    out.push({ text: text.slice(i, end), offset: offset + i });
    i = end;
  }
  return out;
}

export function chunkText(rawText: string, opts?: ChunkOptions): TextChunk[] {
  const text = normalizeWhitespace(rawText || '');
  if (!text || text.trim().length === 0) return [];

  const chunkTokens = Math.max(50, opts?.chunkSize ?? DEFAULT_CHUNK_SIZE_TOKENS);
  const overlapTokens = Math.max(0, Math.min(chunkTokens - 1, opts?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP_TOKENS));
  const chunkChars = chunkTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;

  const paragraphs = splitParagraphs(text).flatMap((p) =>
    p.text.length > chunkChars * 2 ? hardSplit(p.text, p.offset, chunkChars) : [p],
  );

  const chunks: TextChunk[] = [];
  let bufText = '';
  let bufStart = -1;

  for (const para of paragraphs) {
    const candidate = bufText.length === 0 ? para.text : bufText + '\n\n' + para.text;
    if (candidate.length > chunkChars && bufText.length > 0) {
      const start = bufStart >= 0 ? bufStart : 0;
      const end = start + bufText.length;
      chunks.push({ text: bufText.trim(), charStart: start, charEnd: end });
      if (overlapChars > 0 && bufText.length > overlapChars) {
        const tail = bufText.slice(bufText.length - overlapChars);
        bufText = tail + '\n\n' + para.text;
        bufStart = end - tail.length;
      } else {
        bufText = para.text;
        bufStart = para.offset;
      }
    } else {
      if (bufText.length === 0) {
        bufStart = para.offset;
      }
      bufText = candidate;
    }

    while (bufText.length > chunkChars) {
      const start = bufStart >= 0 ? bufStart : 0;
      const cut = bufText.slice(0, chunkChars);
      chunks.push({ text: cut.trim(), charStart: start, charEnd: start + cut.length });
      const overlap = overlapChars > 0 ? cut.slice(cut.length - overlapChars) : '';
      bufText = overlap + bufText.slice(chunkChars);
      bufStart = start + chunkChars - overlap.length;
    }
  }

  if (bufText.trim().length > 0) {
    const charStart = bufStart >= 0 ? bufStart : 0;
    const charEnd = charStart + bufText.length;
    chunks.push({ text: bufText.trim(), charStart, charEnd });
  }

  return chunks.filter((c) => c.text.length > 20);
}
