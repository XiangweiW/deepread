import type { PaperContext, PaperMeta } from '../context/types';
import type { PromptTemplate } from './types';
import { formatContextForPrompt } from '../context/extractor';

function getPrimaryMeta(ctx: PaperContext): PaperMeta | undefined {
  if (Array.isArray(ctx.meta)) return ctx.meta[0];
  return ctx.meta;
}

function formatMetaLine(meta: PaperMeta | undefined): string {
  if (!meta) return '(no paper metadata available)';
  const authors = meta.authors && meta.authors.length > 0 ? meta.authors.join(', ') : 'Unknown authors';
  const year = meta.year ? ` (${meta.year})` : '';
  const journal = meta.journal ? ` — ${meta.journal}` : '';
  const doi = meta.doi ? ` [doi:${meta.doi}]` : '';
  return `${meta.title}${year} — ${authors}${journal}${doi}`;
}

function safeFormatContext(ctx: PaperContext): string {
  try {
    if (typeof formatContextForPrompt === 'function') {
      return formatContextForPrompt(ctx);
    }
  } catch {
    // fall through to local fallback
  }
  return fallbackFormatContext(ctx);
}

function fallbackFormatContext(ctx: PaperContext): string {
  const parts: string[] = [];
  const metas = Array.isArray(ctx.meta) ? ctx.meta : [ctx.meta];
  parts.push('<<<paper-meta>>>');
  for (const m of metas) {
    if (!m) continue;
    parts.push(formatMetaLine(m));
    if (m.abstract) {
      parts.push(`Abstract: ${m.abstract}`);
    }
  }
  parts.push('<<<end-paper-meta>>>');
  if (ctx.collectionName) {
    parts.push(`Collection: ${ctx.collectionName}`);
  }
  if (ctx.pageLabel) {
    parts.push(`Page: ${ctx.pageLabel}`);
  }
  if (ctx.selectedText) {
    parts.push('<<<selected-text>>>');
    parts.push(ctx.selectedText);
    parts.push('<<<end-selected-text>>>');
  }
  if (ctx.pageText) {
    parts.push('<<<page-text>>>');
    parts.push(ctx.pageText);
    parts.push('<<<end-page-text>>>');
  }
  if (ctx.fullText) {
    parts.push('<<<full-text>>>');
    parts.push(ctx.fullText);
    parts.push('<<<end-full-text>>>');
  }
  if (ctx.annotations && ctx.annotations.length > 0) {
    parts.push('<<<annotations>>>');
    for (const a of ctx.annotations) {
      const page = a.pageLabel ? ` [p.${a.pageLabel}]` : '';
      const text = a.text ? ` "${a.text}"` : '';
      const comment = a.comment ? ` — ${a.comment}` : '';
      parts.push(`- (${a.type})${page}${text}${comment}`);
    }
    parts.push('<<<end-annotations>>>');
  }
  if (ctx.childNotes && ctx.childNotes.length > 0) {
    parts.push('<<<notes>>>');
    for (const n of ctx.childNotes) parts.push(`- ${n}`);
    parts.push('<<<end-notes>>>');
  }
  return parts.join('\n');
}

const summarizePaper: PromptTemplate = {
  id: 'summarize-paper',
  name: 'Summarize paper',
  description: "Generate a structured summary of the paper's contributions, methods, and findings.",
  category: 'reading',
  build: (ctx) => {
    const context = safeFormatContext(ctx);
    const user =
      'Summarize the paper below using the following sections, in this order:\n' +
      '1. Problem\n' +
      '2. Approach\n' +
      '3. Key contributions\n' +
      '4. Methods\n' +
      '5. Main findings\n' +
      '6. Limitations\n\n' +
      'Be concise and faithful to the source. If a section is not addressed in the paper, write "Not stated".\n\n' +
      '<<<context>>>\n' +
      context +
      '\n<<<end-context>>>';
    return { user };
  },
};

const translate: PromptTemplate = {
  id: 'translate',
  name: 'Translate to Chinese',
  description: 'Translate the selected passage (or abstract) to academic Chinese.',
  category: 'reading',
  build: (ctx) => {
    const meta = getPrimaryMeta(ctx);
    const source = ctx.selectedText || ctx.pageText || meta?.abstract || '';
    if (!source) {
      return {
        user:
          'No source text was provided to translate. Ask the user to select a passage in the reader, or ensure the paper has an abstract.',
      };
    }
    const user =
      'Translate the following passage into natural, academic Chinese (中文). Requirements:\n' +
      '- Preserve technical terms; on first occurrence, give the Chinese translation followed by the English term in parentheses, e.g. "注意力机制 (attention mechanism)".\n' +
      '- Keep the original paragraph structure.\n' +
      '- Do not add commentary, summaries, or explanations — output only the translation.\n\n' +
      '<source>\n' +
      source +
      '\n</source>';
    return { user };
  },
};

export const BUILTIN_TEMPLATES: PromptTemplate[] = [
  summarizePaper,
  translate,
];

export function getTemplate(id: string): PromptTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
