# TODO — Pi Session Viewer

---

## ✅ Completed

### Core Architecture (Phases 1–5)
- [x] **SR-1**: Parse `.jsonl` files
- [x] **SR-2**: Discover session files
- [x] **EP-1**: Session info extractor
- [x] **EP-2**: Model & thinking state tracker
- [x] **EP-3**: Conversation tree builder (BFS traversal, forked/resumed sessions)
- [x] **EP-4**: Message content parser
- [x] **EP-5**: Build session data structure
- [x] **HR-1**: Page builder
- [x] **HR-2**: Conversation view renderer
- [x] **HR-3**: Metadata card renderer
- [x] **HR-4**: Session tree renderer
- [x] **SI-1**: Index generator (flexbox cards, newest first)
- [x] **CL-1**: CLI argument parsing
- [x] **CL-2**: Error handling
- [x] **CL-3**: Styling polish (dark mode, mobile-friendly)

### NEP (New Entry Parsing)
- [x] **NEP-1**: Parse `session_info` entries — use user-defined session names as titles
- [x] **NEP-2**: Parse compaction details — show summary, token counts, fromHook flag
- [x] **NEP-3**: Parse `branch_summary` entries — show abandoned path context in conversation
- [x] **NEP-4**: Parse `label` entries — show bookmarks on conversation entries (🔖 badges)
- [x] **NEP-5**: Parse `custom` and `custom_message` entries — forward-compatible with extensions
- [x] **NEP-6**: Extract token usage from assistant messages — show in metadata card
- [x] **NEP-7**: Show `stopReason` and `errorMessage` — flag failed API calls
- [x] **NEP-8**: Parse and display tool call results — correlate toolCall with toolResult inline
- [x] **CL-4**: Fix date formats (DD/MM/YYYY British) and add times to index cards

---

## 🔥 High Priority

