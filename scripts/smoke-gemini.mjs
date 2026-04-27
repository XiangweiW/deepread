import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .trim().split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
    })
);

const apiKey = env.GEMINI_API_KEY;
const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
if (!apiKey) { console.error('GEMINI_API_KEY missing in .env'); process.exit(1); }

const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
const body = {
  contents: [{ role: 'user', parts: [{ text: 'In one sentence, what is a literature review?' }] }],
  systemInstruction: { parts: [{ text: 'You are a research assistant. Be concise.' }] },
  generationConfig: { maxOutputTokens: 200, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
};

const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(1); }

const reader = res.body.getReader();
const dec = new TextDecoder('utf-8');
let buf = '';
let chunks = 0, chars = 0, usage = null;
process.stdout.write('--- stream begin ---\n');
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
  let i;
  while ((i = buf.indexOf('\n\n')) !== -1) {
    const block = buf.slice(0, i); buf = buf.slice(i + 2);
    const dataLines = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart());
    if (!dataLines.length) continue;
    const dataStr = dataLines.join('\n');
    if (dataStr === '[DONE]') continue;
    let parsed;
    try { parsed = JSON.parse(dataStr); } catch { continue; }
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (typeof p?.text === 'string') {
          process.stdout.write(p.text);
          chunks++; chars += p.text.length;
        }
      }
    }
    if (parsed?.usageMetadata) usage = parsed.usageMetadata;
  }
}
process.stdout.write('\n--- stream end ---\n');
console.log(`chunks=${chunks} chars=${chars} usage=`, usage);
