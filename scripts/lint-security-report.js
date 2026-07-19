/**
 * lint-security-report.js — list the security/quality "code hole" findings that are
 * currently grandfathered in eslint-suppressions.json (the ratchet baseline).
 *
 * `npm run lint` hides these on purpose (they're baselined). This tool reads the
 * baseline directly and prints the security-relevant ones grouped by rule, so you can
 * see at a glance which holes remain to be fixed. For exact line numbers, run:
 *   npx eslint <file> --suppressions-location /dev/null
 *
 * Usage:  node scripts/lint-security-report.js [--all]
 *   --all   also include lower-signal rules (swallowed catches, fs-filename, etc.)
 *
 * Added 2026-07-19 alongside the security-lint hardening (see primer.md).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CORE = new Set([
  'security/detect-child-process',
  'security/detect-non-literal-regexp',
  'security/detect-unsafe-regex',
  'security/detect-eval-with-expression',
  'security/detect-pseudoRandomBytes',
  'security/detect-buffer-noassert',
  'security/detect-possible-timing-attacks',
  'sonarjs/super-linear-regex',
  'sonarjs/pseudo-random',
  'sonarjs/encryption-secure-mode',
  'sonarjs/no-clear-text-protocols',
  'sonarjs/content-security-policy',
  'sonarjs/no-control-regex',
  'sonarjs/no-all-duplicated-branches',
  'sonarjs/no-gratuitous-expressions',
  'no-eval',
  'no-implied-eval'
]);
const EXTRA = new Set([
  'security/detect-non-literal-fs-filename',
  'sonarjs/no-ignored-exceptions',
  'security/detect-object-injection'
]);

const showAll = process.argv.includes('--all');
const wanted = showAll ? new Set([...CORE, ...EXTRA]) : CORE;

const baselinePath = path.join(__dirname, '..', 'eslint-suppressions.json');
if (!fs.existsSync(baselinePath)) {
  console.error('No eslint-suppressions.json found — nothing baselined.');
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

// Invert: rule -> [ "file (countN)" ]
const byRule = {};
for (const [file, rules] of Object.entries(baseline)) {
  for (const [ruleId, info] of Object.entries(rules)) {
    if (!wanted.has(ruleId)) { continue; }
    (byRule[ruleId] ||= []).push(`${file} (${info.count})`);
  }
}

const rules = Object.entries(byRule).sort((a, b) => b[1].length - a[1].length);
if (rules.length === 0) {
  console.log('No security-relevant findings in the baseline.');
  process.exit(0);
}
const total = rules.reduce((n, [, files]) => n + files.length, 0);
console.log(`Baselined security/quality findings: ${total} entr(ies) across ${rules.length} rule(s)`);
console.log(showAll ? '(all rules)\n' : '(core high-signal rules; pass --all for the rest)\n');
for (const [ruleId, files] of rules) {
  console.log(`### ${ruleId}  (${files.length} file(s))`);
  for (const f of files) { console.log(`   ${f}`); }
  console.log('');
}
