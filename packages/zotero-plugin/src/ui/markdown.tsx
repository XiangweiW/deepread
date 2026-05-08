import * as React from 'react';

type InlineNode = string | JSX.Element;

let inlineKeyCounter = 0;
function nextKey(): string {
  inlineKeyCounter += 1;
  return `m${inlineKeyCounter}`;
}

function renderInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush();
        out.push(
          <code key={nextKey()} style={inlineCodeStyle}>
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        flush();
        const inner = text.slice(i + 2, end);
        out.push(
          <strong key={nextKey()}>{renderInline(inner)}</strong>,
        );
        i = end + 2;
        continue;
      }
    }

    if (ch === '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && end !== i + 1) {
        flush();
        const inner = text.slice(i + 1, end);
        out.push(
          <em key={nextKey()}>{renderInline(inner)}</em>,
        );
        i = end + 1;
        continue;
      }
    }

    if (ch === '[') {
      const fnMatch = /^\[\^([A-Za-z0-9_-]+)\]/.exec(text.slice(i));
      if (fnMatch) {
        flush();
        const id = fnMatch[1];
        out.push(
          <sup
            key={nextKey()}
            data-citation={id}
            style={citationStyle}
          >
            {`[${id}]`}
          </sup>,
        );
        i += fnMatch[0].length;
        continue;
      }
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (linkMatch) {
        flush();
        out.push(
          <a
            key={nextKey()}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={linkStyle}
          >
            {linkMatch[1]}
          </a>,
        );
        i += linkMatch[0].length;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ kind: 'code', text: codeLines.join('\n') });
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2] });
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    const paraLines: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'p', text: paraLines.join('\n') });
  }

  return blocks;
}

export function renderMarkdown(md: string): JSX.Element {
  const blocks = parseBlocks(md || '');
  return (
    <div style={containerStyle}>
      {blocks.map((b, idx) => {
        if (b.kind === 'p') {
          return (
            <p key={`b${idx}`} style={paragraphStyle}>
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === 'h') {
          if (b.level === 1) {
            return (
              <h1 key={`b${idx}`} style={h1Style}>
                {renderInline(b.text)}
              </h1>
            );
          }
          if (b.level === 2) {
            return (
              <h2 key={`b${idx}`} style={h2Style}>
                {renderInline(b.text)}
              </h2>
            );
          }
          return (
            <h3 key={`b${idx}`} style={h3Style}>
              {renderInline(b.text)}
            </h3>
          );
        }
        if (b.kind === 'code') {
          return (
            <pre key={`b${idx}`} style={codeBlockStyle}>
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.kind === 'ul') {
          return (
            <ul key={`b${idx}`} style={listStyle}>
              {b.items.map((it, j) => (
                <li key={`b${idx}-${j}`}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={`b${idx}`} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={`b${idx}-${j}`}>{renderInline(it)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  wordBreak: 'break-word',
};

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const h1Style: React.CSSProperties = {
  margin: '4px 0 2px',
  fontSize: 16,
  fontWeight: 700,
};

const h2Style: React.CSSProperties = {
  margin: '4px 0 2px',
  fontSize: 14,
  fontWeight: 700,
};

const h3Style: React.CSSProperties = {
  margin: '4px 0 2px',
  fontSize: 13,
  fontWeight: 700,
};

const inlineCodeStyle: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: '0.92em',
  background: 'rgba(0,0,0,0.06)',
  padding: '1px 4px',
  borderRadius: 3,
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  background: 'rgba(0,0,0,0.06)',
  borderRadius: 4,
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 12,
  overflowX: 'auto',
  whiteSpace: 'pre',
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  lineHeight: 1.5,
};

const linkStyle: React.CSSProperties = {
  color: '#0a66c2',
  textDecoration: 'underline',
};

const citationStyle: React.CSSProperties = {
  fontSize: '0.7em',
  color: '#0a66c2',
  cursor: 'default',
  marginLeft: 1,
};
