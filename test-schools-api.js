/**
 * Test script for Public Schools API
 */

const http = require('http');

function testAPI(path, description) {
  return new Promise((resolve) => {
    console.log(`\n🔍 Testing: ${description}`);
    console.log(`   Path: ${path}`);
    
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`   Status: ${res.statusCode}`);
        try {
          const json = JSON.parse(data);
          console.log(`   Success: ${json.success}`);
          if (json.data && Array.isArray(json.data)) {
            console.log(`   Count: ${json.count || json.data.length}`);
            if (json.data.length > 0) {
              console.log(`   Sample: ${JSON.stringify(json.data[0], null, 2).substring(0, 150)}`);
            }
          } else if (json.message) {
            console.log(`   Message: ${json.message}`);
          }
          resolve(true);
        } catch (e) {
          console.log(`   ❌ Parse error: ${e.message}`);
          console.log(`   Response: ${data.substring(0, 300)}`);
          resolve(false);
        }
      });
    }).on('error', (e) => {
      console.log(`   ❌ Connection error: ${e.message}`);
      resolve(false);
    });
  });
}

async function runTests() {
  console.log(`
╔════════════════════════════════════════════╗
║   Public Schools API Test Suite            ║
║   Testing: /api/schools endpoints          ║
╚════════════════════════════════════════════╝
  `);

  const tests = [
    ['/api/schools', 'GET /api/schools - List all schools'],
    ['/api/schools/states', 'GET /api/schools/states - List all states'],
    ['/api/schools/by-state/IL', 'GET /api/schools/by-state/IL - Schools in Illinois'],
    ['/api/schools/search/Lincoln', 'GET /api/schools/search/Lincoln - Search for Lincoln'],
  ];

  for (const [path, desc] of tests) {
    await testAPI(path, desc);
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  console.log(`\n✅ Test suite complete!\n`);
  process.exit(0);
}

// Wait for server to be ready
setTimeout(() => {
  runTests();
}, 1000);
