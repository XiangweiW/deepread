import { Prefs } from '../prefs';
import { registerMcpHost as registerHost } from './server';
import { BUILTIN_TOOLS } from './tools';

export * from './types';
export { registerMcpHost as registerMcpHostRaw } from './server';
export { dispatch, JSON_RPC_ERRORS, PROTOCOL_VERSION, SERVER_NAME } from './dispatcher';

let unregister: (() => void) | null = null;

function debug(msg: string, level: number = 3): void {
  try {
    (Zotero as any).debug('[deepread:mcp] ' + msg, level);
  } catch {
  }
}

export function registerMcpHost(): void {
  if (unregister) return;
  if (!Prefs.getMcpEnabled()) {
    debug('disabled via prefs', 3);
    return;
  }
  try {
    unregister = registerHost({
      port: Prefs.getMcpPort(),
      pathPrefix: '/deepread/mcp',
      toolsProvider: () => BUILTIN_TOOLS,
    });
    debug('host registered on /deepread/mcp', 3);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debug('registerMcpHost failed: ' + msg, 1);
  }
}

export function unregisterMcpHost(): void {
  if (unregister) {
    try { unregister(); } catch {}
    unregister = null;
  }
}
