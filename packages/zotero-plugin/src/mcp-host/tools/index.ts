import type { ToolDefinition } from '../types';
import { searchLibraryTool } from './searchLibrary';
import { getItemTool } from './getItem';
import { getItemFullTextTool } from './getItemFullText';
import { listCollectionsTool } from './listCollections';
import { searchCollectionTool } from './searchCollection';
import { ragQueryTool } from './ragQuery';
import { getAnnotationsTool } from './getAnnotations';
import { addNoteTool } from './addNote';
import { addTagTool } from './addTag';
import { removeTagTool } from './removeTag';
import { addToCollectionTool } from './addToCollection';
import { addAnnotationTool } from './addAnnotation';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  searchLibraryTool,
  getItemTool,
  getItemFullTextTool,
  listCollectionsTool,
  searchCollectionTool,
  ragQueryTool,
  getAnnotationsTool,
  addNoteTool,
  addTagTool,
  removeTagTool,
  addToCollectionTool,
  addAnnotationTool,
];
