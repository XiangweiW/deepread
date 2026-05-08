# deepread-mcp

A tiny stdio-to-HTTP bridge that lets MCP clients (Claude Code, Cursor, Codex CLI, etc.) talk to the [DeepRead](https://github.com/XiangweiW/deepread) Zotero plugin so they can read your Zotero library, search collections, and pull paper context into the conversation.

```
Claude Code / Cursor / Codex CLI
         |  stdio JSON-RPC (newline-delimited)
         v
     deepread-mcp
         |  HTTP JSON-RPC POST
         v
  Zotero (running with DeepRead plugin)
```

The bridge has zero external dependencies and is a single ~150-line Node 18+ script. It only forwards bytes; the actual MCP server lives inside the Zotero plugin.

## Prerequisites

1. **Zotero 7+** is installed and running.
2. **DeepRead plugin** is installed in Zotero.
3. In Zotero, open **Settings → DeepRead** and turn on **Enable MCP server**. The plugin will start listening on `http://127.0.0.1:23119/deepread/mcp`.

If the MCP server is not enabled, this bridge will reply to every request with a friendly error pointing you back to the setting.

## Install

You don't actually have to install anything globally — `npx -y deepread-mcp` will fetch and run the latest version on demand. The snippets below all use that pattern.

### Claude Code

```sh
claude mcp add --scope user deepread -- npx -y deepread-mcp
```

### Cursor

Add to `~/.cursor/mcp.json`:

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

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.deepread]
command = "npx"
args = ["-y", "deepread-mcp"]
```

### Other MCP clients

Any MCP client that can spawn a stdio server will work — point it at `npx -y deepread-mcp` with no arguments.

## CLI options

```
deepread-mcp [--host 127.0.0.1] [--port 23119] [--path /deepread/mcp]
```

You usually don't need any of these. They exist for unusual setups (e.g. Zotero running on a different port, or in a remote dev container).

Equivalent environment variables: `DEEPREAD_MCP_HOST`, `DEEPREAD_MCP_PORT`, `DEEPREAD_MCP_PATH`.

## Tools available

The Zotero plugin exposes these tools through the bridge. Names and shapes are defined by the plugin; this bridge only forwards them.

- **`zotero_search`** — full-text and metadata search across your Zotero library.
- **`zotero_get_item`** — fetch a single item's metadata by Zotero key.
- **`zotero_get_collection`** — list items in a Zotero collection.
- **`zotero_get_attachment_text`** — extract text from a PDF attachment.
- **`zotero_list_collections`** — enumerate top-level and nested collections.
- **`zotero_get_selection`** — read whatever the user has selected in the Zotero UI right now.
- **`zotero_get_notes`** — pull child notes attached to an item.

Run `tools/list` in your MCP client to confirm what your installed plugin version exposes.

## Troubleshooting

**"DeepRead Zotero plugin is not reachable at http://127.0.0.1:23119/deepread/mcp"**
Make sure Zotero is running and that **Settings → DeepRead → Enable MCP server** is turned on. The bridge replies with this message whenever the underlying TCP connection is refused, so seeing it on every request usually means the plugin's HTTP listener never started.

**Tools work in Claude Code but not Cursor (or vice versa)**
The bridge is identical regardless of client; the difference is almost always how the client spawns it. Verify that `npx -y deepread-mcp` works from a plain terminal first — if that succeeds, the issue is in the client config.

**Smoke test from a shell**

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"ping"}' | npx -y deepread-mcp
```

If Zotero + DeepRead MCP is running, you'll see the plugin's response. Otherwise you'll see the friendly "not reachable" error described above. Both outcomes prove the bridge itself is working.

## License

MIT
