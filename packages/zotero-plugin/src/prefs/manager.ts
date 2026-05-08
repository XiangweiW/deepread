export const PREF_PREFIX = 'extensions.zotero-copilot.';

export type ProviderId = 'anthropic' | 'gemini';

export const PREF_KEYS = {
  provider: 'provider',
  apiKey: 'apiKey',
  geminiApiKey: 'geminiApiKey',
  model: 'model',
  geminiModel: 'geminiModel',
  maxTokens: 'maxTokens',
  systemPrompt: 'systemPrompt',
  allowFullTextUpload: 'allowFullTextUpload',
  temperature: 'temperature',
  sidebarCollapsed: 'sidebarCollapsed',
  mcpEnabled: 'mcpEnabled',
  mcpPort: 'mcpPort',
  mcpAllowWrite: 'mcpAllowWrite',
} as const;

const DEFAULTS = {
  provider: 'gemini' as ProviderId,
  apiKey: '',
  geminiApiKey: '',
  model: 'claude-opus-4-7',
  geminiModel: 'gemini-2.5-flash',
  maxTokens: 4096,
  systemPrompt:
    'You are an expert research assistant helping the user understand academic papers. Answer based only on the provided paper context. When citing, reference page numbers if available.',
  allowFullTextUpload: false,
  temperature: 0.3,
  sidebarCollapsed: false,
  mcpEnabled: false,
  mcpPort: 23119,
  mcpAllowWrite: false,
} as const;

function getRaw(key: string): unknown {
  try {
    return Zotero.Prefs.get(PREF_PREFIX + key, true);
  } catch {
    return undefined;
  }
}

function setRaw(key: string, value: unknown): void {
  Zotero.Prefs.set(PREF_PREFIX + key, value, true);
}

function getString(key: string, fallback: string): string {
  const v = getRaw(key);
  if (typeof v === 'string' && v.length > 0) return v;
  return fallback;
}

function getNumber(key: string, fallback: number): number {
  const v = getRaw(key);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function getBoolean(key: string, fallback: boolean): boolean {
  const v = getRaw(key);
  if (typeof v === 'boolean') return v;
  return fallback;
}

export const Prefs = {
  getProvider(): ProviderId {
    const v = getString(PREF_KEYS.provider, DEFAULTS.provider);
    return v === 'anthropic' || v === 'gemini' ? v : DEFAULTS.provider;
  },
  setProvider(value: ProviderId): void {
    setRaw(PREF_KEYS.provider, value);
  },
  getApiKey(): string {
    return getString(PREF_KEYS.apiKey, DEFAULTS.apiKey);
  },
  setApiKey(value: string): void {
    setRaw(PREF_KEYS.apiKey, value);
  },
  getGeminiApiKey(): string {
    return getString(PREF_KEYS.geminiApiKey, DEFAULTS.geminiApiKey);
  },
  setGeminiApiKey(value: string): void {
    setRaw(PREF_KEYS.geminiApiKey, value);
  },
  getActiveApiKey(): string {
    return this.getProvider() === 'gemini' ? this.getGeminiApiKey() : this.getApiKey();
  },
  getActiveModel(): string {
    return this.getProvider() === 'gemini' ? this.getGeminiModel() : this.getModel();
  },
  getModel(): string {
    return getString(PREF_KEYS.model, DEFAULTS.model);
  },
  setModel(value: string): void {
    setRaw(PREF_KEYS.model, value);
  },
  getGeminiModel(): string {
    return getString(PREF_KEYS.geminiModel, DEFAULTS.geminiModel);
  },
  setGeminiModel(value: string): void {
    setRaw(PREF_KEYS.geminiModel, value);
  },
  getMaxTokens(): number {
    return getNumber(PREF_KEYS.maxTokens, DEFAULTS.maxTokens);
  },
  setMaxTokens(value: number): void {
    setRaw(PREF_KEYS.maxTokens, value);
  },
  getSystemPrompt(): string {
    return getString(PREF_KEYS.systemPrompt, DEFAULTS.systemPrompt);
  },
  setSystemPrompt(value: string): void {
    setRaw(PREF_KEYS.systemPrompt, value);
  },
  getAllowFullTextUpload(): boolean {
    return getBoolean(PREF_KEYS.allowFullTextUpload, DEFAULTS.allowFullTextUpload);
  },
  setAllowFullTextUpload(value: boolean): void {
    setRaw(PREF_KEYS.allowFullTextUpload, value);
  },
  getTemperature(): number {
    return getNumber(PREF_KEYS.temperature, DEFAULTS.temperature);
  },
  setTemperature(value: number): void {
    setRaw(PREF_KEYS.temperature, value);
  },
  getSidebarCollapsed(): boolean {
    return getBoolean(PREF_KEYS.sidebarCollapsed, DEFAULTS.sidebarCollapsed);
  },
  setSidebarCollapsed(value: boolean): void {
    setRaw(PREF_KEYS.sidebarCollapsed, value);
  },
  getMcpEnabled(): boolean {
    return getBoolean(PREF_KEYS.mcpEnabled, DEFAULTS.mcpEnabled);
  },
  setMcpEnabled(value: boolean): void {
    setRaw(PREF_KEYS.mcpEnabled, value);
  },
  getMcpPort(): number {
    return getNumber(PREF_KEYS.mcpPort, DEFAULTS.mcpPort);
  },
  setMcpPort(value: number): void {
    setRaw(PREF_KEYS.mcpPort, value);
  },
  getMcpAllowWrite(): boolean {
    return getBoolean(PREF_KEYS.mcpAllowWrite, DEFAULTS.mcpAllowWrite);
  },
  setMcpAllowWrite(value: boolean): void {
    setRaw(PREF_KEYS.mcpAllowWrite, value);
  },
};
