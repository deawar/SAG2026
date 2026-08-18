/** @jest-environment jsdom */
// Minimal: assert the module no longer references localStorage auth_token.
const fs = require('fs');
const path = require('path');
test('websocket-client no longer reads auth_token from localStorage', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../../public/js/websocket-client.js'), 'utf8');
  expect(src).not.toMatch(/localStorage\.getItem\(['"]auth_token['"]\)/);
});