### MR-1: Markdown Rendering in Assistant Messages
- **What**: Render markdown in assistant text content, thinking blocks, and tool result previews. Currently all text is plain escaped HTML (`escapeHtml(text)`), so code blocks, lists, headings, bold/italic, links, etc. appear as raw text.
- **Impact**: Massive improvement in readability. Assistant messages frequently contain code snippets, structured lists, and formatted instructions.
- **Implementation**:
  - Include a lightweight markdown renderer in generated HTML (inline or via CDN).
  - Candidates:
    - [`marked`](https://marked.js.org/) — popular, feature-rich (~15KB minified). Can embed as inline script in the generated HTML.
    - [`markdown-it`](https://markdown-it.github.io/) — more configurable, slightly larger.
    - Custom minimal renderer — parse `# headings`, `**bold**`, `*italic*`, `` `code` ``, ```` ``` ```` blocks, `- lists`, `1. numbered lists` manually. Less robust but zero deps.
  - Apply rendering in `buildAssistantMessage()` (text part), `buildAssistantMessage()` (thinking content), and `buildToolResultMessage()` (text part).
  - **Key consideration**: Must apply markdown rendering *after* `escapeHtml()` to prevent XSS. Either escape first then render, or use a markdown parser that escapes HTML natively.
  - **Key consideration**: Thinking blocks are collapsible (`<details>`) — ensure rendering works inside collapsed content.
  - Files affected: `html-renderer/index.js` (add renderer, modify `buildAssistantMessage`, `buildToolResultMessage`).
- **Sub-tasks**:
  - [ ] **MR-1a**: Choose and embed markdown renderer (inline script in generated HTML)
  - [ ] **MR-1b**: Apply markdown rendering to assistant text content
  - [ ] **MR-1c**: Apply markdown rendering to thinking blocks
  - [ ] **MR-1d**: Apply markdown rendering to tool result text
  - [ ] **MR-1e**: Add CSS for rendered markdown elements (`<code>`, `<pre>`, `<ul>`, `<ol>`, `<blockquote>`, `<table>`, etc.)

---

### SH-1: Syntax Highlighting for Code Blocks
- **What**: Add syntax highlighting to code blocks inside rendered markdown (code fences, inline code).
- **Impact**: Significantly improves code readability in assistant messages, thinking blocks, and tool results.
- **Implementation**:
  - Options:
    - [`highlight.js`](https://highlightjs.org/) — supports 180+ languages, auto-detection, ~20KB core. CDN or inline.
    - [`shiki`](https://github.com/shikiji/shiki) — tokeniser-based (VS Code colours), more accurate, heavier.
    - Custom minimal highlighter — highlight common patterns (keywords, strings, numbers, comments, paths) without language detection. Very small, less precise.
  - If using markdown rendering (MR-1), highlight code blocks *during* markdown rendering (many parsers support a render hook).
  - **Key consideration**: Must work standalone (no external deps required). Renderer and highlighter should be embedded inline in generated HTML.
  - **Key consideration**: Target size — the generated HTML files already contain substantial inline CSS/JS. Total inline additions should stay under ~30KB to keep files manageable.
  - Files affected: `html-renderer/index.js` (add highlighter, register with markdown renderer).
- **Sub-tasks**:
  - [ ] **SH-1a**: Choose and embed syntax highlighter
  - [ ] **SH-1b**: Register highlighter with markdown renderer (render hook or post-process `<pre><code>` blocks)
  - [ ] **SH-1c**: Add CSS for highlighted tokens (dark mode aware)

---

### SR-3: Client-Side Search on Session Pages
- **What**: Add a search bar to individual session HTML pages for finding messages, tool calls, and thinking content by keyword.
- **Impact**: Sessions with 100+ messages (many test sessions exceed 400KB) are currently impossible to navigate beyond sequential scrolling.
- **Implementation**:
  - Add a search input field at the top of the page (below metadata card, above conversation).
  - On input, highlight matching terms across all message text, thinking content, and tool call badges.
  - Show match count ("X matches found").
  - Add "previous match" / "next match" navigation buttons (or use keyboard shortcuts: `Ctrl+F`-style behaviour).
  - Approach: Wrap matching text in `<mark>` elements, or use `window.find()` for simple approach. For a richer experience, index all text content at load and jump to matches.
  - **Key consideration**: Must work on collapsed content (thinking blocks, expanded messages). Either expand matches automatically, or show preview snippets.
  - **Key consideration**: Performance — avoid DOM mutation on every keystroke. Use debounce (250ms) and batch DOM updates.
  - Files affected: `html-renderer/index.js` (add search bar HTML, CSS, JS).
- **Sub-tasks**:
  - [ ] **SR-3a**: Add search input field and styling
  - [ ] **SR-3b**: Index all visible text content on page load
  - [ ] **SR-3c**: Implement match highlighting (wrap in `<mark>` or use scroll-into-view)
  - [ ] **SR-3d**: Add match count display and prev/next navigation
  - [ ] **SR-3e**: Handle collapsed content (expand to show matches)
  - [ ] **SR-3f**: Add debounce to input handler

---

### CP-1: Copy Buttons
- **What**: Add copy-to-clipboard buttons for message text, code blocks, thinking content, and tool results.
- **Impact**: High utility — users frequently want to copy code snippets, tool output, or thinking text.
- **Implementation**:
  - Use the [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) (`navigator.clipboard.writeText()`).
  - Add a small copy button (📋) to:
    - Full message text (user messages — the expandable content)
    - Assistant text content
    - Thinking block content
    - Tool result text (expandable content)
    - Code blocks (if markdown rendering is implemented, on `<pre><code>` blocks)
  - Visual feedback: Change icon to ✅ on success, revert after 2 seconds.
  - **Key consideration**: Must handle both visible content and content hidden behind expand/collapse. Copy the full text, not just the visible preview.
  - Files affected: `html-renderer/index.js` (add copy buttons, CSS, JS handler).
- **Sub-tasks**:
  - [ ] **CP-1a**: Implement copy button UI and CSS
  - [ ] **CP-1b**: Wire up Clipboard API with success/error feedback
  - [ ] **CP-1c**: Add copy buttons to user messages (full text)
  - [ ] **CP-1d**: Add copy buttons to assistant messages (text + thinking)
  - [ ] **CP-1e**: Add copy buttons to tool results
  - [ ] **CP-1f**: Add copy buttons to code blocks (if markdown rendering exists)

---

## ⚡ Medium Priority

### TV-1: Token Usage Visualisation
- **What**: Add a visual breakdown of token usage (bar/progress showing input vs output ratio, cumulative growth across turns).
- **Impact**: Token data is already collected and displayed as text. Visual representation makes it much more digestible at a glance.
- **Implementation**:
  - Add a horizontal stacked bar chart in the metadata card showing: input tokens (blue), output tokens (green), cached read/write (optional sub-segments).
  - Optionally: per-turn token usage shown inline on assistant messages, with a running cumulative bar at the bottom of the conversation.
  - Use CSS-only bars (no chart library needed) — percentage-based widths with background colours.
  - **Key consideration**: Some sessions have no token data (older sessions, failed API calls). Gracefully hide the visualisation if data is missing.
  - Files affected: `html-renderer/index.js` (metadata card CSS, token bar HTML).
- **Sub-tasks**:
  - [ ] **TV-1a**: Add input/output stacked bar in metadata card
  - [ ] **TV-1b**: Add cached read/write segments (if present)
  - [ ] **TV-1c**: Add per-turn token counts on assistant messages (optional)
  - [ ] **TV-1d**: Handle missing token data gracefully

---

### SR-4: Index Page Search / Filter Controls
- **What**: Add search and filter controls to the index page for finding sessions by title, prompt, model, date range, or message count.
- **Impact**: With 20+ sessions in a typical index, finding specific sessions requires scrolling through all cards.
- **Implementation**:
  - Search bar: filter cards by title, first user prompt, or session ID text.
  - Filter controls:
    - Date range picker (from/to)
    - Model filter (dropdown of models used across sessions)
    - Message count range (min/max turns)
    - "Has children" toggle
  - Show match count ("X sessions found").
  - Use CSS `display: none` on non-matching cards for instant filtering.
  - **Key consideration**: All client-side — no server required. Filter state could optionally be stored in URL hash for bookmarkability.
  - Files affected: `session-indexer/index.js` (add filter controls HTML, CSS, JS).
- **Sub-tasks**:
  - [ ] **SR-4a**: Add search bar (filter by title, prompt text, session ID)
  - [ ] **SR-4b**: Add date range filter
  - [ ] **SR-4c**: Add model filter dropdown (populate from session data)
  - [ ] **SR-4d**: Add message count range filter
  - [ ] **SR-4e**: Add match count display
  - [ ] **SR-4f**: Optional: URL hash for bookmarkable filter state

---

## 🎨 Styling & Polish

### DF-1: Date Formatting Consistency Across Pages
- **What**: All timestamps should use consistent, locale-aware formatting across all generated pages.
- **Current state**: Index page uses a hardcoded DD/MM/YYYY format. Session pages use `toLocaleString()` which produces locale-dependent output (e.g., `4/23/2026, 7:42:04 PM` on US systems). The two pages produce different formats for the same date.
- **Implementation**:
  - Replace the hardcoded date formatter in `index.js` and `formatTimestamp()` in `html-renderer/index.js` with a shared, locale-aware formatter.
  - Use the user's system locale (from `Intl` APIs or environment). Detect locale at render time and pass a consistent formatter function to both the index and session templates.
  - **Key consideration**: Generated HTML is standalone and viewed on different machines. Best approach: use client-side `toLocaleDateString(undefined)` and `toLocaleTimeString(undefined)` in the generated page's inline JS — this picks up the viewer's locale automatically, rather than the builder's locale.
  - **Key consideration**: If server-side formatting is preferred (format at generation time), read `Intl.NumberFormat.prototype.resolvedOptions()` to detect the current locale and pass it through consistently.
- **Sub-tasks**:
  - [ ] **DF-1a**: Update `formatTimestamp()` helper in html-renderer to use locale-aware formatting
  - [ ] **DF-1b**: Update date formatters in index.js to use locale-aware formatting
  - [ ] **DF-1c**: Apply consistent formatting to all timestamp displays (message headers, tool results, compaction details, branch summaries)
  - [ ] **DF-1d**: Decide approach: client-side locale detection in generated HTML vs. server-side formatting at build time

---

### TF-1: Tool Call Argument Formatting
- **What**: Format tool call arguments more intelligibly. Currently raw truncated text (`arguments.substring(0, 50)`).
- **Current state**: Tool call arguments are often JSON objects. For `edit` tools, they contain file path + operation. For `bash`, they contain the command. For `read`, the file path.
- **Implementation**:
  - In `buildAssistantMessage()` (tool call badge rendering):
    - Detect tool type and format accordingly:
      - `read`: show file path
      - `write`: show file path + "write" indicator
      - `edit`: show file path + edit operation (insert/replace)
      - `bash`: show command (first 50 chars)
    - For JSON arguments, attempt to extract meaningful values (keys, file paths, command strings).
    - Fall back to current truncated text if parsing fails.
  - **Key consideration**: Must handle malformed or unusual arguments gracefully (try/catch around JSON.parse).
- **Sub-tasks**:
  - [ ] **TF-1a**: Add tool-type-aware argument formatting for read/write/edit/bash
  - [ ] **TF-1b**: Handle JSON argument parsing with graceful fallback
  - [ ] **TF-1c**: Update tool call badge styling to accommodate formatted arguments

---

### ST-1: Session Tree Sidebar — Full Depth
- **What**: Session tree sidebar should show full lineage (grandparent, parent, siblings) with navigation links, not just the immediate parent.
- **Current state**: Only shows the immediate parent session ID (truncated) with "This Session" label. No links to parent or siblings.
- **Implementation**:
  - In `index.js`, the parent-child map (`childMap`) already exists. Pass the full tree structure to `buildSessionTree()`.
  - Build a recursive tree: parent → children → grandchildren, with links to sibling HTML files.
  - Show the current session highlighted within the tree.
  - **Key consideration**: Tree can be deep. Show a reasonable depth (e.g., 3 levels) with "..." indicators for deeper branches.
  - Files affected: `index.js` (pass tree data), `html-renderer/index.js` (`buildSessionTree` function).
- **Sub-tasks**:
  - [ ] **ST-1a**: Pass full parent/child tree from index.js to session data
  - [ ] **ST-1b**: Build recursive tree HTML with navigation links to siblings
  - [ ] **ST-1c**: Highlight current session in tree
  - [ ] **ST-1d**: Depth limiting with "..." indicators

---

### TD-1: Thinking Block Duration
- **What**: Show round-trip time for thinking blocks (time between thinking message and next message).
- **Impact**: Gives insight into how long the model "thought" before responding.
- **Implementation**:
  - Calculate duration between a thinking message's timestamp and the next assistant/toolResult message timestamp.
  - Display as "💭 Thinking (3.2s)" or similar in the thinking block summary.
  - **Key consideration**: Requires access to the next message's timestamp. Need to pass timing context through the turn rendering.
  - **Key consideration**: Timestamps may be ISO strings or epoch numbers — ensure consistent comparison.
  - Files affected: `event-parser/index.js` (calculate timing), `html-renderer/index.js` (display duration).
- **Sub-tasks**:
  - [ ] **TD-1a**: Calculate inter-message durations in `buildSessionData()`
  - [ ] **TD-1b**: Attach duration to thinking blocks in enriched message data
  - [ ] **TD-1c**: Display duration in thinking block summary line

---

## 📋 Quick Wins

### FC-1: Favicon / Title Icon
- **What**: Add a favicon or title icon to generated HTML files (index and session pages).
- **Implementation**:
  - Inline SVG favicon as data URI in `<link rel="icon">`.
  - Simple icon: a stylised "π" symbol or a chat/document icon.
  - **Key consideration**: Must be self-contained (inline data URI, no external files).
- **Sub-tasks**:
  - [ ] **FC-1a**: Create inline SVG favicon (data URI)
  - [ ] **FC-1b**: Add to index.html and session page templates

---

### BI-1: Back to Index Link
- **What**: Add a navigation link back to the index from each session page.
- **Implementation**:
  - Add a link at the top or bottom of session pages: `← Back to Session Index`.
  - Link to `index.html` (same directory).
  - Style as a subtle navigation element, not prominent.
- **Sub-tasks**:
  - [ ] **BI-1a**: Add back-to-index link to session page template
  - [ ] **BI-1b**: Style as subtle navigation element

---

## 🔧 Deferred / Lower Priority

### PAG-1: Pagination / Lazy Loading
- **What**: Add pagination or virtual scrolling for sessions with hundreds of turns.
- **Current state**: All messages rendered in a single DOM. Large sessions (500+ messages) create very tall pages.
- **Considerations**: Complex — requires significant restructuring of conversation rendering. May need to generate partial HTML or use client-side virtual scrolling.
- **Status**: Defer until core features are complete.

### EXP-1: Export / PDF Generation
- **What**: Add PDF export option for sessions.
- **Considerations**: PDF generation in a static HTML context is complex. Could use print CSS as a first step, or add a "print this session" button with print-optimised CSS.
- **Status**: Defer.

### DCK-1: Docker Packaging
- **What**: Package as a Docker container for easy deployment.
- **Considerations**: Straightforward once features are stabilised.
- **Status**: Defer.

### HST-1: HTTP Server Mode
- **What**: Optional HTTP server for local access to generated HTML.
- **Considerations**: Simple static file server (e.g., `node -e "..."` or `npx serve`). Could be added as a CLI flag.
- **Status**: Defer.

### CDT-1: Diff View for Edit Tool Calls
- **What**: Show unified diff view for `edit` tool calls (what changed in the file).
- **Considerations**: Requires comparing before/after file content. May not be available in tool call arguments alone.
- **Status**: Defer — needs more investigation into edit tool data.

---

## Priority Order

1. **MR-1** — Markdown rendering (biggest visual impact)
2. **SH-1** — Syntax highlighting (complements MR-1)
3. **CP-1** — Copy buttons (high utility, straightforward)
4. **SR-3** — Client-side search on session pages
5. **TV-1** — Token usage visualisation
6. **SR-4** — Index page search/filter
7. **DF-1** — British date consistency (quick fix)
8. **BI-1** — Back to index link (quick fix)
9. **FC-1** — Favicon (quick fix)
10. **TF-1** — Tool call argument formatting
11. **ST-1** — Session tree full depth
12. **TD-1** — Thinking block duration
