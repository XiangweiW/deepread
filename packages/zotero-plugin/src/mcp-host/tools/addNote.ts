import type { ToolDefinition } from '../types';
import { checkWriteAllowed, mdToHtml, DEEPREAD_TAG } from './_writeGuard';

export const addNoteTool: ToolDefinition = {
  name: 'add_note',
  description:
    'Add a child note to a Zotero item. Content can be markdown — paragraphs, bold, italic, code, fenced code blocks. Auto-tags the note with "deepread:mcp" so the user can audit/filter writes by this tool. Requires write operations to be enabled in Settings → DeepRead.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key (the parent item the note attaches to). Get from search_library or list_collections results.' },
      content: { type: 'string', description: 'Note body, markdown supported.' },
      title: { type: 'string', description: 'Optional title prepended as an H1.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to add to the note (the deepread:mcp tag is added automatically).' },
    },
    required: ['itemKey', 'content'],
  },
  handler: async (args) => {
    const guard = checkWriteAllowed();
    if (guard) return guard;
    try {
      const Z: any = (globalThis as any).Zotero;
      const itemKey = String(args.itemKey || '');
      const content = String(args.content || '');
      const title = args.title ? String(args.title) : '';
      const userTags = Array.isArray(args.tags) ? args.tags.map(String).filter(Boolean) : [];

      if (!itemKey || !content) {
        return { content: [{ type: 'text', text: 'Error: itemKey and content are required.' }], isError: true };
      }

      const libraryID = Z.Libraries.userLibraryID;
      let parent: any = Z.Items.getByLibraryAndKey?.(libraryID, itemKey);
      if (parent && typeof parent.then === 'function') parent = await parent;
      if (!parent) {
        return { content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }], isError: true };
      }

      const html = (title ? `<h1>${title.replace(/[<>&]/g, '')}</h1>\n` : '') + mdToHtml(content);

      const note = new Z.Item('note');
      note.libraryID = libraryID;
      note.parentItemID = parent.id;
      note.setNote(html);
      try { note.addTag(DEEPREAD_TAG); } catch {}
      for (const t of userTags) {
        try { note.addTag(t); } catch {}
      }
      await note.saveTx();

      return {
        content: [
          { type: 'json', json: { noteKey: note.key, noteID: note.id, parentItemKey: itemKey, tagsApplied: [DEEPREAD_TAG, ...userTags] } },
          { type: 'text', text: `Added child note ${note.key} to item ${itemKey}.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: 'Error adding note: ' + msg }], isError: true };
    }
  },
};
