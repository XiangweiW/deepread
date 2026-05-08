import { dispatch, JSON_RPC_ERRORS } from './dispatcher';
import type { JsonRpcResponse, RegisterMcpOptions } from './types';

const DEFAULT_PATH = '/deepread/mcp';
const PLUGIN_VERSION = '0.0.2';

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

type SendResponseCallback = (
  status: number,
  contentTypeOrHeaders?: string | Record<string, string>,
  body?: string,
) => void;

type SinglePartyRequest = {
  method?: string;
  pathname?: string;
  pathParams?: Record<string, string>;
  searchParams?: URLSearchParams;
  headers?: Record<string, string>;
  data?: unknown;
};

function debug(msg: string, level: number = 3): void {
  try {
    (Zotero as any).debug('[deepread:mcp] ' + msg, level);
  } catch {
  }
}

function jsonError(code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: null, error: { code, message } };
}

async function processBody(
  rawData: unknown,
  toolsProvider: () => RegisterMcpOptions['toolsProvider'] extends () => infer T ? T : never,
): Promise<JsonRpcResponse | null> {
  let parsed: unknown = rawData;
  if (typeof rawData === 'string') {
    try {
      parsed = JSON.parse(rawData);
    } catch (e) {
      return jsonError(JSON_RPC_ERRORS.PARSE_ERROR, 'Invalid JSON');
    }
  }
  if (parsed === null || parsed === undefined) {
    return jsonError(JSON_RPC_ERRORS.INVALID_REQUEST, 'Empty request body');
  }
  let tools: ReturnType<typeof toolsProvider>;
  try {
    tools = toolsProvider();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debug('toolsProvider threw: ' + msg, 1);
    return jsonError(JSON_RPC_ERRORS.INTERNAL_ERROR, 'tools provider failed: ' + msg);
  }
  return dispatch(parsed, tools, { serverVersion: PLUGIN_VERSION });
}

function buildEndpointClass(opts: RegisterMcpOptions): any {
  const provider = opts.toolsProvider;

  function Endpoint(this: any) {
  }

  Endpoint.prototype.supportedMethods = ['POST', 'OPTIONS'];
  Endpoint.prototype.supportedDataTypes = ['application/json'];
  Endpoint.prototype.permitBonjour = false;

  Endpoint.prototype.init = async function init(
    a: SinglePartyRequest | unknown,
    b?: SendResponseCallback,
  ): Promise<unknown> {
    if (typeof b === 'function') {
      const send = b as SendResponseCallback;
      try {
        const response = await processBody(a, provider as any);
        if (response === null) {
          send(204, CORS_HEADERS, '');
          return;
        }
        send(200, CORS_HEADERS, JSON.stringify(response));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        debug('init(2-arg) crashed: ' + msg, 1);
        send(
          500,
          CORS_HEADERS,
          JSON.stringify(jsonError(JSON_RPC_ERRORS.INTERNAL_ERROR, msg)),
        );
      }
      return;
    }

    const reqObj = (a as SinglePartyRequest) || {};
    const method = (reqObj.method || 'POST').toUpperCase();
    if (method === 'OPTIONS') {
      return [200, CORS_HEADERS, ''];
    }
    try {
      const response = await processBody(reqObj.data, provider as any);
      if (response === null) {
        return [204, CORS_HEADERS, ''];
      }
      return [200, CORS_HEADERS, JSON.stringify(response)];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      debug('init(1-arg) crashed: ' + msg, 1);
      return [
        500,
        CORS_HEADERS,
        JSON.stringify(jsonError(JSON_RPC_ERRORS.INTERNAL_ERROR, msg)),
      ];
    }
  };

  return Endpoint;
}

export function registerMcpHost(opts: RegisterMcpOptions): () => void {
  const path = opts.pathPrefix || DEFAULT_PATH;
  const endpoints = (Zotero as any)?.Server?.Endpoints;
  if (!endpoints) {
    debug('Zotero.Server.Endpoints not available — cannot register MCP host', 1);
    return () => {};
  }
  if (endpoints[path]) {
    debug('endpoint already registered at ' + path + ' — replacing', 2);
  }
  const EndpointClass = buildEndpointClass(opts);
  endpoints[path] = EndpointClass;
  debug('registered endpoint at ' + path, 3);

  return function unregister(): void {
    try {
      if (endpoints[path] === EndpointClass) {
        delete endpoints[path];
        debug('unregistered endpoint at ' + path, 3);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      debug('unregister failed: ' + msg, 1);
    }
  };
}
