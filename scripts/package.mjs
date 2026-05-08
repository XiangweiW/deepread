import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'packages/zotero-plugin');

function readVersion() {
  const pkgRaw = fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  if (!pkg.version) throw new Error('packages/zotero-plugin/package.json has no "version" field');
  return pkg.version;
}

function runZip(buildDir, xpiPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('zip', ['-r', '-X', xpiPath, '.'], {
      cwd: buildDir,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`zip exited with code ${code}`));
    });
  });
}

async function main() {
  await build({ prod: true, watch: false });

  const version = readVersion();
  const buildDir = path.join(PLUGIN_DIR, 'build');
  const distDir = path.join(ROOT, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const xpiPath = path.join(distDir, `zotero-copilot-${version}.xpi`);
  if (fs.existsSync(xpiPath)) fs.rmSync(xpiPath);

  await runZip(buildDir, xpiPath);

  process.stdout.write(`✓ packaged ${path.relative(ROOT, xpiPath)}\n`);
}

try {
  await main();
} catch (err) {
  process.stderr.write(`package failed: ${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
