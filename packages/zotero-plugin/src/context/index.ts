export type { PaperContext, PaperMeta, Annotation } from '@deepread/shared';
export { formatContextForPrompt } from '@deepread/shared';
export {
  stripHtml,
  extractMeta,
  extractFullText,
  extractAnnotations,
  extractChildNotes,
  extractFromItem,
  extractFromReader,
  extractFromCollection,
} from './extractor';
