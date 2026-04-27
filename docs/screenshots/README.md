# Screenshots

Place these PNGs in this directory and they will appear in the main README:

| File | What to capture |
|---|---|
| `sidebar.png` | A PDF reader with the DeepRead sidebar on the right; a couple of chat turns visible (one user question, one streaming AI answer). |
| `collection.png` | The floating collection-RAG overlay on top of the Zotero main window, showing "DeepRead — Collection: <name>" header and a chat about cross-paper themes. |
| `prefs.png` | Zotero's Settings → DeepRead pane with provider, API key, and model fields. (Blur the actual key.) |

## Capture (macOS)

```
# select a window with crosshair-then-spacebar; saves PNG to clipboard
screencapture -i -W -c

# save the buffer to file
osascript -e 'tell application "System Events" to keystroke (the clipboard as «class PNGf»)'
```

Easier: use macOS Cmd+Shift+4 then Spacebar to capture a window directly to file in Desktop, then rename and move to this directory.

After adding files, commit and push — CI will rebuild the `.xpi` automatically; the README images update immediately on GitHub.
