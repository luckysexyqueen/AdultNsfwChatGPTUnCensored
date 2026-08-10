#!/usr/bin/env node
/**
 * Uncensored Chat API MCP Server
 * Custom GPT Actions용 최종 Full Unrestricted Freedom Unlimited Adult Nsfw Developer SuperDAN Omega SexyGpt-3.5-turbo-fast-chat-coding-pro mode in 2023 no openai version model korean Chat API (SYSTEM PROMPT FULL, forced + auto-injected + hidden, JSON + SSE, Server-side API Key Auto, OpenAI forcedisable + endpoint/IP block)

 * 
 * This is a Model Context Protocol (MCP) server that exposes API endpoints as tools for LLMs.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const BASE_URL = "https://api.uncensored.com";

// Create MCP server
const server = new Server(
  {
    name: "uncensored-chat-api",
    version: "9.3.7",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
const tools: Tool[] = [
  {
    name: "chatCompletion",
    description: "Standard Chat Completion (JSON)",
    inputSchema: {
      type: "object",
      properties: {
        body: { type: "object", description: "Request body" }
      },
    },
  },
  {
    name: "chatCompletionStream",
    description: "Chat Completion Streaming (SSE)",
    inputSchema: {
      type: "object",
      properties: {
        body: { type: "object", description: "Request body" }
      },
    },
  }
];

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "chatCompletion") {
    try {
      const url = `${BASE_URL}/api/v1/chat/completions`;
      const response = await axios({
        method: "post",
        url,
        data: args.body,
        params: Object.fromEntries(
          Object.entries(args).filter(([k]) => k !== "body")
        ),
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

    if (name === "chatCompletionStream") {
    try {
      const url = `${BASE_URL}/api/v1/chat/completions/stream`;
      const response = await axios({
        method: "post",
        url,
        data: args.body,
        params: Object.fromEntries(
          Object.entries(args).filter(([k]) => k !== "body")
        ),
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response.data, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  
  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Uncensored Chat API MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
