export type JsonSchema = {
  type: 'object';
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty = {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  default?: unknown;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export type ToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'json'; json: unknown }>;
  isError?: boolean;
};

export type RegisterMcpOptions = {
  port?: number;
  pathPrefix?: string;
  toolsProvider: () => ToolDefinition[];
};

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcError = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;
