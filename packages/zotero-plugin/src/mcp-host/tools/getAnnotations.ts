import type { ToolDefinition, ToolResult } from '../types';
import { extractAnnotations } from '../../context/extractor';

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

export const getAnnotationsTool: ToolDefinition = {
  name: 'get_annotations',
  description: 'Get all user annotations (highlights, notes) on a paper, with page labels and colors.',
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
      const annotations = await extractAnnotations(item);
      return {
        content: [
          {
            type: 'json',
            json: {
              annotations: annotations.map((a) => ({
                type: a.type,
                text: a.text,
                comment: a.comment,
                pageLabel: a.pageLabel,
                color: a.color,
              })),
              count: annotations.length,
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
