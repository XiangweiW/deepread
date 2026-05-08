import type { ToolDefinition, ToolResult } from '../types';
import { extractFullText } from '../../context/extractor';

const DEFAULT_MAX_CHARS = 50000;

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

async function collectPdfAttachmentIDs(item: any): Promise<number[]> {
  const Z: any = (globalThis as any).Zotero;
  const ids: number[] = [];
  try {
    if (item?.isAttachment?.() && item?.attachmentContentType === 'application/pdf') {
      const id = Number(item?.id ?? item?.itemID ?? 0);
      if (id) ids.push(id);
      return ids;
    }
    let attIDs: number[] = [];
    try {
      attIDs = item?.getAttachments?.() ?? [];
    } catch {
    }
    for (const id of attIDs) {
      try {
        const att = Z?.Items?.get?.(id);
        if (att && att.attachmentContentType === 'application/pdf') {
          if (!ids.includes(id)) ids.push(id);
        }
      } catch {
      }
    }
  } catch {
  }
  return ids;
}

export const getItemFullTextTool: ToolDefinition = {
  name: 'get_item_fulltext',
  description:
    'Get the extracted PDF full text for a Zotero item. Triggers indexing if not already indexed. Returns text content (potentially long).',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key.' },
      maxChars: {
        type: 'number',
        description: `Maximum characters to return (default ${DEFAULT_MAX_CHARS}). Output is truncated if longer.`,
      },
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
    const maxCharsRaw =
      typeof args.maxChars === 'number' && Number.isFinite(args.maxChars)
        ? Math.floor(args.maxChars)
        : DEFAULT_MAX_CHARS;
    const maxChars = maxCharsRaw < 200 ? 200 : maxCharsRaw;
    try {
      const Z: any = (globalThis as any).Zotero;
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
      let text = await extractFullText(item);
      if (!text || text.length < 200) {
        const pdfIds = await collectPdfAttachmentIDs(item);
        if (pdfIds.length > 0) {
          try {
            if (typeof Z?.Fulltext?.indexItems === 'function') {
              await Z.Fulltext.indexItems(pdfIds, true);
            }
          } catch {
          }
          text = await extractFullText(item);
        }
      }
      if (!text) {
        return {
          content: [
            { type: 'text', text: 'No full text available for this item.' },
            { type: 'json', json: { truncated: false, length: 0 } },
          ],
        };
      }
      const fullLength = text.length;
      let truncated = false;
      let out = text;
      if (out.length > maxChars) {
        out = out.slice(0, maxChars);
        truncated = true;
      }
      return {
        content: [
          { type: 'text', text: out },
          { type: 'json', json: { truncated, length: out.length, originalLength: fullLength } },
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
