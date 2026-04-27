# Development guide

This document describes how to set up a local development environment for Zotero Copilot.

## Prerequisites

- Node.js 20 or newer.
- [Zotero 7](https://www.zotero.org/download/) installed and able to launch.
- Git.
- An Anthropic API key for runtime testing.

## Repository layout

- `src/` — TypeScript source bundled by esbuild into `build/index.js`.
- `bootstrap.js` — Zotero 7 bootstrapped extension entry; loads `build/index.js`.
- `manifest.json` — plugin manifest consumed by Zotero.
- `prefs.js` — default preference values registered with Zotero.
- `locale/` — Fluent localization files.
- `content/` — non-code assets shipped with the XPI (icons, future XHTML).
- `scripts/` — build (`build.mjs`) and packaging (`package.mjs`) scripts.
- `docs/` — developer and user documentation.
- `build/` — generated; the runtime layout Zotero loads.
- `dist/` — generated; produced `.xpi` files.

## First-run setup

```
cp .env.example .env       # then edit .env with your Anthropic key
npm install
npm run build
```

`.env` is for local helper scripts only. The plugin itself reads its API key from the Zotero preference `extensions.zotero-copilot.apiKey`; bundled code never reads `.env`.

## Linking the dev plugin to Zotero

Zotero 7 supports loading a plugin directly from a local directory by writing a pointer file inside the profile's `extensions/` directory.

1. Locate your Zotero profile directory:
   - macOS: `~/Library/Application Support/Zotero/Profiles/<random>.default/`
   - Linux: `~/.zotero/zotero/<random>.default/`
   - Windows: `%APPDATA%\Zotero\Zotero\Profiles\<random>.default\`
2. Inside that profile, open the `extensions/` subdirectory (create it if missing).
3. Create a plain text file named exactly `zotero-copilot@xiangweiw.dev` (no extension). Its contents must be the absolute path to the `build/` directory of this repository, e.g.:

   ```
   /Users/you/projects/zotero-copilot/build
   ```

4. If Zotero refuses to load unsigned development plugins, set `extensions.experimental.enabled` to `true` in `Edit > Settings > Advanced > Config Editor`, then restart Zotero.
5. Restart Zotero. The plugin should appear in `Tools > Add-ons`.

## Hot reload

Run the watcher in one terminal:

```
npm run dev
```

This invokes esbuild in watch mode and keeps `build/index.js` up to date as you edit. Zotero still has to be restarted (or the plugin reloaded) for changes to take effect. The community "Plugin Reloader" extension can speed this up; otherwise use `Tools > Developer > Restart with Logging Enabled`.

## Debugging

- Open `Tools > Developer > Debug Output Logging` and enable logging.
- All plugin logs are prefixed with `[zotero-copilot]`.
- The bundle is built with inline source maps in dev mode, so errors in the Browser Toolbox map back to the original `.ts` / `.tsx` files.
- For a clean dev build at any time:

  ```
  npm run build
  ```

- For a production build (minified, no source maps):

  ```
  node scripts/build.mjs --prod
  ```

- To produce a shippable `.xpi`:

  ```
  npm run package
  ```

  The resulting file lands in `dist/zotero-copilot-<version>.xpi`.

## Type checking

```
npm run typecheck
```

esbuild does not type-check. Run `tsc --noEmit` (wrapped by the script above) before committing.
