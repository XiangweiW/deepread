import type { ToolDefinition, ToolResult } from '../types';
import { extractMeta, extractAnnotations, extractChildNotes } from '../../context/extractor';

function getItemByKey(itemKey: string): any {
  const Z: any = (globalThis as any).Zotero;
  const libraryID = Z?.Libraries?.userLibraryID;
  try {
    if (typeof Z?.Items?.getByLibraryAndKey === 'function') {
      return Z.Items.getByLibraryAndKey(libraryID, itemKey);
    }
  } catch {
  }
  try {
    if (typeof Z?.Items?.getByLibraryAndKeyAsync === 'function') {
      return Z.Items.getByLibraryAndKeyAsync(libraryID, itemKey);
    }
  } catch {
  }
  return null;
}

function getTags(item: any): string[] {
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

function summarizeAnnotations(anns: Array<{ type: string; text?: string; comment?: string }>): {
  total: number;
  byType: Record<string, number>;
  sample: Array<{ type: string; text?: string; comment?: string }>;
} {
  const byType: Record<string, number> = {};
  for (const a of anns) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }
  const sample = anns.slice(0, 5).map((a) => {
    const out: { type: string; text?: string; comment?: string } = { type: a.type };
    if (a.text) out.text = a.text.length > 240 ? a.text.slice(0, 240) + '...' : a.text;
    if (a.comment) out.comment = a.comment;
    return out;
  });
  return { total: anns.length, byType, sample };
}

export const getItemTool: ToolDefinition = {
  name: 'get_item',
  description:
    'Get full metadata for a Zotero item by its item key. Includes title, authors, year, journal, DOI, abstract, tags, child notes (text only), and a brief annotation summary.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key.' },
    },
    required: ['itemKey'],
  },
  handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
    const itemKey = typeof args.itemKey === 'string' ? args.itemKey.trim() : '';
    if (!itemKey) {
      return {
        content: [{ type: 'text', text: 'Error: itemKey is required' }],
        isError: true,
      };
    }
    try {
      let item = getItemByKey(itemKey);
      if (item && typeof item.then === 'function') {
        item = await item;
      }
      if (!item) {
        return {
          content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }],
          isError: true,
        };
      }
      const meta = await extractMeta(item);
      const annotations = await extractAnnotations(item);
      const childNotes = await extractChildNotes(item);
      const tags = getTags(item);
      const annSummary = summarizeAnnotations(annotations);
      return {
        content: [
          {
            type: 'json',
            json: {
              itemKey: meta.itemKey,
              title: meta.title,
              authors: meta.authors,
              year: meta.year,
              journal: meta.journal,
              doi: meta.doi,
              abstract: meta.abstract,
              tags,
              childNotes,
              annotations: annSummary,
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
