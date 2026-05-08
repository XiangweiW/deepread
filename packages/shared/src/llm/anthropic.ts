import type { ChatOptions, LLMMessage, LLMProvider, StreamChunk } from './types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-4-7';
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicProviderOptions = {
  apiKey: string;
  defaultModel?: string;
  baseURL?: string;
};

type SSEEvent = {
  event: string;
  data: string;
};

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseURL: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
    this.baseURL = options.baseURL ?? DEFAULT_BASE_URL;
  }

  async *chat(messages: LLMMessage[], opts: ChatOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: opts.model ?? this.defaultModel,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (opts.system !== undefined) body.system = opts.system;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    let response: Response;
    try {
      response = await fetch(this.baseURL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (err) {
      yield { type: 'error', message: errorMessage(err) };
      return;
    }

    if (!response.ok || !response.body) {
      let detail = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text) detail = `${detail}: ${text}`;
      } catch {}
      yield { type: 'error', message: detail };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        if (opts.signal?.aborted) {
          try { await reader.cancel(); } catch {}
          yield { type: 'error', message: 'aborted' };
          return;
        }

        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const parsed = parseSSEEvent(rawEvent);
          if (!parsed) continue;

          const { event, data } = parsed;
          if (!data) continue;

          if (event === 'error') {
            const message = safeExtractErrorMessage(data) ?? data;
            yield { type: 'error', message };
            return;
          }

          let json: any;
          try {
            json = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === 'content_block_delta') {
            const delta = json?.delta;
            if (delta && delta.type === 'text_delta' && typeof delta.text === 'string') {
              yield { type: 'text', delta: delta.text };
            }
          } else if (event === 'message_start') {
            const usage = json?.message?.usage;
            if (usage) {
              if (typeof usage.input_tokens === 'number') inputTokens = usage.input_tokens;
              if (typeof usage.output_tokens === 'number') outputTokens = usage.output_tokens;
            }
          } else if (event === 'message_delta') {
            const usage = json?.usage;
            if (usage && typeof usage.output_tokens === 'number') {
              outputTokens = usage.output_tokens;
            }
          } else if (event === 'message_stop') {
            yield { type: 'done', usage: { inputTokens, outputTokens } };
            return;
          }
        }
      }
    } catch (err) {
      yield { type: 'error', message: errorMessage(err) };
      return;
    }

    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }
}

function parseSSEEvent(raw: string): SSEEvent | null {
  const lines = raw.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0 && event === 'message') return null;
  return { event, data: dataLines.join('\n') };
}

function safeExtractErrorMessage(data: string): string | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.error?.message === 'string') return parsed.error.message;
      if (typeof parsed.message === 'string') return parsed.message;
    }
  } catch {}
  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}
