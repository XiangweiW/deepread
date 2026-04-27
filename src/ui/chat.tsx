import * as React from 'react';
import type { LLMProvider, LLMMessage } from '../llm/types';
import type { PromptTemplate } from '../prompts/types';
import type { PaperContext } from '../context/types';
import { formatContextForPrompt } from '../context/extractor';
import { Message, ChatMessageProps } from './message';

export type ChatProps = {
  provider: LLMProvider;
  templates: PromptTemplate[];
  buildContext: () => Promise<PaperContext | undefined>;
  systemPrompt?: string;
  model?: string;
  onSaveToNote?: (transcript: { role: string; content: string }[]) => Promise<void>;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatMessageProps['citations'];
};

const FREE_CHAT_ID = '__free__';

export function Chat(props: ChatProps): JSX.Element {
  const { provider, templates, buildContext, systemPrompt, model, onSaveToNote } = props;

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [inputText, setInputText] = React.useState('');
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [savingNote, setSavingNote] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const streamingRef = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  React.useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      try { ta.focus(); } catch {}
    }
  }, []);

  const handleSendRef = React.useRef<(overrideText?: string) => Promise<void>>(async () => {});

  React.useEffect(() => {
    const mainWin: any = (globalThis as any).window;
    if (!mainWin) return;
    const HANDLERS_KEY = '__copilotChatHandlers';
    if (!Array.isArray(mainWin[HANDLERS_KEY])) {
      mainWin[HANDLERS_KEY] = [];
    }
    const fn = (message: string) => {
      try {
        try { (globalThis as any).Zotero?.debug?.('[zotero-copilot] chat handler received len=' + message.length, 3); } catch {}
        setInputText(message);
        void handleSendRef.current(message);
      } catch {}
    };
    mainWin[HANDLERS_KEY].push(fn);
    return () => {
      try {
        const list: Array<(t: string) => void> = mainWin[HANDLERS_KEY];
        if (Array.isArray(list)) {
          const i = list.indexOf(fn);
          if (i >= 0) list.splice(i, 1);
        }
      } catch {}
    };
  }, []);

  const trapKey = React.useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const handleSend = React.useCallback(async (overrideText?: string) => {
    if (streamingRef.current) return;

    const sourceText = overrideText != null ? overrideText : inputText;
    const trimmed = sourceText.trim();
    const template = selectedTemplateId
      ? templates.find((t) => t.id === selectedTemplateId)
      : undefined;

    if (!template && !trimmed) return;

    setError(undefined);

    let ctx: PaperContext | undefined;
    try {
      ctx = await buildContext();
    } catch (err) {
      ctx = undefined;
    }

    let userDisplay: string;
    let llmUserContent: string;
    let systemOverride: string | undefined;

    if (template) {
      const safeCtx: PaperContext =
        ctx ?? ({ source: 'item', meta: { itemID: 0, itemKey: '', title: '', authors: [] } } as PaperContext);
      const built = template.build(safeCtx, trimmed);
      llmUserContent = built.user;
      systemOverride = built.system ?? template.systemOverride;
      userDisplay = trimmed || template.description || template.name;
    } else {
      if (!trimmed) return;
      userDisplay = trimmed;
      if (ctx) {
        const ctxBlock = formatContextForPrompt(ctx);
        llmUserContent = `<context>\n${ctxBlock}\n</context>\n\n${trimmed}`;
      } else {
        llmUserContent = trimmed;
      }
    }

    const priorHistory: LLMMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const llmMessages: LLMMessage[] = [...priorHistory, { role: 'user', content: llmUserContent }];

    const userMsg: ChatMessage = { role: 'user', content: userDisplay };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputText('');
    setIsStreaming(true);
    streamingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    const finalSystem = systemOverride ?? systemPrompt;

    try {
      const stream = provider.chat(llmMessages, {
        system: finalSystem,
        model,
        signal: controller.signal,
      });
      let assistantText = '';
      let streamErr: string | undefined;
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          assistantText += chunk.delta;
          const snapshot = assistantText;
          setMessages((prev) => {
            const next = prev.slice();
            const last = next.length - 1;
            if (last >= 0 && next[last].role === 'assistant') {
              next[last] = { ...next[last], content: snapshot };
            }
            return next;
          });
        } else if (chunk.type === 'error') {
          streamErr = chunk.message;
          break;
        } else if (chunk.type === 'done') {
          break;
        }
      }
      if (streamErr) {
        setError(streamErr);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      try { textareaRef.current?.focus(); } catch {}
    }
  }, [
    inputText,
    selectedTemplateId,
    templates,
    buildContext,
    messages,
    provider,
    systemPrompt,
    model,
  ]);

  React.useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  const handleStop = React.useCallback(() => {
    const c = abortRef.current;
    if (c) {
      try {
        c.abort();
      } catch {
        // ignore
      }
    }
  }, []);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleSaveToNote = React.useCallback(async () => {
    if (!onSaveToNote || messages.length === 0 || savingNote) return;
    setSavingNote(true);
    try {
      await onSaveToNote(messages.map((m) => ({ role: m.role, content: m.content })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Save to note failed: ${msg}`);
    } finally {
      setSavingNote(false);
    }
  }, [onSaveToNote, messages, savingNote]);

  return (
    <div
      style={styles.root}
      onKeyDown={trapKey}
      onKeyUp={trapKey}
      onKeyPress={trapKey}
    >
      <div style={styles.toolbar}>
        <select
          value={selectedTemplateId ?? FREE_CHAT_ID}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedTemplateId(v === FREE_CHAT_ID ? undefined : v);
          }}
          style={styles.select}
          disabled={isStreaming}
        >
          <option value={FREE_CHAT_ID}>Free chat</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleSaveToNote()}
          disabled={!onSaveToNote || messages.length === 0 || savingNote || isStreaming}
          style={styles.toolbarButton}
          title="Save the current conversation as a Zotero note"
        >
          {savingNote ? 'Saving…' : 'Save to note'}
        </button>
      </div>

      <div ref={scrollRef} style={styles.messageList}>
        {messages.length === 0 ? (
          <div style={styles.empty}>
            Pick a template or just ask a question. Your current Zotero selection
            is included automatically.
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const showCaret = isStreaming && isLast && m.role === 'assistant';
            return (
              <Message
                key={i}
                role={m.role}
                content={m.content}
                streaming={showCaret}
                citations={m.citations}
              />
            );
          })
        )}
      </div>

      {error ? <div style={styles.errorBanner}>{error}</div> : null}

      <div style={styles.composer}>
        <textarea
          ref={textareaRef}
          autoFocus
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedTemplateId
              ? 'Optional input for this template. Enter to send.'
              : 'Ask about the current paper. Enter to send, Shift+Enter for newline.'
          }
          rows={3}
          style={styles.textarea}
          disabled={isStreaming}
        />
        <div style={styles.composerButtons}>
          {isStreaming ? (
            <button type="button" onClick={handleStop} style={styles.stopButton}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSend()}
              style={styles.sendButton}
              disabled={!selectedTemplateId && inputText.trim().length === 0}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minHeight: 0,
    width: '100%',
    boxSizing: 'border-box',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderBottom: '1px solid #e0e0e0',
    flex: '0 0 auto',
  },
  select: {
    flex: '1 1 auto',
    fontSize: 12,
    padding: '2px 4px',
  },
  toolbarButton: {
    fontSize: 12,
    padding: '2px 8px',
    background: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: 4,
    cursor: 'pointer',
  },
  messageList: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    color: '#888',
    fontStyle: 'italic',
    fontSize: 12,
    padding: 8,
  },
  errorBanner: {
    background: '#fdecea',
    color: '#a8261d',
    border: '1px solid #f5c2bd',
    padding: '6px 8px',
    fontSize: 12,
    margin: '0 8px',
    borderRadius: 4,
  },
  composer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 8,
    borderTop: '1px solid #e0e0e0',
    flex: '0 0 auto',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
    fontSize: 13,
    padding: 6,
    border: '1px solid #d0d7de',
    borderRadius: 4,
    minHeight: 60,
  },
  composerButtons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  sendButton: {
    fontSize: 12,
    padding: '4px 12px',
    background: '#0a66c2',
    color: '#fff',
    border: '1px solid #0a66c2',
    borderRadius: 4,
    cursor: 'pointer',
  },
  stopButton: {
    fontSize: 12,
    padding: '4px 12px',
    background: '#fff',
    color: '#a8261d',
    border: '1px solid #a8261d',
    borderRadius: 4,
    cursor: 'pointer',
  },
};
