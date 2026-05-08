export type LLMRole = 'system' | 'user' | 'assistant';

export type LLMMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type StreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; message: string };

export interface LLMProvider {
  chat(messages: LLMMessage[], opts: ChatOptions): AsyncIterable<StreamChunk>;
}
