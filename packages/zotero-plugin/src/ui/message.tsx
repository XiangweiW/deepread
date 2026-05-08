import * as React from 'react';
import { renderMarkdown } from './markdown';

export type ChatMessageProps = {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  citations?: { id: string; itemKey?: string; page?: string }[];
  onCitationClick?: (id: string) => void;
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const Z: any = (globalThis as any).Zotero;
    const mainWin: any = Z?.getMainWindow?.();
    const nav: any = mainWin?.navigator;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const Z: any = (globalThis as any).Zotero;
    if (Z?.Utilities?.Internal?.copyTextToClipboard) {
      Z.Utilities.Internal.copyTextToClipboard(text);
      return true;
    }
  } catch {
  }
  try {
    const Components: any = (globalThis as any).Components;
    if (Components?.classes && Components?.interfaces) {
      const helper = Components.classes['@mozilla.org/widget/clipboardhelper;1']
        .getService(Components.interfaces.nsIClipboardHelper);
      helper.copyString(text);
      return true;
    }
  } catch {
  }
  return false;
}

export function Message(props: ChatMessageProps): JSX.Element {
  const { role, content, streaming, citations, onCitationClick } = props;
  const isUser = role === 'user';
  const [copied, setCopied] = React.useState(false);
  const [rawView, setRawView] = React.useState(false);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);

  const handleCopy = React.useCallback(async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [content]);

  const handleSelectAll = React.useCallback(() => {
    try {
      const el = bubbleRef.current;
      if (!el) return;
      const win: any = el.ownerDocument?.defaultView;
      const sel = win?.getSelection?.();
      if (!sel) return;
      sel.removeAllRanges();
      const range = el.ownerDocument!.createRange();
      range.selectNodeContents(el);
      sel.addRange(range);
    } catch {
    }
  }, []);

  const handleNativeCopy = React.useCallback((e: React.ClipboardEvent) => {
    try {
      const win: any = (globalThis as any).window;
      const selectedText: string = win?.getSelection?.()?.toString?.() || '';
      if (selectedText) {
        e.preventDefault();
        void copyToClipboard(selectedText);
      }
    } catch {
    }
  }, []);

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
    width: '100%',
  };
  const bubbleStyle: React.CSSProperties = {
    position: 'relative',
    maxWidth: '88%',
    background: isUser ? '#dbeafe' : '#f1f3f5',
    color: '#1a1a1a',
    border: `1px solid ${isUser ? '#bfdbfe' : '#e4e6ea'}`,
    borderRadius: 8,
    padding: '6px 10px',
    paddingTop: isUser ? 6 : 22,
    fontSize: 13,
    lineHeight: 1.5,
    boxSizing: 'border-box',
    userSelect: 'text',
    WebkitUserSelect: 'text',
    MozUserSelect: 'text',
    cursor: 'text',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as React.CSSProperties;

  const rawTextareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 80,
    resize: 'vertical',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    padding: 6,
    border: '1px solid #d0d7de',
    borderRadius: 4,
    background: '#fff',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  };

  return (
    <div style={rowStyle}>
      <div ref={bubbleRef} style={bubbleStyle} onCopy={handleNativeCopy}>
        {!isUser && content.length > 0 && !streaming ? (
          <div style={toolbarStyle}>
            <button
              type="button"
              onClick={() => setRawView((v) => !v)}
              style={toolbarButtonStyle}
              title={rawView ? 'Show formatted' : 'Show raw text (selectable)'}
            >
              {rawView ? '⤴' : '✎'}
            </button>
            <button
              type="button"
              onClick={handleSelectAll}
              style={toolbarButtonStyle}
              title="Select all in this message"
            >
              {'⊟'}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              style={toolbarButtonStyle}
              title="Copy whole message"
            >
              {copied ? '✓' : '⧉'}
            </button>
          </div>
        ) : null}
        {rawView && !isUser ? (
          <textarea
            readOnly
            value={content}
            style={rawTextareaStyle}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : isUser ? (
          <div style={userContentStyle}>{content || '(empty)'}</div>
        ) : (
          renderMarkdown(content)
        )}
        {streaming ? <span style={caretStyle}>{'█'}</span> : null}
        {!isUser && citations && citations.length > 0 ? (
          <div style={citationsRowStyle}>
            {citations.map((c) => {
              const label = c.page ? `${c.id} · p.${c.page}` : c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCitationClick?.(c.id)}
                  style={citationChipStyle}
                  title={c.itemKey ? `Item ${c.itemKey}` : c.id}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const userContentStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const toolbarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 2,
  right: 2,
  display: 'flex',
  gap: 2,
  userSelect: 'none',
};

const toolbarButtonStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  border: '1px solid #d0d7de',
  borderRadius: 4,
  padding: '0 5px',
  fontSize: 11,
  lineHeight: '16px',
  height: 18,
  cursor: 'pointer',
  color: '#444',
  userSelect: 'none',
};

const caretStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '0.55em',
  marginLeft: 2,
  animation: 'none',
  opacity: 0.6,
};

const citationsRowStyle: React.CSSProperties = {
  marginTop: 6,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
};

const citationChipStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #d0d7de',
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 11,
  color: '#0a66c2',
  cursor: 'pointer',
  lineHeight: 1.4,
};
