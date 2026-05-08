import { createInterface } from 'node:readline';

type JsonRpcId = string | number | null;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface CliOptions {
  host: string;
  port: number;
  path: string;
}

const HELP_TEXT = `deepread-mcp — stdio<->HTTP bridge for the DeepRead Zotero plugin

Usage: deepread-mcp [options]

Options:
  --host <host>   Host the Zotero plugin listens on (default: 127.0.0.1)
  --port <port>   Port the Zotero plugin listens on (default: 23119)
  --path <path>   HTTP path for the MCP endpoint   (default: /deepread/mcp)
  -h, --help      Show this help text

Environment overrides:
  DEEPREAD_MCP_HOST, DEEPREAD_MCP_PORT, DEEPREAD_MCP_PATH

The bridge reads newline-delimited JSON-RPC requests from stdin, forwards each
as an HTTP POST to the DeepRead plugin, and writes the JSON response back to
stdout (one JSON object per line). Notifications (no "id" field) get no
response written to stdout, but are still forwarded so the plugin can update
its state.
`;

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    host: process.env.DEEPREAD_MCP_HOST ?? '127.0.0.1',
    port: Number(process.env.DEEPREAD_MCP_PORT ?? 23119),
    path: process.env.DEEPREAD_MCP_PATH ?? '/deepread/mcp',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    } else if (arg === '--host') {
      opts.host = argv[++i] ?? opts.host;
    } else if (arg === '--port') {
      opts.port = Number(argv[++i] ?? opts.port);
    } else if (arg === '--path') {
      opts.path = argv[++i] ?? opts.path;
    } else {
      process.stderr.write(`deepread-mcp: unknown argument "${arg}"\n${HELP_TEXT}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(opts.port) || opts.port <= 0) {
    process.stderr.write(`deepread-mcp: invalid --port "${opts.port}"\n`);
    process.exit(2);
  }
  if (!opts.path.startsWith('/')) {
    opts.path = `/${opts.path}`;
  }
  return opts;
}

function buildEndpoint(opts: CliOptions): string {
  return `http://${opts.host}:${opts.port}${opts.path}`;
}

function writeFrame(message: JsonRpcMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function isNotification(req: JsonRpcMessage): boolean {
  return req.id === undefined || req.id === null;
}

function unreachableError(id: JsonRpcId, endpoint: string): JsonRpcMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message:
        `DeepRead Zotero plugin is not reachable at ${endpoint}. ` +
        `Make sure Zotero is running with the DeepRead plugin installed and ` +
        `'Enable MCP server' turned on in Settings → DeepRead.`,
    },
  };
}

function transportError(id: JsonRpcId, endpoint: string, reason: string): JsonRpcMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32001,
      message: `DeepRead bridge transport error talking to ${endpoint}: ${reason}`,
    },
  };
}

function parseError(id: JsonRpcId, reason: string): JsonRpcMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32700,
      message: `Parse error: ${reason}`,
    },
  };
}

function isConnRefused(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED';
}

async function forward(req: JsonRpcMessage, endpoint: string): Promise<JsonRpcMessage | null> {
  const id: JsonRpcId = req.id ?? null;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch (err) {
    if (isNotification(req)) return null;
    if (isConnRefused(err)) return unreachableError(id, endpoint);
    return transportError(id, endpoint, err instanceof Error ? err.message : String(err));
  }

  const text = await res.text().catch(() => '');

  if (isNotification(req)) return null;

  if (!res.ok) {
    return transportError(id, endpoint, `HTTP ${res.status} ${res.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  if (!text) return null;

  try {
    return JSON.parse(text) as JsonRpcMessage;
  } catch (err) {
    return parseError(id, `invalid JSON from plugin: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const endpoint = buildEndpoint(opts);

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));

  const pending = new Set<Promise<void>>();

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    let req: JsonRpcMessage;
    try {
      req = JSON.parse(line) as JsonRpcMessage;
    } catch (err) {
      writeFrame(parseError(null, err instanceof Error ? err.message : String(err)));
      continue;
    }

    const task = (async () => {
      const response = await forward(req, endpoint);
      if (response !== null) writeFrame(response);
    })();
    pending.add(task);
    task.finally(() => pending.delete(task));
  }

  await Promise.allSettled(pending);
}

main().catch((err) => {
  process.stderr.write(`deepread-mcp: fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
