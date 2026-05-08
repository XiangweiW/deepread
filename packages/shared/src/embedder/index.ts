const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_CONCURRENCY = 4;
const RETRY_BACKOFF_MS = 1500;

type EmbedResponse = {
  embedding?: { values?: number[] };
  error?: { message?: string };
};

function debug(_msg: string, _err?: unknown): void {
  // intentionally silent in the shared package; callers can wrap to log if needed
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      const setTimeoutFn: any = (globalThis as any).setTimeout;
      if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(resolve, ms);
      } else {
        resolve();
      }
    } catch {
      resolve();
    }
  });
}

async function embedOne(
  text: string,
  apiKey: string,
  model: string,
  attempt = 0,
): Promise<number[]> {
  const url = `${BASE_URL}/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    model: `models/${model}`,
    content: { parts: [{ text }] },
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('embedContent fetch failed: ' + (err instanceof Error ? err.message : String(err)));
  }

  if (response.status === 429 && attempt === 0) {
    debug('429 rate limited, retrying once');
    await sleep(RETRY_BACKOFF_MS);
    return embedOne(text, apiKey, model, attempt + 1);
  }

  if (!response.ok) {
    let detail = '';
    try { detail = await response.text(); } catch {}
    throw new Error(`embedContent HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  let parsed: EmbedResponse;
  try {
    parsed = (await response.json()) as EmbedResponse;
  } catch (err) {
    throw new Error('embedContent JSON parse failed: ' + (err instanceof Error ? err.message : String(err)));
  }

  if (parsed.error?.message) {
    throw new Error('embedContent error: ' + parsed.error.message);
  }
  const values = parsed.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('embedContent returned no embedding values');
  }
  return values;
}

export async function embedTexts(
  texts: string[],
  apiKey: string,
  model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<number[][]> {
  if (!apiKey) throw new Error('embedTexts: missing API key');
  if (!Array.isArray(texts) || texts.length === 0) return [];

  const results: number[][] = new Array(texts.length);
  let cursor = 0;
  let firstError: Error | null = null;

  async function worker(): Promise<void> {
    while (cursor < texts.length && !firstError) {
      const idx = cursor++;
      try {
        results[idx] = await embedOne(texts[idx], apiKey, model);
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err : new Error(String(err));
        return;
      }
    }
  }

  const concurrency = Math.min(MAX_CONCURRENCY, texts.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  if (firstError) throw firstError;
  return results;
}

export async function embedQuery(
  query: string,
  apiKey: string,
  model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<number[]> {
  const out = await embedTexts([query], apiKey, model);
  if (!out[0]) throw new Error('embedQuery: no embedding returned');
  return out[0];
}

export const DEFAULT_RAG_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
