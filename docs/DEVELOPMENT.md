# Development guide

This document describes how to set up a local development environment for Zotero Copilot.

## Prerequisites

- Node.js 20 or newer.
- [Zotero 7](https://www.zotero.org/download/) installed and able to launch.
- Git.
- An Anthropic API key for runtime testing.

## Repository layout

DeepRead is an npm-workspaces monorepo:

```
deepread/                 (monorepo, npm workspaces)
  packages/
    shared/        @deepread/shared — pure TS: chunker, embedder, retriever, llm, prompts
    zotero-plugin/ @deepread/zotero-plugin — the Zotero side, owns Zotero APIs and bundles into .xpi
    mcp-server/    deepread-mcp — public npm package, stdio↔HTTP bridge for MCP clients
  scripts/         build, package, dev — orchestrate across packages
```

Inside `packages/zotero-plugin/`:

- `src/` — TypeScript source bundled by esbuild into `build/index.js`.
- `bootstrap.js` — Zotero 7 bootstrapped extension entry; loads `build/index.js`.
- `manifest.json` — plugin manifest consumed by Zotero.
- `prefs.js` — default preference values registered with Zotero.
- `locale/` — Fluent localization files.
- `content/` — non-code assets shipped with the XPI (icons, future XHTML).
- `build/` — generated; the runtime layout Zotero loads.

Top-level generated dirs:

- `dist/` — produced `.xpi` files.
- `packages/mcp-server/dist/` — built bridge (`index.js`) consumed by `npx deepread-mcp`.

## First-run setup

```
cp .env.example .env       # then edit .env with your Anthropic key
npm install                # uses npm workspaces; installs all packages in one shot
npm run build              # builds the Zotero plugin → packages/zotero-plugin/build/index.js
cd packages/mcp-server && npm run build && cd ../..   # builds the MCP bridge → packages/mcp-server/dist/index.js
```

`npm run build` from the repo root delegates to the Zotero plugin and produces both `packages/zotero-plugin/build/index.js` and `dist/zotero-copilot-<version>.xpi` (via `npm run package`). The MCP bridge has its own build step today; it will be folded into the root `build` later.

`.env` is for local helper scripts only. The plugin itself reads its API key from the Zotero preference `extensions.zotero-copilot.apiKey`; bundled code never reads `.env`.

## Linking the dev plugin to Zotero

Zotero 7 supports loading a plugin directly from a local directory by writing a pointer file inside the profile's `extensions/` directory.

1. Locate your Zotero profile directory:
   - macOS: `~/Library/Application Support/Zotero/Profiles/<random>.default/`
   - Linux: `~/.zotero/zotero/<random>.default/`
   - Windows: `%APPDATA%\Zotero\Zotero\Profiles\<random>.default\`
2. Inside that profile, open the `extensions/` subdirectory (create it if missing).
3. Create a plain text file named exactly `zotero-copilot@xiangweiw.dev` (no extension). Its contents must be the absolute path to the plugin's `build/` directory, e.g.:

   ```
   /Users/you/projects/zotero-copilot/packages/zotero-plugin/build
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

This runs `npm --workspaces --if-present run typecheck` and so covers every package that exposes a `typecheck` script. esbuild does not type-check; run this before committing.

## MCP development

The MCP bridge (`packages/mcp-server/`) talks to a running Zotero plugin over loopback HTTP. To iterate:

1. Start Zotero with the dev-linked plugin and turn on **Settings → DeepRead → Enable MCP server**.
2. Build the bridge:

   ```
   npm --workspace=deepread-mcp run build
   ```

3. Smoke-test it from a shell — feed it a JSON-RPC frame on stdin and inspect the reply on stdout:

   ```
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
     | node packages/mcp-server/dist/index.js
   ```

   You should see a JSON response listing the DeepRead tools (`search_library`, `get_item`, …). If the response is an error mentioning "plugin is not reachable", the Zotero side isn't listening — re-check step 1.

4. To debug end-to-end inside a real client, point Claude Code / Cursor at your local build instead of the published npm package:

   ```
   claude mcp add --scope user deepread-dev -- node /absolute/path/packages/mcp-server/dist/index.js
   ```
