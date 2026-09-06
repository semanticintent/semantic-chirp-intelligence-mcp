/** Builds an MCP Server from the registry. stdio wraps one for the process; the Worker builds one per request. */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_DEFINITIONS, callTool } from './tools.js';
import { getVersion } from './version.js';

export function createChirpServer(): Server {
  const server = new Server(
    { name: "semantic-chirp-intelligence-mcp", version: getVersion() },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => callTool(request.params.name, request.params.arguments));
  return server;
}
