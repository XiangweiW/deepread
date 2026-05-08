# DeepRead MCP Server

DeepRead exposes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets agentic AI tools — Claude Code, Cursor, Codex CLI, GitHub Copilot, Continue, Windsurf, Cline, and so on — read your Zotero library directly. Set it up once and you can ask any of these tools things like "summarize the latest paper I added to my 'attention mechanisms' collection" without copy-pasting PDFs around.

The server runs entirely on your machine. No new API keys, no cloud relay.

## Architecture

```
  ┌──────────────────┐   stdio (JSON-RPC)   ┌──────────────────┐
  │  IDE / agent     │ ───────────────────▶ │  npx deepread-   │
  │  (Claude Code,   │                      │  mcp (bridge)    │
  │  Cursor, Codex…) │ ◀─────────────────── │                  │
  └──────────────────┘                      └────────┬─────────┘
                                                     │ HTTP (loopback)
                                                     │ POST 127.0.0.1:23119
                                                     ▼
                                            ┌──────────────────┐
                                            │  DeepRead MCP    │
                                            │  host (Zotero    │
                                            │  plugin)         │
                                            └────────┬─────────┘
                                                     │ Zotero APIs
                                                     ▼
                                            ┌──────────────────┐
                                            │  Your Zotero     │
                                            │  library         │
                                            └──────────────────┘
```

The bridge is a tiny stdio process the IDE spawns on demand. It translates MCP stdio frames into HTTP calls to the plugin's local endpoint and streams responses back. The actual work — searching, fetching items, RAG — happens inside the Zotero plugin where the data already lives.

## Prerequisites

- Zotero 7+ running on the same machine, with the DeepRead plugin installed (see [README](../README.md#install)).
- In Zotero: **Settings → DeepRead → Enable MCP server**. This is **off by default** for safety; nothing listens until you turn it on.
- Node 18+ available on `PATH` (for `npx deepread-mcp`). Most IDEs that support MCP already require this.

To verify the plugin side is up:

```bash
curl -s -X POST http://127.0.0.1:23119/deepread/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

You should get back a JSON object with `serverInfo.name = "deepread"`.

## Install per client

### Claude Code

```bash
claude mcp add --scope user deepread -- npx -y deepread-mcp
```

Then in any Claude Code session, ask "what tools do I have?" and `deepread.*` should appear.

### Cursor

Easiest: click **Add to Cursor** in Settings → DeepRead. It opens the `cursor://` deeplink and Cursor offers to register the server.

Manual: edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "deepread": {
      "command": "npx",
      "args": ["-y", "deepread-mcp"]
    }
  }
}
```

Restart Cursor; the server should show up under Settings → MCP.

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.deepread]
command = "npx"
args = ["-y", "deepread-mcp"]
```

### GitHub Copilot (VS Code / JetBrains)

Copilot reads the same `mcp.json` shape from its workspace or user config. In VS Code, open the Command Palette → **MCP: Add Server**, choose **stdio**, and enter `npx` as the command and `-y deepread-mcp` as the args. JetBrains exposes the same options under **Settings → Tools → GitHub Copilot → MCP servers**.

If your version of Copilot does not yet expose an MCP UI, see GitHub's [latest MCP docs](https://docs.github.com/copilot) — the spec is moving fast.

### Generic MCP client

The same JSON shape works in Continue, Windsurf, Cline, Zed, and most other MCP-aware tools:

```json
{ "mcpServers": { "deepread": { "command": "npx", "args": ["-y", "deepread-mcp"] } } }
```

## Available tools

| Tool | Description | Key inputs |
|---|---|---|
| `search_library` | Full-text + metadata search across the whole Zotero library. | `query`, optional `limit` |
| `get_item` | Fetch a single item's metadata (title, authors, year, abstract, tags, collections). | `itemKey` |
| `get_item_fulltext` | Full extracted text of a PDF item. | `itemKey` |
| `list_collections` | List all collections (id, name, parent, item count). | — |
| `search_collection` | Search within one collection. | `collectionKey`, `query`, optional `limit` |
| `rag_query` | Retrieval-augmented answer over an entire collection using DeepRead's local embedding index. | `collectionKey`, `query`, optional `topK` |
| `get_annotations` | All highlights and notes the user has made on an item. | `itemKey` |

Example session (Claude Code):

> **You:** What did I highlight in the Vaswani 2017 paper?
> **Claude:** *(calls `search_library` → `get_annotations`)* You highlighted three passages: …

> **You:** Summarize my "attention mechanisms" collection.
> **Claude:** *(calls `list_collections` → `rag_query`)* Across 14 papers in this collection, the dominant themes are …

## Privacy

- The MCP host listens **only on `127.0.0.1:23119`** — the same loopback port Zotero already uses for its connector. No external traffic, no LAN exposure.
- Tools are **read-only**. They do not modify your Zotero database. Annotation write-back is on the roadmap; it is intentionally not in this version.
- The MCP **client** (Claude Code, Cursor, etc.) sends your queries plus any retrieved text to **its own LLM provider**. That provider sees what you ask about and the snippets the tools return. DeepRead itself does not phone home.
- If a collection is sensitive, simply do not run `rag_query` against it. `search_library` returns metadata only by default; `get_item_fulltext` is the one to think about.

## Troubleshooting

- **"DeepRead Zotero plugin is not reachable"** — Zotero is not running, or **Enable MCP server** is off in Settings → DeepRead. Toggle it on and retry.
- **Port 23119 already in use** — another Zotero instance has the connector. Quit it, or override the port in Settings → DeepRead → Advanced (and update your client's args to match).
- **Tool calls time out on `rag_query`** — first-run embedding indexing is slow on large collections (minutes for hundreds of papers). Subsequent queries hit the on-disk cache and are fast. Watch the Zotero debug log for `[deepread] indexing N/M`.
- **`npx` can't find the package** — check Node 18+ is on `PATH` for the IDE process (not just your shell). On macOS, GUI apps don't read `~/.zshrc`; you may need to set the absolute path to `npx` in the client config.
- **Tools listed but every call fails** — open Zotero's debug log (`Tools → Developer → Debug Output Logging`) and look for `[deepread/mcp]` lines.

## Roadmap

- Bidirectional annotation write-back (`add_highlight`, `add_note`).
- Reading-queue tools (`get_unread`, `mark_read`).
- arXiv / Semantic Scholar wrappers so the agent can pull a paper into your library, not just read what's already there.
- Per-tool allowlist in the plugin settings (today: server is on or off; tomorrow: enable `search_*` but not `get_item_fulltext`).
