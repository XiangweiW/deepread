import type { ToolDefinition } from '../types';
import { searchLibraryTool } from './searchLibrary';
import { getItemTool } from './getItem';
import { getItemFullTextTool } from './getItemFullText';
import { listCollectionsTool } from './listCollections';
import { searchCollectionTool } from './searchCollection';
import { ragQueryTool } from './ragQuery';
import { getAnnotationsTool } from './getAnnotations';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  searchLibraryTool,
  getItemTool,
  getItemFullTextTool,
  listCollectionsTool,
  searchCollectionTool,
  ragQueryTool,
  getAnnotationsTool,
];
