#!/usr/bin/env node

/**
 * Test the new search functionality
 */

const { spawn } = require('child_process');
const path = require('path');

const API_KEY = process.env.WORKFLOWY_API_KEY || 'd393f0222886161c1ec1ba36f4ea1978d32f368a';

// Start the MCP server
const serverPath = path.join(__dirname, 'build', 'index.js');
const server = spawn('node', [serverPath], {
  env: { ...process.env, WORKFLOWY_API_KEY: API_KEY },
  stdio: ['pipe', 'pipe', 'inherit']
});

let requestId = 1;

function sendRequest(method, params) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params,
  };

  console.log('\n📤 Sending:', JSON.stringify(request, null, 2));
  server.stdin.write(JSON.stringify(request) + '\n');
}

let buffer = '';
server.stdout.on('data', (data) => {
  buffer += data.toString();

  // Try to parse complete JSON messages
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('\n📥 Received:', JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('\n📄 Output:', line);
      }
    }
  }
});

// Wait for server to initialize
setTimeout(() => {
  console.log('\n=== Testing Workflowy Search ===\n');

  // Test 1: List tools to see new search tools
  console.log('Test 1: List available tools');
  sendRequest('tools/list', {});

  setTimeout(() => {
    // Test 2: Search for "Rubric"
    console.log('\n\nTest 2: Search for "Rubric"');
    sendRequest('tools/call', {
      name: 'workflowy_search',
      arguments: {
        query: 'Rubric',
        maxResults: 5
      }
    });

    setTimeout(() => {
      // Test 3: Search for "test" (more common)
      console.log('\n\nTest 3: Search for "test"');
      sendRequest('tools/call', {
        name: 'workflowy_search',
        arguments: {
          query: 'test',
          maxResults: 10
        }
      });

      setTimeout(() => {
        console.log('\n\n=== Tests Complete ===');
        server.kill();
        process.exit(0);
      }, 3000);
    }, 3000);
  }, 2000);
}, 1000);

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

server.on('exit', (code) => {
  console.log(`\nServer exited with code ${code}`);
});
