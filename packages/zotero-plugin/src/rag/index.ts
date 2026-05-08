export type {
  Chunk,
  EmbeddedChunk,
  IndexRecord,
  RetrievedChunk,
  RetrievalResult,
  IndexProgressEvent,
  IndexProgressCallback,
  ChunkOptions,
  BuildIndexOptions,
  TextChunk,
} from '@deepread/shared';
export {
  chunkText,
  embedTexts,
  embedQuery,
  DEFAULT_RAG_EMBEDDING_MODEL,
  retrieve,
  formatRetrievedExcerpts,
} from '@deepread/shared';
export { loadIndex, saveIndex, deleteIndex } from './store';
export { buildOrUpdateIndex } from './indexer';
export { getCollectionRagContext, ensureIndex } from './service';
export type { CollectionRagContextOptions } from './service';
