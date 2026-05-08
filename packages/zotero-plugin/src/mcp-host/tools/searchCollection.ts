import type { ToolDefinition, ToolResult } from '../types';
import { extractMeta } from '../../context/extractor';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

function getCollection(collectionID: number): any {
  const Z: any = (globalThis as any).Zotero;
  try {
    if (typeof Z?.Collections?.get === 'function') {
      return Z.Collections.get(collectionID);
    }
  } catch {
  }
  return null;
}

function getTagStrings(item: any): string[] {
  try {
    const tags = item?.getTags?.() ?? [];
    if (!Array.isArray(tags)) return [];
    return tags
      .map((t: any) => String(t?.tag ?? t?.name ?? ''))
      .filter((s: string) => s.length > 0);
  } catch {
    return [];
  }
}

function matchesQuery(item: any, q: string): boolean {
  const needle = q.toLowerCase();
  try {
    const title = String(item?.getField?.('title') ?? '').toLowerCase();
    if (title.includes(needle)) return true;
    const abstract = String(item?.getField?.('abstractNote') ?? '').toLowerCase();
    if (abstract.includes(needle)) return true;
    const creators = item?.getCreators?.() ?? [];
    for (const c of creators) {
      const name = `${String(c?.firstName ?? '')} ${String(c?.lastName ?? '')}`.toLowerCase();
      if (name.includes(needle)) return true;
    }
    const tags = getTagStrings(item);
    for (const t of tags) {
      if (t.toLowerCase().includes(needle)) return true;
    }
  } catch {
  }
  return false;
}

export const searchCollectionTool: ToolDefinition = {
  name: 'search_collection',
  description:
    'Search items within a specific collection by query (substring match across title, creators, abstract, and tags).',
  inputSchema: {
    type: 'object',
    properties: {
      collectionID: { type: 'number', description: 'Numeric Zotero collection ID.' },
      query: { type: 'string', description: 'Search query.' },
      limit: {
        type: 'number',
        description: `Maximum results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
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
    const limit = clampLimit(args.limit);
    try {
      const collection = getCollection(collectionID);
      if (!collection) {
        return {
          content: [{ type: 'text', text: `Error: collection not found for id ${collectionID}` }],
          isError: true,
        };
      }
      let kids: any[] = [];
      try {
        kids = collection.getChildItems?.(false, false) ?? [];
      } catch {
      }
      if (!Array.isArray(kids)) kids = [];
      const items: Array<Record<string, unknown>> = [];
      for (const item of kids) {
        if (items.length >= limit) break;
        try {
          if (item?.isAttachment?.() || item?.isNote?.()) continue;
          if (!matchesQuery(item, query)) continue;
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
            json: { items, count: items.length, collectionID },
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
