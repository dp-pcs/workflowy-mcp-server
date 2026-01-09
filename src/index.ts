#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// Workflowy API client
class WorkflowyClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: "https://beta.workflowy.com/api/v1",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createNode(params: {
    parentId?: string;
    name: string;
    note?: string;
    priority?: number;
    layoutMode?: string;
  }) {
    const response = await this.client.post("/nodes", params);
    return response.data;
  }

  async getNode(nodeId: string) {
    const response = await this.client.get(`/nodes/${nodeId}`);
    return response.data;
  }

  async listNodes(parentId?: string) {
    const response = await this.client.get("/nodes", {
      params: parentId ? { parentId } : {},
    });
    return response.data;
  }

  async updateNode(
    nodeId: string,
    params: {
      name?: string;
      note?: string;
      priority?: number;
      layoutMode?: string;
    }
  ) {
    const response = await this.client.post(`/nodes/${nodeId}`, params);
    return response.data;
  }

  async deleteNode(nodeId: string) {
    const response = await this.client.delete(`/nodes/${nodeId}`);
    return response.data;
  }

  async moveNode(nodeId: string, parentId: string, priority?: number) {
    const response = await this.client.post(`/nodes/${nodeId}/move`, {
      parentId,
      priority,
    });
    return response.data;
  }

  async completeNode(nodeId: string) {
    const response = await this.client.post(`/nodes/${nodeId}/complete`);
    return response.data;
  }

  async uncompleteNode(nodeId: string) {
    const response = await this.client.post(`/nodes/${nodeId}/uncomplete`);
    return response.data;
  }

  async exportNodes() {
    const response = await this.client.get("/nodes-export");
    return response.data;
  }

  async listTargets() {
    const response = await this.client.get("/targets");
    return response.data;
  }
}

// Create MCP server
const server = new Server(
  {
    name: "workflowy-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Get API key from environment
const apiKey = process.env.WORKFLOWY_API_KEY;
if (!apiKey) {
  console.error("Error: WORKFLOWY_API_KEY environment variable is required");
  process.exit(1);
}

const workflowy = new WorkflowyClient(apiKey);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "workflowy_create_node",
        description:
          "Create a new node (bullet point) in Workflowy. Can specify parent node, content, notes, and display mode.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The main text content of the node (supports markdown)",
            },
            parentId: {
              type: "string",
              description: "ID of the parent node (optional, defaults to root)",
            },
            note: {
              type: "string",
              description: "Optional extended description/notes for the node",
            },
            priority: {
              type: "number",
              description: "Sort order among siblings (optional)",
            },
            layoutMode: {
              type: "string",
              enum: ["bullets", "todo", "h1", "h2", "h3", "code-block", "quote-block"],
              description: "Display style for the node (optional)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "workflowy_get_node",
        description: "Retrieve details about a specific node by its ID.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to retrieve",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "workflowy_list_nodes",
        description:
          "List child nodes under a parent node. If no parentId is provided, lists root-level nodes.",
        inputSchema: {
          type: "object",
          properties: {
            parentId: {
              type: "string",
              description: "ID of the parent node (optional, defaults to root)",
            },
          },
        },
      },
      {
        name: "workflowy_update_node",
        description:
          "Update an existing node's content, notes, priority, or layout mode.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to update",
            },
            name: {
              type: "string",
              description: "Updated text content (optional)",
            },
            note: {
              type: "string",
              description: "Updated notes (optional)",
            },
            priority: {
              type: "number",
              description: "Updated sort order (optional)",
            },
            layoutMode: {
              type: "string",
              enum: ["bullets", "todo", "h1", "h2", "h3", "code-block", "quote-block"],
              description: "Updated display style (optional)",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "workflowy_delete_node",
        description: "Permanently delete a node and all its children.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to delete",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "workflowy_move_node",
        description:
          "Move a node to a different location in the hierarchy by changing its parent.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to move",
            },
            parentId: {
              type: "string",
              description: "ID of the new parent node",
            },
            priority: {
              type: "number",
              description: "Sort order in the new location (optional)",
            },
          },
          required: ["nodeId", "parentId"],
        },
      },
      {
        name: "workflowy_complete_node",
        description: "Mark a node as complete (for todo-style nodes).",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to mark complete",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "workflowy_uncomplete_node",
        description: "Mark a node as incomplete (for todo-style nodes).",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "The unique ID of the node to mark incomplete",
            },
          },
          required: ["nodeId"],
        },
      },
      {
        name: "workflowy_export",
        description:
          "Export your entire Workflowy outline structure. Limited to 1 request per minute.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "workflowy_list_targets",
        description: "List available shortcuts and system locations in Workflowy.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "workflowy_create_node": {
        const result = await workflowy.createNode(args as any);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_get_node": {
        const { nodeId } = args as { nodeId: string };
        const result = await workflowy.getNode(nodeId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_list_nodes": {
        const { parentId } = args as { parentId?: string };
        const result = await workflowy.listNodes(parentId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_update_node": {
        const { nodeId, ...updateParams } = args as any;
        const result = await workflowy.updateNode(nodeId, updateParams);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_delete_node": {
        const { nodeId } = args as { nodeId: string };
        const result = await workflowy.deleteNode(nodeId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_move_node": {
        const { nodeId, parentId, priority } = args as {
          nodeId: string;
          parentId: string;
          priority?: number;
        };
        const result = await workflowy.moveNode(nodeId, parentId, priority);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_complete_node": {
        const { nodeId } = args as { nodeId: string };
        const result = await workflowy.completeNode(nodeId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_uncomplete_node": {
        const { nodeId } = args as { nodeId: string };
        const result = await workflowy.uncompleteNode(nodeId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_export": {
        const result = await workflowy.exportNodes();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "workflowy_list_targets": {
        const result = await workflowy.listTargets();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      return {
        content: [
          {
            type: "text",
            text: `Workflowy API error (${status}): ${message}`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Workflowy MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
