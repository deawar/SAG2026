'use strict';
/**
 * Brand-recognition regression lock: every public page carries the SAGLive
 * wordmark and a favicon, and the CSS actually SHOWS the logo (it was once
 * hidden by `.logo-img { display: none; }` — this test keeps that fixed).
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../../../public');

const pages = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));

describe('site branding (logo + favicon on every page)', () => {
  test('found the public pages', () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  test.each(pages)('%s references the SAGLive logo', (page) => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
    expect(html).toContain('/images/logo/SAGLive.png');
  });

  test.each(pages)('%s links a favicon', (page) => {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, page), 'utf8');
    expect(html).toMatch(/rel="icon"[^>]*href="\/favicon/);
  });

  test('main.css displays the logo image (not hidden)', () => {
    const css = fs.readFileSync(path.join(PUBLIC_DIR, 'css', 'main.css'), 'utf8');
    const logoRule = css.match(/\.logo-img\s*\{[^}]*\}/);
    expect(logoRule).toBeTruthy();
    expect(logoRule[0]).toMatch(/display:\s*block/);
    expect(logoRule[0]).not.toMatch(/display:\s*none/);
  });

  test('the logo asset exists', () => {
    expect(fs.existsSync(path.join(PUBLIC_DIR, 'images', 'logo', 'SAGLive.png'))).toBe(true);
  });
});
