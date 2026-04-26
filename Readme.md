# Pi Session Viewer

## Purpose

Generate static HTML summaries from Pi agent session logs stored in `~/.pi/agent/sessions`. The goal is to document and review your development workflow by producing readable, navigable HTML pages from `.jsonl` session files.

## Usage

```bash
node index.js <output-dir>
```

- If `<output-dir>` is omitted, defaults to the current working directory.
- The program scans `~/.pi/agent/sessions/**` for `.jsonl` files.
- Outputs:
  - One HTML file per session (named after the session file).
  - An `index.html` file that serves as a navigation hub across all sessions.

## Architecture Overview

```
index.js          ← Entry point: CLI args, session discovery, orchestrator
├── session-reader/    ← Parse .jsonl files into structured event arrays
├── event-parser/      ← Transform raw events into high-level constructs
│   ├── session-info       ← Extract metadata (model, timestamp, cwd, parent)
│   ├── conversation-tree  ← Build parent-child message hierarchy
│   └── tool-call-tracker← Track tool usage, outcomes, summaries
├── html-renderer/     ← Convert parsed session data to HTML
│   ├── page-builder       ← Generate full page with CSS + JS
│   ├── conversation-view  ← Render messages in conversation flow
│   ├── tree-view          ← Render session parent-child tree
│   └── metadata-card      ← Render model/timing/token metadata
└── session-indexer/   ← Generate index.html from discovered sessions
```

### Key Design Decisions

- **Per-session HTML files**: Each session becomes its own standalone page.
- **Index file**: `index.html` lists all sessions grouped by directory, with links to individual pages.
- **Session tree**: Sessions with `parentSession` references are displayed as a collapsible tree.
- **Expandable reasoning**: `thinking` blocks are collapsed by default, expandable on click.
- **Metadata emphasis**: Model, tokens, and timing info appears but is visually subdued.
- **Tool call summarization**: Tool calls (write, bash, read, edit) are summarized as actions within the conversation flow.
- **Static HTML**: No JavaScript frameworks — vanilla JS for expand/collapse only.
- **Dark mode**: Respects `prefers-color-scheme` for automatic light/dark theming.

### Data Source

Session logs are JSON Lines files in `~/.pi/agent/sessions/` with subdirectories per project context. Each file contains events of types:
- `session` — metadata (id, timestamp, cwd, parentSession)
- `model_change` — model/provider switches
- `thinking_level_change` — reasoning level changes
- `message` — user prompts, assistant responses (with `thinking`, `text`, `toolCall` parts)
- `compaction` — session compaction markers

## Status

| Phase | Status | Tasks |
|-------|--------|-------|
| Phase 1 | ✅ Done | SR-1: Parse .jsonl, SR-2: Discover sessions |
| Phase 2 | ✅ Done | EP-1: Session info, EP-2: State tracker, EP-3: Conversation tree, EP-4: Message parser, EP-5: Data structure |
| Phase 3 | ✅ Done | HR-1: Page builder, HR-2: Conversation view, HR-3: Metadata card, HR-4: Session tree |
| Phase 4 | ✅ Done | SI-1: Index generator |
| Phase 5 | ✅ Done | CL-1: CLI parsing, CL-2: Error handling, CL-3: Styling polish |

## TODO

See [TODO.md](TODO.md) for remaining work and future enhancements.
