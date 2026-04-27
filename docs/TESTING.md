# Manual test plan — MVP

This is the manual smoke-test plan for the Zotero Copilot MVP. Run through it after every meaningful build before tagging a release.

## Setup checklist

- [ ] `extensions.zotero-copilot.apiKey` is set to a valid Anthropic key in Zotero's Config Editor.
- [ ] Zotero 7 is running.
- [ ] A development build is linked via the profile's `extensions/zotero-copilot@xiangweiw.dev` pointer file (see `docs/DEVELOPMENT.md`).
- [ ] At least one PDF item with extractable text is present in the library.
- [ ] `Tools > Developer > Debug Output Logging` is enabled so `[zotero-copilot]` log lines are visible.

## Test cases

### T1 — Sidebar mounts on PDF open

1. Double-click a PDF item to open it in the Zotero reader.
2. Open the right-hand sidebar.

Expected: a "Copilot" tab/section appears in the sidebar with the prompt template list and a chat input.

### T2 — Template runs and streams

1. With a PDF open, click the `Summarize paper` template.

Expected: a streaming assistant response appears progressively (token-by-token / chunk-by-chunk) and ends without error.

### T3 — Multi-turn free chat

1. After T2 completes, type a follow-up question (e.g. "What dataset did they use?") into the chat input and submit.

Expected: the assistant answers using the same conversation context. Earlier messages remain visible.

### T4 — Save transcript to note

1. After T2/T3, click `Save to note`.
2. In the Zotero library, expand the parent item.

Expected: a new child note exists under the item containing the chat transcript in readable form (user and assistant turns clearly distinguished).

### T5 — Selection-aware prompt

1. In the PDF reader, select a passage of text.
2. In the Copilot sidebar, run the `Explain selected passage` template.

Expected: the prompt sent to Claude includes the selected text. The response addresses that specific passage.

### T6 — Stop mid-stream

1. Trigger a long response (e.g. `Summarize paper` on a long PDF).
2. While the response is still streaming, click the `Stop` button.

Expected: streaming halts immediately, the partial response remains visible, and the input becomes available again. No uncaught errors in the debug log.

### T7 — Wrong API key

1. Set `extensions.zotero-copilot.apiKey` to an obviously invalid value (e.g. `sk-bogus`).
2. Restart Zotero or reload the plugin.
3. Run any template.

Expected: a clear, in-UI error banner explaining the auth failure. The plugin must not crash, and the rest of the sidebar remains functional.

### T8 — Sidebar unmounts cleanly

1. Open a PDF, run a template, then close the reader tab.
2. Inspect the debug log.

Expected: no React unmount warnings, no leaked event listeners or timers logged. Re-opening a PDF mounts a fresh sidebar without errors.

## Known limitations

- Collection-level analysis is not implemented yet.
- Citation jumpback (clicking a citation to navigate to a PDF page) is not implemented.
- There is no native preferences panel; all settings are edited via the Config Editor.
- Only the Anthropic provider is supported. Local-model support is on the roadmap.
