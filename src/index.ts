#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

// Workflowy API client with smart caching
class WorkflowyClient {
  private client: AxiosInstance;
  private apiKey: string;
  private nodeCache: {
    data: any[] | null;
    timestamp: number | null;
    ttl: number;
  };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: "https://beta.workflowy.com/api/v1",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // Cache configuration: 90 seconds (safe margin under 1 req/min limit)
    // Can be overridden with WORKFLOWY_CACHE_TTL env var
    const cacheTTL = process.env.WORKFLOWY_CACHE_TTL
      ? parseInt(process.env.WORKFLOWY_CACHE_TTL)
      : 90000;

    this.nodeCache = {
      data: null,
      timestamp: null,
      ttl: cacheTTL,
    };

    console.error(`[Cache] Initialized with TTL: ${cacheTTL}ms (${cacheTTL / 1000}s)`);
  }

  // Get all nodes with smart caching (respects 1 req/min rate limit)
  async getAllNodes(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    const cacheAge = this.nodeCache.timestamp ? now - this.nodeCache.timestamp : Infinity;

    // Use cache if it's fresh enough and not forcing refresh
    if (this.nodeCache.data && cacheAge < this.nodeCache.ttl && !forceRefresh) {
      console.error(`[Cache] Using cached nodes (age: ${Math.round(cacheAge / 1000)}s)`);
      return this.nodeCache.data;
    }

    // Try to refresh cache
    try {
      console.error("[Cache] Fetching fresh data from /nodes-export...");
      const response = await this.client.get("/nodes-export");
      const nodes = response.data.nodes || [];
      this.nodeCache.data = nodes;
      this.nodeCache.timestamp = now;
      console.error(`[Cache] Loaded ${nodes.length} nodes`);
      return nodes;
    } catch (error: any) {
      if (error.response?.status === 429) {
        // Rate limited!
        const retryAfter = error.response.data?.retry_after || 60;
        if (this.nodeCache.data) {
          // Use stale cache as fallback
          console.error(
            `[Cache] Rate limited (retry in ${retryAfter}s), using stale cache (age: ${Math.round(cacheAge / 1000)}s)`
          );
          return this.nodeCache.data;
        }
        throw new Error(
          `Rate limited by Workflowy API. Please wait ${retryAfter} seconds before trying again.`
        );
      }
      throw error;
    }
  }

  // Invalidate cache when data changes
  private invalidateCache() {
    if (this.nodeCache.data) {
      console.error("[Cache] Invalidating cache due to data modification");
    }
    this.nodeCache.data = null;
    this.nodeCache.timestamp = null;
  }

  // Search nodes across entire hierarchy
  async searchNodes(
    query: string,
    options?: {
      searchName?: boolean;
      searchNote?: boolean;
      caseSensitive?: boolean;
      maxResults?: number;
    }
  ): Promise<any[]> {
    const {
      searchName = true,
      searchNote = true,
      caseSensitive = false,
      maxResults = 100,
    } = options || {};

    const allNodes = await this.getAllNodes();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const results = allNodes.filter((node) => {
      if (searchName && node.name) {
        const name = caseSensitive ? node.name : node.name.toLowerCase();
        if (name.includes(searchQuery)) return true;
      }
      if (searchNote && node.note) {
        const note = caseSensitive ? node.note : node.note.toLowerCase();
        if (note.includes(searchQuery)) return true;
      }
      return false;
    });

    return results.slice(0, maxResults);
  }

  // Get node with its children (uses cache for efficiency)
  async getNodeWithChildren(nodeId: string, depth = 1): Promise<any> {
    const allNodes = await this.getAllNodes();
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

    const node = nodeMap.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Clone the node to avoid modifying cache
    const result = { ...node };

    // Add children if depth > 0
    if (depth > 0) {
      const children = allNodes.filter((n) => n.parent_id === nodeId);
      result.children = children.map((child) => ({ ...child }));

      // Recursively get children's children
      if (depth > 1) {
        for (const child of result.children) {
          const childWithDescendants = await this.getNodeWithChildren(child.id, depth - 1);
          Object.assign(child, childWithDescendants);
        }
      }
    }

    return result;
  }

  async createNode(params: {
    parentId?: string;
    name: string;
    note?: string;
    priority?: number;
    layoutMode?: string;
  }) {
    // Convert to API format (snake_case and nested data)
    const apiParams: any = {
      name: params.name,
    };
    if (params.parentId) apiParams.parent_id = params.parentId;
    if (params.note) apiParams.note = params.note;
    if (params.priority !== undefined) apiParams.priority = params.priority;
    if (params.layoutMode) {
      apiParams.data = { layoutMode: params.layoutMode };
    }

    const response = await this.client.post("/nodes", apiParams);
    this.invalidateCache();
    return response.data;
  }

  async getNode(nodeId: string) {
    const response = await this.client.get(`/nodes/${nodeId}`);
    return response.data;
  }

  async listNodes(parentId?: string) {
    const response = await this.client.get("/nodes", {
      params: parentId ? { parent_id: parentId } : {},
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
    // Convert to API format (snake_case and nested data)
    const apiParams: any = {};
    if (params.name !== undefined) apiParams.name = params.name;
    if (params.note !== undefined) apiParams.note = params.note;
    if (params.priority !== undefined) apiParams.priority = params.priority;
    if (params.layoutMode) {
      apiParams.data = { layoutMode: params.layoutMode };
    }

    const response = await this.client.post(`/nodes/${nodeId}`, apiParams);
    this.invalidateCache();
    return response.data;
  }

  async deleteNode(nodeId: string) {
    const response = await this.client.delete(`/nodes/${nodeId}`);
    this.invalidateCache();
    return response.data;
  }

  async moveNode(nodeId: string, parentId: string, priority?: number) {
    const apiParams: any = {
      parent_id: parentId,
    };
    if (priority !== undefined) apiParams.priority = priority;

    const response = await this.client.post(`/nodes/${nodeId}/move`, apiParams);
    this.invalidateCache();
    return response.data;
  }

  async completeNode(nodeId: string) {
    const response = await this.client.post(`/nodes/${nodeId}/complete`);
    this.invalidateCache();
    return response.data;
  }

  async uncompleteNode(nodeId: string) {
    const response = await this.client.post(`/nodes/${nodeId}/uncomplete`);
    this.invalidateCache();
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
        name: "workflowy_search",
        description:
          "Search for nodes by text content across your ENTIRE Workflowy outline (all nodes including deeply nested children). Returns matching nodes with their IDs and parent relationships. Use this to find nodes anywhere in your hierarchy.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Text to search for in node names and notes",
            },
            searchName: {
              type: "boolean",
              description: "Search in node names (default: true)",
            },
            searchNote: {
              type: "boolean",
              description: "Search in node notes (default: true)",
            },
            caseSensitive: {
              type: "boolean",
              description: "Case-sensitive search (default: false)",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 100)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "workflowy_get_node_hierarchy",
        description:
          "Get a node with its children and descendants to see the full context and structure around it. Useful after finding a node via search to understand where it lives in your outline.",
        inputSchema: {
          type: "object",
          properties: {
            nodeId: {
              type: "string",
              description: "ID of the node to retrieve with its hierarchy",
            },
            depth: {
              type: "number",
              description:
                "How many levels of children to include (0 = just the node, 1 = node + direct children, 2 = node + children + grandchildren, etc.). Default: 1, Max: 5",
              minimum: 0,
              maximum: 5,
            },
          },
          required: ["nodeId"],
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

      case "workflowy_search": {
        const { query, searchName, searchNote, caseSensitive, maxResults } = args as {
          query: string;
          searchName?: boolean;
          searchNote?: boolean;
          caseSensitive?: boolean;
          maxResults?: number;
        };
        const results = await workflowy.searchNodes(query, {
          searchName,
          searchNote,
          caseSensitive,
          maxResults,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  resultCount: results.length,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "workflowy_get_node_hierarchy": {
        const { nodeId, depth } = args as { nodeId: string; depth?: number };
        const result = await workflowy.getNodeWithChildren(nodeId, depth || 1);
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
