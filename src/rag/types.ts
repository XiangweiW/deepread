export type Chunk = {
  id: string;
  itemKey: string;
  itemID: number;
  title: string;
  index: number;
  text: string;
  charStart: number;
  charEnd: number;
};

export type EmbeddedChunk = Chunk & {
  embedding: number[];
  dateModified: string;
  embeddingModel: string;
};

export type IndexRecord = {
  version: number;
  collectionID: number;
  collectionName: string;
  embeddingModel: string;
  embeddingDim: number;
  createdAt: string;
  updatedAt: string;
  chunks: EmbeddedChunk[];
};

export type RetrievedChunk = {
  chunk: EmbeddedChunk;
  score: number;
};

export type RetrievalResult = {
  query: string;
  hits: RetrievedChunk[];
};

export type IndexProgressEvent =
  | { kind: 'start'; totalItems: number }
  | { kind: 'item'; itemIndex: number; totalItems: number; title: string; chunksEmbedded: number; chunksReused: number }
  | { kind: 'item-skipped'; itemIndex: number; totalItems: number; title: string; reason: string }
  | { kind: 'done'; totalItems: number; totalChunks: number; durationMs: number }
  | { kind: 'error'; message: string };

export type IndexProgressCallback = (event: IndexProgressEvent) => void;

export type ChunkOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

export type BuildIndexOptions = {
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  apiKey?: string;
  force?: boolean;
};
