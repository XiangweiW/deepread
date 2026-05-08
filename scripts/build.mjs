import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'packages/zotero-plugin');
const BUILD_DIR = path.join(PLUGIN_DIR, 'build');

const STATIC_FILES = ['bootstrap.js', 'manifest.json', 'prefs.js'];
const STATIC_DIRS = ['locale', 'content'];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function copyStatics() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  for (const f of STATIC_FILES) {
    const src = path.join(PLUGIN_DIR, f);
    const dst = path.join(BUILD_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  for (const d of STATIC_DIRS) {
    const src = path.join(PLUGIN_DIR, d);
    const dst = path.join(BUILD_DIR, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

function makeEsbuildOptions({ prod }) {
  const SHARED_SRC = path.join(ROOT, 'packages/shared/src');
  return {
    entryPoints: [path.join(PLUGIN_DIR, 'src/index.ts')],
    outfile: path.join(BUILD_DIR, 'index.js'),
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
    alias: {
      '@deepread/shared': path.join(SHARED_SRC, 'index.ts'),
    },
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
  const outFile = path.join(BUILD_DIR, 'index.js');
  let sizeStr = 'unknown size';
  try {
    const stat = fs.statSync(outFile);
    sizeStr = formatSize(stat.size);
  } catch {
    // ignore
  }
  const rel = path.relative(ROOT, outFile);
  process.stdout.write(`✓ built ${rel} (${sizeStr})\n`);
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
