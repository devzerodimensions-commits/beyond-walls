/**
 * Builds a clean source archive for handover.
 *
 *   npm run package
 *
 * Secrets and installed dependencies never go in the box: `.env` files,
 * `node_modules`, build output, logs and customer uploads are all excluded.
 * The `.env.example` files ARE included, so whoever deploys knows exactly which
 * variables to supply.
 *
 * The seeded product photography under `server/uploads/products` is kept,
 * because the seed data references it.
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'release');
const STAGE = path.join(OUT_DIR, 'beyond-walls');

/** Anything matching these is never copied. */
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'release', 'coverage', '.turbo', '.vite',
  // Test run artefacts: traces and screenshots, not source.
  'test-results', 'playwright-report', 'blob-report', '.playwright',
]);

const EXCLUDED_FILES = [
  /^\.env$/,
  /^\.env\.(local|development|production|test)$/,
  /\.log$/,
  /^npm-debug\.log/,
  /^\.DS_Store$/,
];

/** Uploads are customer data — only the seeded product photography ships. */
function allowUpload(relative) {
  return relative.startsWith(path.join('server', 'uploads', 'products'))
    || relative.endsWith(path.join('uploads', '.gitkeep'));
}

let copied = 0;
let skipped = 0;

function copyTree(from, to, relativeBase = '') {
  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const relative = path.join(relativeBase, entry.name);
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) { skipped += 1; continue; }
      copyTree(source, target, relative);
      // Drop directories that ended up empty because everything was excluded.
      if (fs.readdirSync(target).length === 0) fs.rmdirSync(target);
      continue;
    }

    if (EXCLUDED_FILES.some((pattern) => pattern.test(entry.name))) { skipped += 1; continue; }

    const inUploads = relative.split(path.sep).includes('uploads');
    if (inUploads && !allowUpload(relative)) { skipped += 1; continue; }

    fs.copyFileSync(source, target);
    copied += 1;
  }
}

function assertNoSecrets(dir) {
  const offenders = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name === '.env' || entry.name === 'node_modules') {
        offenders.push(path.relative(dir, full));
      }
    }
  };
  walk(dir);
  if (offenders.length) {
    throw new Error(`Refusing to package — these should not be here:\n  ${offenders.join('\n  ')}`);
  }
}

console.log('\nPackaging Beyond Walls for handover\n');

fs.rmSync(OUT_DIR, { recursive: true, force: true });
copyTree(ROOT, STAGE);

// A belt-and-braces check: never ship a real .env or a dependency tree.
assertNoSecrets(STAGE);

console.log(`  files     ${copied} copied, ${skipped} excluded`);

const stamp = new Date().toISOString().slice(0, 10);
const zipPath = path.join(OUT_DIR, `beyond-walls-${stamp}.zip`);

try {
  // PowerShell is always present on the Windows machines this ships from;
  // `zip` covers macOS and Linux.
  if (process.platform === 'win32') {
    execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Compress-Archive -Path "${STAGE}\\*" -DestinationPath "${zipPath}" -Force`,
    ], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-rq', zipPath, 'beyond-walls'], { cwd: OUT_DIR, stdio: 'inherit' });
  }
  const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`  archive   ${path.relative(ROOT, zipPath)} (${size} MB)`);
} catch (err) {
  console.log(`  archive   could not be created (${err.message})`);
  console.log(`            the clean tree is ready at ${path.relative(ROOT, STAGE)}`);
}

console.log(`
  Excluded: node_modules, dist/build output, .env files, logs, customer uploads.
  Included: .env.example for both workspaces, and the seeded product images.

  To run it: npm install, copy each .env.example to .env and fill it in,
  then npm run prisma:deploy && npm run seed && npm run build && npm start
`);
