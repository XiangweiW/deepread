import type { ToolDefinition, ToolResult } from '../types';

type CollectionInfo = {
  id: number;
  key: string;
  name: string;
  parentID?: number;
  depth: number;
  itemCount: number;
};

function getItemCount(collection: any): number {
  try {
    let kids = collection?.getChildItems?.(false, true);
    if (Array.isArray(kids)) return kids.length;
    kids = collection?.getChildItems?.(false, false);
    if (Array.isArray(kids)) return kids.length;
    kids = collection?.getChildItems?.();
    if (Array.isArray(kids)) return kids.length;
  } catch {
  }
  return 0;
}

function computeDepth(coll: any, byID: Map<number, any>, cache: Map<number, number>): number {
  const id = Number(coll?.id ?? coll?.collectionID ?? 0);
  if (!id) return 0;
  if (cache.has(id)) return cache.get(id)!;
  const parentID = typeof coll?.parentID === 'number' ? coll.parentID : undefined;
  if (!parentID) {
    cache.set(id, 0);
    return 0;
  }
  const parent = byID.get(parentID);
  if (!parent) {
    cache.set(id, 0);
    return 0;
  }
  const d = computeDepth(parent, byID, cache) + 1;
  cache.set(id, d);
  return d;
}

export const listCollectionsTool: ToolDefinition = {
  name: 'list_collections',
  description:
    "List all collections in the user's Zotero library, with their IDs, names, parents, and item counts.",
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const Z: any = (globalThis as any).Zotero;
      const libraryID = Z?.Libraries?.userLibraryID;
      let collections: any[] = [];
      try {
        if (typeof Z?.Collections?.getByLibrary === 'function') {
          const r = Z.Collections.getByLibrary(libraryID);
          collections = Array.isArray(r) ? r : await r;
        }
      } catch {
      }
      if (!Array.isArray(collections)) collections = [];
      const byID = new Map<number, any>();
      for (const c of collections) {
        const id = Number(c?.id ?? c?.collectionID ?? 0);
        if (id) byID.set(id, c);
      }
      const depthCache = new Map<number, number>();
      const out: CollectionInfo[] = [];
      for (const c of collections) {
        try {
          const id = Number(c?.id ?? c?.collectionID ?? 0);
          const key = String(c?.key ?? '');
          const name = String(c?.name ?? '');
          const parentID = typeof c?.parentID === 'number' ? c.parentID : undefined;
          const depth = computeDepth(c, byID, depthCache);
          const itemCount = getItemCount(c);
          const info: CollectionInfo = { id, key, name, depth, itemCount };
          if (parentID) info.parentID = parentID;
          out.push(info);
        } catch {
        }
      }
      out.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name);
      });
      return {
        content: [
          {
            type: 'json',
            json: { collections: out, count: out.length },
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
