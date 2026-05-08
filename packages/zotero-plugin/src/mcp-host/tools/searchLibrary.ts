import type { ToolDefinition, ToolResult } from '../types';
import { extractMeta } from '../../context/extractor';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

async function runSearch(query: string): Promise<number[]> {
  const Z: any = (globalThis as any).Zotero;
  const libraryID = Z?.Libraries?.userLibraryID;
  const ids: number[] = [];
  const tryFields: Array<['title' | 'creator' | 'tag', 'contains' | 'is']> = [
    ['title', 'contains'],
    ['creator', 'contains'],
    ['tag', 'is'],
  ];
  for (const [field, op] of tryFields) {
    try {
      const s = new Z.Search();
      s.libraryID = libraryID;
      s.addCondition(field, op, query);
      const found = await s.search();
      if (Array.isArray(found)) {
        for (const id of found) {
          if (typeof id === 'number' && !ids.includes(id)) ids.push(id);
        }
      }
    } catch {
    }
  }
  return ids;
}

export const searchLibraryTool: ToolDefinition = {
  name: 'search_library',
  description:
    "Search the user's Zotero library by title, author, or tag. Returns matching items with metadata.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (matched against title, creator, tag).' },
      limit: {
        type: 'number',
        description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
      },
    },
    required: ['query'],
  },
  handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      };
    }
    const limit = clampLimit(args.limit);
    try {
      const Z: any = (globalThis as any).Zotero;
      const ids = await runSearch(query);
      const items: Array<Record<string, unknown>> = [];
      for (const id of ids.slice(0, limit)) {
        try {
          const item = Z?.Items?.get?.(id);
          if (!item) continue;
          if (item.isAttachment?.() || item.isNote?.()) continue;
          const meta = await extractMeta(item);
          items.push({
            itemKey: meta.itemKey,
            title: meta.title,
            authors: meta.authors,
            year: meta.year,
            journal: meta.journal,
            doi: meta.doi,
            abstract: meta.abstract,
          });
        } catch {
        }
      }
      return {
        content: [
          {
            type: 'json',
            json: { items, count: items.length },
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
