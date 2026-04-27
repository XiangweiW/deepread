# Zotero Copilot — Project Brief

## Overview
Zotero Copilot is a Zotero 7 plugin that turns your library into a conversational research assistant. It uses the Anthropic Claude API to answer questions grounded in the paper or collection you have selected, supporting per-paper Q&A, free-form chat, and collection-level analysis. The plugin runs as a bootstrapped extension inside Zotero 7, exposing a sidebar UI rendered with React. All LLM calls are streamed via the Anthropic Messages API using the user's API key, which is stored in Zotero preferences.

## Tech stack
- TypeScript (strict mode)
- React 18 (JSX runtime: `react-jsx`) for the sidebar UI
- esbuild for bundling `src/` into a single `build/index.js` consumed by `bootstrap.js`
- Zotero 7 bootstrapped extension lifecycle (`install` / `startup` / `shutdown` / `uninstall`)
- Anthropic Messages API with streaming (SSE) — called directly via `fetch`, no SDK shim assumed
- Fluent (`.ftl`) for localization

## Directory map
- `src/` — all TypeScript source; bundled by esbuild into `build/index.js`
- `src/llm/` — Anthropic Messages client, streaming, types (`LLMProvider`, `LLMMessage`)
- `src/context/` — paper / selection / collection context builders (`PaperContext`)
- `src/prompts/` — prompt templates and rendering (`PromptTemplate`)
- `src/prefs/` — typed wrapper around Zotero preferences (`Prefs`)
- `src/ui/` — React components (sidebar, chat, message, markdown)
- `src/zotero/` — Zotero API helpers (items, attachments, full-text, reader hooks)
- `src/utils/` — small shared helpers (formatting, ids, debouncing)
- `locale/` — Fluent localization files
- `content/` — non-code assets shipped with the XPI (icons, future XHTML)
- `scripts/` — `build.mjs` and `package.mjs` (esbuild + XPI zipping)
- `docs/` — developer and user documentation

## File ownership matrix
| Agent | Owns |
| ----- | ---- |
| 1 | Scaffold and build configs: `package.json`, `tsconfig.json`, `manifest.json`, `bootstrap.js`, `prefs.js`, `PROJECT_BRIEF.md`, stub files, `.env.example`, `locale/en-US/zotero-copilot.ftl` |
| 2 | `src/llm/*` — Anthropic client, streaming, provider interface |
| 3 | `src/prefs/manager.ts` — typed pref accessors |
| 4 | `src/context/*` — paper/collection context extraction |
| 5 | `src/prompts/*` — prompt templates |
| 6 | `src/ui/sidebar.tsx`, `src/ui/index.tsx` — sidebar shell and mount |
| 7 | `src/ui/chat.tsx`, `src/ui/message.tsx`, `src/ui/markdown.tsx` — chat UI |
| 8 | `src/zotero/*` — Zotero API integration helpers |
| 9 | `src/index.ts` — top-level `onStartup` / `onShutdown` wiring |
| 10 | `scripts/*`, `README.md`, `docs/*` |

## Conventions
- 2-space indentation.
- No comments unless they explain a non-obvious WHY.
- Named exports preferred over default exports.
- `async` / `await` everywhere; never raw `.then()` chains.
- **Use semicolons.**
- The `Zotero` global is available at runtime; do not import it. Type it via `src/zotero-globals.d.ts` (`declare const Zotero: any;`).
- Keep modules small and side-effect-free where possible. Side effects belong in `src/index.ts`.

## API key location
- The user's Anthropic API key is stored in the Zotero preference `extensions.zotero-copilot.apiKey` and read at runtime through Agent 3's `Prefs` manager.
- The `.env` file at the project root holds a development key for local testing only. **Source code must never read from `.env`.** Bundled code has no filesystem access to it inside Zotero anyway.
- `.env.example` shows the expected variables; keep `.env` out of git (already covered by `.gitignore`).

## Public types
Other agents should import these cross-module types from the listed barrel:

- `LLMProvider` (interface) — from `src/llm/`
- `LLMMessage` (type) — from `src/llm/`
- `PaperContext` (type) — from `src/context/`
- `PromptTemplate` (type) — from `src/prompts/`
- `Prefs` (object exposing `getApiKey()`, `getModel()`, `getMaxTokens()`, `getSystemPrompt()`, `getAllowFullTextUpload()`, `getTemperature()`, plus matching setters) — from `src/prefs/`
