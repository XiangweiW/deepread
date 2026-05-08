import { Prefs } from '../../prefs';
import type { ToolResult } from '../types';

export const DEEPREAD_TAG = 'deepread:mcp';

export function checkWriteAllowed(): ToolResult | null {
  if (Prefs.getMcpAllowWrite()) return null;
  return {
    content: [
      {
        type: 'text',
        text: 'Write operations are disabled. Enable them in Zotero: Settings → DeepRead → "Allow MCP write operations" — then retry. Off by default to prevent prompt injection from a malicious paper modifying your library.',
      },
    ],
    isError: true,
  };
}

export function mdToHtml(md: string): string {
  let html = String(md ?? '');
  html = html.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const blocks = html.split(/\n{2,}/).map((b) => {
    if (/^<(pre|h\d|ul|ol|blockquote)/.test(b.trim())) return b;
    return '<p>' + b.replace(/\n/g, '<br/>') + '</p>';
  });
  return blocks.join('\n');
}
