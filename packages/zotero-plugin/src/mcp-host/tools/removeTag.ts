import type { ToolDefinition } from '../types';
import { checkWriteAllowed } from './_writeGuard';

export const removeTagTool: ToolDefinition = {
  name: 'remove_tag',
  description:
    'Remove one or more tags from a Zotero item. Will not remove the "deepread:mcp" audit tag — that protects the user from a model erasing its own audit trail. Requires write operations to be enabled in Settings → DeepRead.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags to remove (silently ignored if not present).' },
    },
    required: ['itemKey', 'tags'],
  },
  handler: async (args) => {
    const guard = checkWriteAllowed();
    if (guard) return guard;
    try {
      const Z: any = (globalThis as any).Zotero;
      const itemKey = String(args.itemKey || '');
      const tags = Array.isArray(args.tags) ? args.tags.map(String).filter((t) => t && t !== 'deepread:mcp') : [];

      if (!itemKey || tags.length === 0) {
        return { content: [{ type: 'text', text: 'Error: itemKey and tags required (deepread:mcp cannot be removed via MCP).' }], isError: true };
      }

      const libraryID = Z.Libraries.userLibraryID;
      let item: any = Z.Items.getByLibraryAndKey?.(libraryID, itemKey);
      if (item && typeof item.then === 'function') item = await item;
      if (!item) {
        return { content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }], isError: true };
      }

      const removed: string[] = [];
      for (const t of tags) {
        try {
          if (item.removeTag(t)) removed.push(t);
        } catch {}
      }
      await item.saveTx();

      return {
        content: [
          { type: 'json', json: { itemKey, requested: tags, removed } },
          { type: 'text', text: `Removed ${removed.length} tag(s) from ${itemKey}: ${removed.join(', ')}` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: 'Error removing tags: ' + msg }], isError: true };
    }
  },
};
