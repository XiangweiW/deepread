import type { ToolDefinition } from '../types';
import { checkWriteAllowed, DEEPREAD_TAG } from './_writeGuard';

export const addTagTool: ToolDefinition = {
  name: 'add_tag',
  description:
    'Add one or more tags to a Zotero item. Always also adds "deepread:mcp" so the user can audit/filter MCP writes. Requires write operations to be enabled in Settings → DeepRead.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags to add (duplicates ignored by Zotero).' },
    },
    required: ['itemKey', 'tags'],
  },
  handler: async (args) => {
    const guard = checkWriteAllowed();
    if (guard) return guard;
    try {
      const Z: any = (globalThis as any).Zotero;
      const itemKey = String(args.itemKey || '');
      const tags = Array.isArray(args.tags) ? args.tags.map(String).filter(Boolean) : [];

      if (!itemKey || tags.length === 0) {
        return { content: [{ type: 'text', text: 'Error: itemKey and a non-empty tags array are required.' }], isError: true };
      }

      const libraryID = Z.Libraries.userLibraryID;
      let item: any = Z.Items.getByLibraryAndKey?.(libraryID, itemKey);
      if (item && typeof item.then === 'function') item = await item;
      if (!item) {
        return { content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }], isError: true };
      }

      const all = [DEEPREAD_TAG, ...tags];
      const added: string[] = [];
      for (const t of all) {
        try {
          if (item.addTag(t)) added.push(t);
        } catch {}
      }
      await item.saveTx();

      return {
        content: [
          { type: 'json', json: { itemKey, requested: all, added } },
          { type: 'text', text: `Added ${added.length} tag(s) to ${itemKey}: ${added.join(', ')}` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: 'Error adding tags: ' + msg }], isError: true };
    }
  },
};
