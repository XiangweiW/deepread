import type { LLMProvider, LLMMessage, ChatOptions, StreamChunk } from './types';

type GeminiPart = { text: string };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

type GeminiOptions = {
  apiKey: string;
  defaultModel?: string;
  baseURL?: string;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function toGeminiContents(messages: LLMMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

function isThinkingModel(model: string): boolean {
  return /^gemini-2\.5/.test(model) || /^gemini-3/.test(model);
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;
  private baseURL: string;

  constructor(opts: GeminiOptions) {
    this.apiKey = opts.apiKey;
    this.defaultModel = opts.defaultModel || DEFAULT_MODEL;
    this.baseURL = (opts.baseURL || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async *chat(messages: LLMMessage[], opts: ChatOptions): AsyncIterable<StreamChunk> {
    const model = opts.model || this.defaultModel;
    const url = `${this.baseURL}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    const generationConfig: Record<string, unknown> = {};
    if (typeof opts.maxTokens === 'number') generationConfig.maxOutputTokens = opts.maxTokens;
    if (typeof opts.temperature === 'number') generationConfig.temperature = opts.temperature;
    if (isThinkingModel(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const body: Record<string, unknown> = {
      contents: toGeminiContents(messages),
      generationConfig,
    };
    if (opts.system && opts.system.length > 0) {
      body.systemInstruction = { parts: [{ text: opts.system }] };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: 'error', message: 'fetch failed: ' + msg };
      return;
    }

    if (!response.ok || !response.body) {
      let detail = '';
      try { detail = await response.text(); } catch {}
      yield { type: 'error', message: `HTTP ${response.status}: ${detail.slice(0, 500)}` };
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
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let sepIdx: number;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          const dataLines: string[] = [];
          for (const line of eventBlock.split('\n')) {
            if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;
          const dataStr = dataLines.join('\n');
          if (dataStr === '[DONE]') continue;

          let parsed: any;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          const candidate = parsed?.candidates?.[0];
          const parts = candidate?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part?.text === 'string' && part.text.length > 0) {
                yield { type: 'text', delta: part.text };
              }
            }
          }

          const usage = parsed?.usageMetadata;
          if (usage) {
            if (typeof usage.promptTokenCount === 'number') inputTokens = usage.promptTokenCount;
            if (typeof usage.candidatesTokenCount === 'number') outputTokens = usage.candidatesTokenCount;
          }

          if (parsed?.error) {
            const msg = parsed.error?.message || 'unknown error';
            yield { type: 'error', message: msg };
            return;
          }
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: 'error', message: 'stream read failed: ' + msg };
      return;
    }

    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }
}
