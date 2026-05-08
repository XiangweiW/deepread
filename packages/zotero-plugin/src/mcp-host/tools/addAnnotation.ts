import type { ToolDefinition } from '../types';
import { checkWriteAllowed, DEEPREAD_TAG } from './_writeGuard';

export const addAnnotationTool: ToolDefinition = {
  name: 'add_annotation',
  description:
    'Add a sticky-note annotation (free-floating comment, no highlight position) to the first PDF attachment of a Zotero item. Use this to attach AI-generated insights to a specific paper. For highlighting a specific passage, the user must do it manually (we can\'t infer page coordinates from text). Auto-tags annotations with "deepread:mcp". Requires write operations to be enabled in Settings → DeepRead.',
  inputSchema: {
    type: 'object',
    properties: {
      itemKey: { type: 'string', description: 'Zotero item key (the regular item, not the PDF attachment). The first PDF attachment is used.' },
      comment: { type: 'string', description: 'The annotation text (markdown not supported by Zotero annotations — use plain text).' },
      pageLabel: { type: 'string', description: 'Optional page label like "5" or "iv".' },
      color: { type: 'string', description: 'Optional hex color, default #ffd400 (yellow).' },
    },
    required: ['itemKey', 'comment'],
  },
  handler: async (args) => {
    const guard = checkWriteAllowed();
    if (guard) return guard;
    try {
      const Z: any = (globalThis as any).Zotero;
      const itemKey = String(args.itemKey || '');
      const comment = String(args.comment || '');
      const pageLabel = args.pageLabel ? String(args.pageLabel) : '';
      const color = args.color ? String(args.color) : '#ffd400';

      if (!itemKey || !comment) {
        return { content: [{ type: 'text', text: 'Error: itemKey and comment are required.' }], isError: true };
      }

      const libraryID = Z.Libraries.userLibraryID;
      let parent: any = Z.Items.getByLibraryAndKey?.(libraryID, itemKey);
      if (parent && typeof parent.then === 'function') parent = await parent;
      if (!parent) {
        return { content: [{ type: 'text', text: `Error: item not found for key ${itemKey}` }], isError: true };
      }

      const attIDs: number[] = (parent.getAttachments?.() ?? []) as number[];
      let pdfAtt: any = null;
      for (const aid of attIDs) {
        try {
          const att = Z.Items.get(aid);
          if (att?.attachmentContentType === 'application/pdf') { pdfAtt = att; break; }
        } catch {}
      }
      if (!pdfAtt) {
        return { content: [{ type: 'text', text: `Error: no PDF attachment found on item ${itemKey}` }], isError: true };
      }

      const ann = new Z.Item('annotation');
      ann.libraryID = libraryID;
      ann.parentItemID = pdfAtt.id;
      ann.annotationType = 'note';
      ann.annotationComment = comment;
      if (pageLabel) ann.annotationPageLabel = pageLabel;
      if (color) ann.annotationColor = color;
      try { ann.addTag(DEEPREAD_TAG); } catch {}
      await ann.saveTx();

      return {
        content: [
          { type: 'json', json: { annotationKey: ann.key, parentAttachmentKey: pdfAtt.key, parentItemKey: itemKey, pageLabel, color } },
          { type: 'text', text: `Added sticky-note annotation ${ann.key} to PDF on item ${itemKey}.` },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: 'Error adding annotation: ' + msg }], isError: true };
    }
  },
};
