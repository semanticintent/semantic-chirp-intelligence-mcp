#!/usr/bin/env node
/**
 * ChirpIQX over stdio — the local face, for Claude Desktop, Codex, and any MCP client that spawns a process.
 * The tools live in src/tools.ts; the hosted face is src/edge.ts. This file only connects the transport.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createChirpServer } from './server.js';
import { getVersion } from './version.js';

async function main() {
  const server = createChirpServer();
  await server.connect(new StdioServerTransport());
  console.error(`🏒❄️ Semantic Chirp Intelligence MCP v${getVersion()} - ICE is ON! (Real schedule, real stats)`);
}

main().catch(console.error);
