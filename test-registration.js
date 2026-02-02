#!/usr/bin/env node

/**
 * Comprehensive registration and login test
 * Run this while server is running in background
 */

const http = require('http');

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log('\n📋 AUTH ENDPOINT TEST\n');
  
  const testEmail = `user-${Date.now()}@example.com`;
  const testPassword = 'ValidPass@12345';

  try {
    // Test 1: Registration
    console.log('1️⃣  Testing Registration...');
    const reg = await request('POST', '/api/auth/register', {
      email: testEmail,
      password: testPassword,
      firstName: 'Test',
      lastName: 'User'
    });
    
    console.log(`   Status: ${reg.status}`);
    if (reg.status === 201) {
      console.log('   ✅ WORKING - User created successfully');
      console.log(`   Response:`, reg.body?.data ? `User ID: ${reg.body.data.id}` : reg.body);
    } else if (reg.status === 501) {
      console.log('   ❌ BROKEN - Still returns 501 Not Implemented');
    } else {
      console.log(`   ⚠️  Got status ${reg.status}`);
      console.log(`   Response:`, reg.body);
    }

    // Test 2: Login (if registration worked)
    if (reg.status === 201) {
      console.log('\n2️⃣  Testing Login...');
      const login = await request('POST', '/api/auth/login', {
        email: testEmail,
        password: testPassword
      });
      
      console.log(`   Status: ${login.status}`);
      if (login.status === 200) {
        console.log('   ✅ WORKING - Login successful');
        const hasToken = login.body?.data?.accessToken ? 'with JWT token' : 'without token';
        console.log(`   Response: ${hasToken}`);
      } else if (login.status === 501) {
        console.log('   ❌ BROKEN - Still returns 501 Not Implemented');
      } else {
        console.log(`   ⚠️  Got status ${login.status}`);
        console.log(`   Response:`, login.body);
      }
    }

    console.log('\n✨ Test complete!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.log('Make sure server is running: npm start\n');
  }
}

test();
