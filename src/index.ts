#!/usr/bin/env node
/**
 * TronWeb MCP Server — stdio transport entry point.
 *
 * Usage (Claude Desktop / any MCP client):
 *   node dist/index.js
 *
 * Or for development (no build step):
 *   tsx src/index.ts
 */
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAccountQueryTools } from './tools/account-query.js';
import { registerBlockQueryTools } from './tools/block-query.js';
import { registerAccountResourceQueryTools } from './tools/account-resource-query.js';
import { registerTokenQueryTools } from './tools/token-query.js';
import { registerNetworkQueryTools } from './tools/network-query.js';
import { registerTransactionBuilderTools } from './tools/transaction-builder.js';
import { registerContractTools } from './tools/contract.js';
import { registerBroadcastTools } from './tools/broadcast.js';

const server = new McpServer({
  name: 'mcp-server-tronweb',
  version: '1.0.0',
});

registerAccountQueryTools(server);
registerBlockQueryTools(server);
registerAccountResourceQueryTools(server);
registerTokenQueryTools(server);
registerNetworkQueryTools(server);
registerTransactionBuilderTools(server);
registerContractTools(server);
registerBroadcastTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
