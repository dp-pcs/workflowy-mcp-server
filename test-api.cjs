#!/usr/bin/env node

// Quick test script to verify Workflowy API integration
const axios = require('axios');

const apiKey = process.env.WORKFLOWY_API_KEY;
if (!apiKey) {
  console.error('Error: WORKFLOWY_API_KEY environment variable is required');
  process.exit(1);
}

const client = axios.create({
  baseURL: 'https://beta.workflowy.com/api/v1',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});

async function test() {
  try {
    console.log('\n=== Testing Workflowy API Integration ===\n');

    // Test 1: List nodes
    console.log('1. Listing root nodes...');
    const listResponse = await client.get('/nodes');
    console.log(`✓ Found ${listResponse.data.nodes.length} root nodes`);
    console.log('Sample node:', JSON.stringify(listResponse.data.nodes[0], null, 2));

    // Test 2: Create a node
    console.log('\n2. Creating a test node...');
    const createResponse = await client.post('/nodes', {
      name: 'MCP Server Test Node',
      note: 'Created by test script',
      data: { layoutMode: 'bullets' }
    });
    const newNodeId = createResponse.data.item_id;
    console.log(`✓ Created node with ID: ${newNodeId}`);

    // Test 3: Get the node
    console.log('\n3. Getting node details...');
    const getResponse = await client.get(`/nodes/${newNodeId}`);
    console.log('✓ Node details:', JSON.stringify(getResponse.data.node, null, 2));

    // Test 4: Update the node
    console.log('\n4. Updating node...');
    const updateResponse = await client.post(`/nodes/${newNodeId}`, {
      name: 'Updated MCP Server Test Node',
      note: 'Updated by test script'
    });
    console.log('✓ Update response:', updateResponse.data);

    // Test 5: Delete the node
    console.log('\n5. Deleting test node...');
    const deleteResponse = await client.delete(`/nodes/${newNodeId}`);
    console.log('✓ Delete response:', deleteResponse.data);

    console.log('\n=== All tests passed! ===\n');
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

test();
