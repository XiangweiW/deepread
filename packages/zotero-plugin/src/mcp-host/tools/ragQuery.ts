import type { ToolDefinition, ToolResult } from '../types';
import { getCollectionRagContext } from '../../rag/service';

const DEFAULT_TOPK = 8;
const MAX_TOPK = 20;

function clampTopK(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_TOPK;
  if (n < 1) return 1;
  if (n > MAX_TOPK) return MAX_TOPK;
  return n;
}

type RagHit = {
  itemKey: string;
  title: string;
  excerpt: string;
  score?: number;
};

function parseExcerpts(formatted: string | undefined, metas: Array<{ itemKey: string; title: string }>): RagHit[] {
  if (!formatted) return [];
  const blocks = formatted.split(/\n{2,}/);
  const hits: RagHit[] = [];
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const headerMatch = trimmed.match(/^\[(?:[^\]]+)\]\s*(.+?)(?:\n|$)([\s\S]*)$/);
    if (headerMatch) {
      const title = headerMatch[1].trim();
      const excerpt = headerMatch[2].trim() || headerMatch[1].trim();
      const meta = metas.find((m) => m.title === title);
      hits.push({
        itemKey: meta?.itemKey ?? '',
        title,
        excerpt,
      });
    } else {
      hits.push({ itemKey: '', title: '', excerpt: trimmed });
    }
  }
  return hits;
}

export const ragQueryTool: ToolDefinition = {
  name: 'rag_query',
  description:
    'Run retrieval-augmented question answering across a Zotero collection. Returns top-K relevant excerpts. The MCP client (model) should synthesize the final answer from these excerpts.',
  inputSchema: {
    type: 'object',
    properties: {
      collectionID: { type: 'number', description: 'Numeric Zotero collection ID.' },
      query: { type: 'string', description: 'Natural-language question to retrieve evidence for.' },
      topK: {
        type: 'number',
        description: `Number of top excerpts to return (default ${DEFAULT_TOPK}, max ${MAX_TOPK}).`,
      },
    },
    required: ['collectionID', 'query'],
  },
  handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const collectionID =
      typeof args.collectionID === 'number' && Number.isFinite(args.collectionID)
        ? Math.floor(args.collectionID)
        : NaN;
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!Number.isFinite(collectionID)) {
      return {
        content: [{ type: 'text', text: 'Error: collectionID is required and must be a number' }],
        isError: true,
      };
    }
    if (!query) {
      return {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      };
    }
    const topK = clampTopK(args.topK);
    try {
      const ctx = await getCollectionRagContext(collectionID, query, { topK, buildIfMissing: true });
      const metas = Array.isArray(ctx.meta) ? ctx.meta : ctx.meta ? [ctx.meta] : [];
      const metaList = metas.map((m) => ({ itemKey: m.itemKey, title: m.title }));
      const hits = parseExcerpts(ctx.fullText, metaList);
      if (hits.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text:
                'No relevant excerpts found. The collection may be empty or its index may not yet be built.',
            },
            {
              type: 'json',
              json: { collectionName: ctx.collectionName ?? null, hits: [] },
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'json',
            json: {
              collectionName: ctx.collectionName ?? null,
              hits,
            },
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      };
    }
  },
};
