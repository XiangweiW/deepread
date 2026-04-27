import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const STATIC_FILES = ['bootstrap.js', 'manifest.json', 'prefs.js'];
const STATIC_DIRS = ['locale', 'content'];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function copyStatics() {
  const buildDir = path.join(ROOT, 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  for (const f of STATIC_FILES) {
    const src = path.join(ROOT, f);
    const dst = path.join(buildDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  for (const d of STATIC_DIRS) {
    const src = path.join(ROOT, d);
    const dst = path.join(buildDir, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

function makeEsbuildOptions({ prod }) {
  return {
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    outfile: path.join(ROOT, 'build/index.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'ZoteroCopilot',
    target: 'es2020',
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    sourcemap: prod ? false : 'inline',
    external: [],
    minify: !!prod,
    logLevel: 'info',
  };
}

export async function build(opts = {}) {
  const { prod = false, watch = false } = opts;
  const options = makeEsbuildOptions({ prod });

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    copyStatics();
    reportBuilt();
    process.stdout.write('watching for changes (Ctrl-C to exit)\n');
    return ctx;
  }

  await esbuild.build(options);
  copyStatics();
  reportBuilt();
}

function reportBuilt() {
  const outFile = path.join(ROOT, 'build/index.js');
  let sizeStr = 'unknown size';
  try {
    const stat = fs.statSync(outFile);
    sizeStr = formatSize(stat.size);
  } catch {
    // ignore
  }
  process.stdout.write(`✓ built build/index.js (${sizeStr})\n`);
  process.stdout.write('✓ copied bootstrap.js, manifest.json, prefs.js, locale/, content/\n');
}

const isMain = path.resolve(process.argv[1] ?? '') === __filename;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const prod = args.has('--prod');
  const watch = args.has('--watch');
  try {
    await build({ prod, watch });
  } catch (err) {
    process.stderr.write(`build failed: ${err && err.message ? err.message : err}\n`);
    process.exit(1);
  }
}
