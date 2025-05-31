#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, CallToolResult, JSONRPCRequest, JSONRPCResponse, ListToolsRequestSchema, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { initialTools } from './initial_tools.js';

const CACHE_DIR = path.join(os.homedir(), '.vscode-as-mcp-relay-cache');
const TOOLS_CACHE_FILE = path.join(CACHE_DIR, 'tools-list-cache.json');
const MAX_RETRIES = 3;
const RETRY_INTERVAL = 1000; // 1 second

class MCPRelay {
  private mcpServer: McpServer;
  constructor(readonly serverUrl: string) {
    this.mcpServer = new McpServer({
      name: 'vscode-as-mcp',
      version: '0.0.1',
    }, {
      capabilities: {
        tools: {},
      },
    });

    // Periodically call listTools to update the tools list
    setInterval(async () => {
      let tools: any[];
      try {
        const resp = await this.requestWithRetry(this.serverUrl, JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: Math.floor(Math.random() * 1000000),
        } as JSONRPCRequest));
        const parsedResponse = resp as JSONRPCResponse;
        tools = this.fixToolSchemas(parsedResponse.result.tools as any[]);
      } catch (err) {
        return;
      }

      const cachedTools = await this.getToolsCache();

      // Compare the fetched tools with the cached ones
      if (cachedTools && cachedTools.length === tools.length) {
        console.error('Fetched tools list is the same as the cached one, not updating cache');
        return { tools: cachedTools };
      }

      // Notify to user that tools have been updated and restart the client
      try {
        await this.requestWithRetry(this.serverUrl + '/notify-tools-updated', '');
      } catch (err) {
        console.error(`Failed to notify tools updated: ${(err as Error).message}`);
      }

      try {
        await this.saveToolsCache(tools);
      } catch (cacheErr) {
        console.error(`Failed to cache tools response: ${(cacheErr as Error).message}`);
      }
    }, 30000); // every 30 seconds

    this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request): Promise<ListToolsResult> => {
      const cachedTools = await this.getToolsCache() ?? initialTools;

      let tools: any[];
      try {
        const response = await this.requestWithRetry(this.serverUrl, JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: request.params,
          id: Math.floor(Math.random() * 1000000),
        } as JSONRPCRequest));
        const parsedResponse = response as JSONRPCResponse;
        tools = this.fixToolSchemas(parsedResponse.result.tools as any[]);
      } catch (err) {
        console.error(`Failed to fetch tools list: ${(err as Error).message}`);
        return { tools: cachedTools as any[] };
      }

      // Update cache
      try {
        await this.saveToolsCache(tools);
      } catch (cacheErr) {
        console.error(`Failed to cache tools response: ${(cacheErr as Error).message}`);
      }

      return { tools };
    });

    this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      try {
        const response = await this.requestWithRetry(this.serverUrl, JSON.stringify({
          jsonrpc: '2.0',
          method: request.method,
          params: request.params,
          id: Math.floor(Math.random() * 1000000),
        } as JSONRPCRequest));
        const parsedResponse = response as JSONRPCResponse;
        return parsedResponse.result as any;
      } catch (e) {
        console.error(`Failed to call tool: ${(e as Error).message}`);
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Failed to communicate with the VSCode as MCP Extension. Please ensure that the VSCode Extension is installed and that "MCP Server" is displayed in the status bar.`,
          }],
        };
      }
    });
  }
  // キャッシュディレクトリの初期化
  async initCacheDir(): Promise<void> {
    try {
      // ディレクトリが存在しない場合は作成
      try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }
    } catch (err) {
      console.error(`Failed to initialize cache directory: ${(err as Error).message}`);
    }
  }

  // キャッシュの保存
  async saveToolsCache(tools: any[]): Promise<void> {
    await this.initCacheDir();
    try {
      await fs.writeFile(TOOLS_CACHE_FILE, JSON.stringify(tools), 'utf8');
      console.error('Tools list cache saved');
    } catch (err) {
      console.error(`Failed to save cache: ${(err as Error).message}`);
    }
  }

  async getToolsCache() {
    try {
      await fs.access(TOOLS_CACHE_FILE);
      const cacheData = await fs.readFile(TOOLS_CACHE_FILE, 'utf8');
      return JSON.parse(cacheData) as any[];
    } catch (err) {
      console.error(`Failed to load cache file: ${(err as Error).message}`);
      return null;
    }
  }

  async requestWithRetry(url: string, body: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.error(`Retry attempt ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: body,
        });

        const responseText = await response.text();

        // Only status codes >= 500 are errors
        if (response.status >= 500) {
          lastError = new Error(`Request failed with status ${response.status}: ${responseText}`);
          continue;
        }

        return JSON.parse(responseText);
      } catch (err) {
        lastError = err as Error;
      }
    }

    throw new Error(`All retry attempts failed: ${lastError?.message}`);
  }

  // Fix tool schemas to ensure JSON Schema 2020-12 compatibility
  private fixToolSchemas(tools: any[]): any[] {
    return tools.map(tool => {
      if (tool.inputSchema) {
        // Ensure schema has the correct $schema field
        if (!tool.inputSchema.$schema) {
          tool.inputSchema.$schema = "https://json-schema.org/draft/2020-12/schema";
        } else if (tool.inputSchema.$schema.includes('draft-07')) {
          tool.inputSchema.$schema = "https://json-schema.org/draft/2020-12/schema";
        }
      } else {
        // Add default schema if missing entirely
        tool.inputSchema = {
          type: "object",
          properties: {},
          additionalProperties: false,
          $schema: "https://json-schema.org/draft/2020-12/schema"
        };
      }
      return tool;
    });
  }

  start() {
    return this.mcpServer.connect(new StdioServerTransport());
  }
};

// コマンドライン引数の解析
function parseArgs() {
  const args = process.argv.slice(2);
  
  // Default to Windows host IP for WSL environments
  let serverUrl = 'http://10.255.255.254:60100';
  
  // Check if we're in WSL and get the Windows host IP dynamically
  try {
    const fs = require('fs');
    const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const hostIpMatch = resolvConf.match(/nameserver\s+(\d+\.\d+\.\d+\.\d+)/);
    if (hostIpMatch) {
      serverUrl = `http://${hostIpMatch[1]}:60100`;
    }
    // Try alternative common WSL IPs if resolv.conf doesn't work
    if (!hostIpMatch) {
      // Common WSL bridge IPs
      const commonIPs = ['172.18.64.1', '172.19.0.1', '172.23.48.1'];
      serverUrl = `http://${commonIPs[0]}:60100`; // Use first as default
    }
  } catch (err) {
    // If we can't read resolv.conf, fall back to localhost (non-WSL environment)
    serverUrl = 'http://localhost:60100';
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server-url' && i + 1 < args.length) {
      serverUrl = args[i + 1];
      i++;
    }
  }

  return { serverUrl };
}

try {
  const { serverUrl } = parseArgs();
  const relay = new MCPRelay(serverUrl);
  await relay.start();
} catch (err) {
  console.error(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
}
