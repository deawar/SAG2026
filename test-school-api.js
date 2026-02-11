#!/usr/bin/env node
/**
 * Test script for Public School API
 */

require('dotenv').config();
const http = require('http');

const app = require('./src/app');
const { createServer } = require('./src/index');

async function testAPI() {
  console.log('Starting test server...\n');
  
  // Start the server
  const server = http.createServer(app);
  server.listen(3001, async () => {
    console.log('✓ Test server started on port 3001');
    
    // Give it a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test endpoints
    try {
      console.log('\n📚 Testing School API Endpoints:\n');
      
      // Test 1: GET /api/schools
      console.log('1. GET /api/schools - List all schools');
      const res1 = await makeRequest('GET', 'http://localhost:3001/api/schools');
      console.log(`   Status: ${res1.statusCode}`);
      console.log(`   Response preview: ${JSON.stringify(res1.data).substring(0, 100)}...\n`);
      
      // Test 2: GET /api/schools/search/:query
      console.log('2. GET /api/schools/search/Lincoln');
      const res2 = await makeRequest('GET', 'http://localhost:3001/api/schools/search/Lincoln');
      console.log(`   Status: ${res2.statusCode}`);
      console.log(`   Response preview: ${JSON.stringify(res2.data).substring(0, 100)}...\n`);
      
      // Test 3: GET /api/schools/by-state/:state
      console.log('3. GET /api/schools/by-state/IL');
      const res3 = await makeRequest('GET', 'http://localhost:3001/api/schools/by-state/IL');
      console.log(`   Status: ${res3.statusCode}`);
      console.log(`   Response preview: ${JSON.stringify(res3.data).substring(0, 100)}...\n`);
      
      // Test 4: GET /api/schools/states
      console.log('4. GET /api/schools/states - List all states');
      const res4 = await makeRequest('GET', 'http://localhost:3001/api/schools/states');
      console.log(`   Status: ${res4.statusCode}`);
      console.log(`   Response preview: ${JSON.stringify(res4.data).substring(0, 100)}...\n`);
      
      console.log('✅ All API tests completed!');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

function makeRequest(method, url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: JSON.parse(data)
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

testAPI();
