import type { PaperContext } from '../context/types';

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  category: 'reading' | 'writing' | 'analysis';
  systemOverride?: string;
  build: (ctx: PaperContext, userInput?: string) => { system?: string; user: string };
};
