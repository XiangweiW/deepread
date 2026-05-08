export type PaperMeta = {
  itemID: number;
  itemKey: string;
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  doi?: string;
  abstract?: string;
};

export type Annotation = {
  type: 'highlight' | 'note' | 'underline' | 'strikethrough' | 'image' | 'ink';
  text?: string;
  comment?: string;
  pageLabel?: string;
  color?: string;
};

export type PaperContext = {
  source: 'item' | 'reader-selection' | 'reader-page' | 'collection';
  meta: PaperMeta | PaperMeta[];
  fullText?: string;
  selectedText?: string;
  pageText?: string;
  pageLabel?: string;
  annotations?: Annotation[];
  childNotes?: string[];
  collectionName?: string;
};
