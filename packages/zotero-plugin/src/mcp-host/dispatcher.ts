import type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  ToolDefinition,
  ToolResult,
} from './types';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_NAME = 'deepread';

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export type DispatchContext = {
  serverVersion: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

export function validateRequest(value: unknown): { ok: true; req: JsonRpcRequest } | { ok: false; error: { code: number; message: string }; id: JsonRpcId } {
  if (!isPlainObject(value)) {
    return { ok: false, error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'Request must be a JSON object' }, id: null };
  }
  const id: JsonRpcId = isValidId(value.id) ? (value.id as JsonRpcId) : null;
  if (value.jsonrpc !== '2.0') {
    return { ok: false, error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'jsonrpc must be "2.0"' }, id };
  }
  if (typeof value.method !== 'string' || value.method.length === 0) {
    return { ok: false, error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'method must be a non-empty string' }, id };
  }
  if (value.id !== undefined && !isValidId(value.id)) {
    return { ok: false, error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: 'id must be string, number, or null' }, id: null };
  }
  return {
    ok: true,
    req: {
      jsonrpc: '2.0',
      id: value.id as JsonRpcId | undefined,
      method: value.method,
      params: value.params,
    },
  };
}

function success(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

function normalizeToolResult(raw: unknown): ToolResult {
  if (isPlainObject(raw) && Array.isArray((raw as ToolResult).content)) {
    return raw as ToolResult;
  }
  return {
    content: [{ type: 'json', json: raw }],
  };
}

export async function dispatch(
  raw: unknown,
  tools: ToolDefinition[],
  ctx: DispatchContext,
): Promise<JsonRpcResponse | null> {
  const validated = validateRequest(raw);
  if (!validated.ok) {
    return error(validated.id, validated.error.code, validated.error.message);
  }
  const req = validated.req;
  const id: JsonRpcId = req.id === undefined ? null : req.id;

  try {
    switch (req.method) {
      case 'initialize': {
        if (isNotification(req)) return null;
        return success(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: ctx.serverVersion },
        });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress': {
        return null;
      }
      case 'ping': {
        if (isNotification(req)) return null;
        return success(id, {});
      }
      case 'tools/list': {
        if (isNotification(req)) return null;
        const list = tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return success(id, { tools: list });
      }
      case 'tools/call': {
        if (isNotification(req)) return null;
        const params = isPlainObject(req.params) ? req.params : {};
        const name = typeof params.name === 'string' ? params.name : '';
        const args = isPlainObject(params.arguments) ? params.arguments : {};
        if (!name) {
          return error(id, JSON_RPC_ERRORS.INVALID_PARAMS, 'tools/call requires a name parameter');
        }
        const tool = tools.find((t) => t.name === name);
        if (!tool) {
          return error(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
        }
        try {
          const raw = await tool.handler(args);
          const result = normalizeToolResult(raw);
          return success(id, result);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return success(id, {
            content: [{ type: 'text', text: `Tool error: ${message}` }],
            isError: true,
          });
        }
      }
      default: {
        if (isNotification(req)) return null;
        return error(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${req.method}`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (isNotification(req)) return null;
    return error(id, JSON_RPC_ERRORS.INTERNAL_ERROR, message);
  }
}
