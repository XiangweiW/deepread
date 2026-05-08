import type { PaperContext, PaperMeta } from './types';

function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max)) + '\n[...truncated]';
}

function metaLine(m: PaperMeta): string {
  const parts: string[] = [];
  parts.push(`Title: ${m.title || '(untitled)'}`);
  if (m.authors && m.authors.length) parts.push(`Authors: ${m.authors.join(', ')}`);
  if (m.year) parts.push(`Year: ${m.year}`);
  if (m.journal) parts.push(`Journal: ${m.journal}`);
  if (m.doi) parts.push(`DOI: ${m.doi}`);
  return parts.join(' | ');
}

export function formatContextForPrompt(ctx: PaperContext, budgetChars?: number): string {
  const budget = Math.max(1000, budgetChars ?? 80000);
  const out: string[] = [];

  if (ctx.source === 'collection') {
    const metas = Array.isArray(ctx.meta) ? ctx.meta : [];
    out.push(`[Collection] ${ctx.collectionName ?? '(unnamed)'} — ${metas.length} item(s)`);
    metas.forEach((m, i) => {
      out.push(`${i + 1}. ${metaLine(m)}`);
      if (m.abstract) {
        out.push(`   Abstract: ${truncate(m.abstract, 600)}`);
      }
    });
    return truncate(out.join('\n'), budget);
  }

  const m = Array.isArray(ctx.meta) ? ctx.meta[0] : ctx.meta;
  if (m) {
    out.push(`[Paper] ${metaLine(m)}`);
    if (m.abstract) {
      out.push('[Abstract]');
      out.push(m.abstract);
    }
  }

  if (ctx.selectedText) {
    out.push('[Selected text]');
    out.push(ctx.selectedText);
  }

  if (ctx.pageText) {
    const label = ctx.pageLabel ? ` (p.${ctx.pageLabel})` : '';
    out.push(`[Page text${label}]`);
    out.push(ctx.pageText);
  } else if (ctx.pageLabel) {
    out.push(`[Page] ${ctx.pageLabel}`);
  }

  if (ctx.annotations && ctx.annotations.length) {
    out.push('[Annotations]');
    for (const a of ctx.annotations) {
      const page = a.pageLabel ? `p.${a.pageLabel}: ` : '';
      const text = a.text ? `"${a.text.replace(/\s+/g, ' ').trim()}"` : `(${a.type})`;
      const comment = a.comment ? `  comment: ${a.comment.replace(/\s+/g, ' ').trim()}` : '';
      out.push(`- ${page}${text}${comment}`);
    }
  }

  if (ctx.childNotes && ctx.childNotes.length) {
    out.push('[Notes]');
    for (const n of ctx.childNotes) {
      out.push(n);
    }
  }

  if (ctx.fullText) {
    const ftBudget = Math.floor(budget / 2);
    out.push('[Full text]');
    out.push(truncate(ctx.fullText, ftBudget));
  }

  return truncate(out.join('\n\n'), budget);
}
