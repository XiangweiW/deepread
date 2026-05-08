import type { ToolDefinition } from '../types';
import { checkWriteAllowed } from './_writeGuard';

export const addToCollectionTool: ToolDefinition = {
  name: 'add_to_collection',
  description:
    'Add a Zotero item to a collection. Item must already exist in the user\'s library; this tool does not import new items. Requires write operations to be enabled in Settings → DeepRead.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key.' },
      collectionID: { type: 'integer', description: 'Numeric collectionID (from list_collections.id).' },
    },
    required: ['itemKey', 'collectionID'],
  },
  handler: async (args) => {
    const guard = checkWriteAllowed();
    if (guard) return guard;
    try {
      const Z: any = (globalThis as any).Zotero;
      const itemKey = String(args.itemKey || '');
      const collectionID = Number(args.collectionID);

      if (!itemKey || !Number.isFinite(collectionID)) {
        return { content: [{ type: 'text', text: 'Error: itemKey and numeric collectionID required.' }], isError: true };
      }

      const libraryID = Z.Libraries.userLibraryID;
      let item: any = Z.Items.getByLibraryAndKey?.(libraryID, itemKey);
      if (item && typeof item.then === 'function') item = await item;
      if (!item) {
        return { content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }], isError: true };
      }
      const collection: any = Z.Collections.get?.(collectionID);
      if (!collection) {
        return { content: [{ type: 'text', text: `Error: collection ${collectionID} not found` }], isError: true };
      }

      let added = false;
      try {
        if (typeof collection.addItem === 'function') {
          added = await collection.addItem(item.id);
        } else if (typeof item.addToCollection === 'function') {
          added = item.addToCollection(collectionID);
          await item.saveTx();
        }
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error adding to collection: ' + (e instanceof Error ? e.message : String(e)) }], isError: true };
      }

      return {
        content: [
          { type: 'json', json: { itemKey, collectionID, collectionName: collection.name, added } },
          { type: 'text', text: `Added ${itemKey} to collection "${collection.name}".` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: 'Error: ' + msg }], isError: true };
    }
  },
};
