# Workflowy MCP Server

A Model Context Protocol (MCP) server that provides LLM access to Workflowy's API, enabling agents to interact with your Workflowy workspace programmatically.

## Features

This MCP server provides tools for:

- **Creating nodes**: Add new bullet points to your Workflowy outline
- **Reading nodes**: Retrieve node details and list children
- **Updating nodes**: Modify existing node content and properties
- **Deleting nodes**: Remove nodes from your outline
- **Moving nodes**: Reorganize your hierarchy
- **Completing tasks**: Mark nodes as complete/incomplete
- **Exporting**: Download your entire outline structure

## Installation

### For MCP Hive (BrainTrust Platform)

This server is designed to be onboarded directly to MCP Hive. The platform handles all setup automatically.

### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/workflowy-mcp-server.git
cd workflowy-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Set up environment variables:
```bash
export WORKFLOWY_API_KEY="your-api-key-here"
```

5. Run the server:
```bash
npm start
```

## Configuration

The server requires the following environment variable:

- `WORKFLOWY_API_KEY`: Your Workflowy API key (get it from the Workflowy API settings)

## Available Tools

### `workflowy_create_node`
Create a new node in your Workflowy outline.

### `workflowy_get_node`
Retrieve details about a specific node.

### `workflowy_list_nodes`
List child nodes under a parent node.

### `workflowy_update_node`
Modify an existing node's content or properties.

### `workflowy_delete_node`
Delete a node from your outline.

### `workflowy_move_node`
Move a node to a different location in the hierarchy.

### `workflowy_complete_node`
Mark a node as complete.

### `workflowy_uncomplete_node`
Mark a node as incomplete.

### `workflowy_export`
Export your entire Workflowy outline.

### `workflowy_list_targets`
List available shortcuts and system locations.

## API Reference

This server implements the [Workflowy API v1](https://beta.workflowy.com/api-reference/).

## License

MIT
