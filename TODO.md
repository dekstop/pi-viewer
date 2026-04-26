# TODO — Pi Session Viewer

## ✅ Completed

### Phase 1: Session Reader (`session-reader`) ✅
- [x] **SR-1**: Parse `.jsonl` files
- [x] **SR-2**: Discover session files

### Phase 2: Event Parser (`event-parser`) ✅
- [x] **EP-1**: Session info extractor
- [x] **EP-2**: Model & thinking state tracker
- [x] **EP-3**: Conversation tree builder
- [x] **EP-4**: Message content parser
- [x] **EP-5**: Build session data structure

### Phase 3: HTML Renderer (`html-renderer`) ✅
- [x] **HR-1**: Page builder
- [x] **HR-2**: Conversation view renderer
- [x] **HR-3**: Metadata card renderer
- [x] **HR-4**: Session tree renderer

### Phase 4: Session Indexer ✅
- [x] **SI-1**: Index generator

### Phase 5: Polish & CLI ✅
- [x] **CL-1**: CLI argument parsing
- [x] **CL-2**: Error handling
- [x] **CL-3**: Styling polish (dark mode, mobile-friendly)

---

## 🔄 In Progress

### NEP-4: Parse label entries (bookmarks)
- [ ] **NEP-4a**: Annotate messages/turns with labels in event-parser
- [ ] **NEP-4b**: Add bookmark indicators to HTML renderer
- [ ] **NEP-4c**: Show label count in metadata card

### NEP-5: Parse `custom` and `custom_message` entries
- [ ] **NEP-5a**: Add validTypes for custom and custom_message in session-reader
- [ ] **NEP-5b**: Collect custom_message entries in event-parser
- [ ] **NEP-5c**: Render custom_message blocks in conversation view
- [ ] **NEP-5d**: Style custom_message distinctly from user messages

## ✅ Completed


## ✅ Completed — NEP-6: Extract token usage from assistant messages

- [x] **NEP-6**: Extract token usage from assistant messages — show in metadata card
  - In `buildSessionData()`, extract `usage` field from each assistant message (`input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`)
  - Accumulate session-level token totals
  - HTML metadata card shows token breakdown: `📥 2,889 in / 208 out / 5,325 total` (plus cached tokens if present)
  - Also extracts `stopReason` and `errorMessage` from assistant messages

---

## ✅ Completed — NEP-2: Parse compaction details

- [x] **NEP-2**: Parse compaction details — show summary, token counts, fromHook flag
  - Collect all `compaction` events in `buildSessionData()` as an array of `{summary, tokensBefore, fromHook, details, firstKeptEntryId}` objects
  - HTML metadata card now shows compaction count (with auto-count if hook-triggered)
  - Expandable compaction detail cards showing token counts and summaries

---

## ✅ Completed — NEP-1: Parse `session_info` entries

- [x] **NEP-1**: Parse `session_info` entries — use user-defined session names as titles
  - Added `'session_info'` to `parseJsonl()` valid types
  - In `buildSessionData()`, scan events in reverse for the latest `session_info` entry and extract `name`
  - Use `name` as title if present, fall back to current `deriveTitle()` logic

---

## ✅ Completed — NEP-7: Show `stopReason` and `errorMessage`

- [x] **NEP-7**: Show `stopReason` and `errorMessage` — flag failed API calls
  - In `buildSessionData()`, extract `stopReason` and `errorMessage` from assistant messages
  - Add to enriched assistant message objects alongside `usage`, `model`
  - HTML metadata card shows error indicator (⚠️ error message) when `errorMessage` exists
  - HTML assistant message header shows a stop-reason badge:
    - `🔧 Tool` for `toolUse`
    - `✅ End` for `endTurn`
    - `⏹ Stop` for normal `stop`
    - `📏 Length` for `length` (max tokens reached)
    - `⚠️ <reason>` for unexpected reasons
  - Only `errorMessage` and truly unexpected stop reasons show the warning indicator
  - Normal completion reasons (`stop`, `length`, `toolUse`, `endTurn`, `cancelled`) are NOT flagged
  - Source: `AgentMessage` fields from pi-agent-core + OpenAI API conventions

---

## ✅ Completed — NEP-8: Parse and display tool call results

- [x] **NEP-8**: Parse and display tool call results — correlate toolCall with toolResult
  - In `buildSessionData()`, build a `toolCallId` → result lookup map from `toolResults` in each turn
  - Added `extractResultText()` helper to safely extract text from toolResult content arrays
  - Enrich each tool call with `result` containing: `toolCallId`, `toolName`, `text`, `isError`, `errorMessage`
  - HTML assistant message header shows result preview inline within the tool call badge
  - Color-coded results: ✅ green for success, ❌ red for errors
  - Long results (>100 chars) show collapsed preview with "Show full result" expand link
  - CSS: `.tool-call-result.result-success` and `.tool-call-result.result-error` classes
  - JS: `toggleToolResult()` function for expand/collapse behavior
  - Source: `toolResult` message type with `toolCallId`, `content`, `isError`, `errorMessage` fields

---

## 🔍 New Data from Session Manager Source

The Pi agent's official `session-manager.ts` reveals several event types and data fields currently missing from the viewer:

### Source Reference
File: `packages/coding-agent/src/core/session-manager.ts` (pi-mono repo)

### Entry Types Not Yet Parsed

| Type | Description | Relevant Fields |
|------|-------------|-----------------|
| `session_info` | User-defined session metadata (branching off from `SessionInfoEntry` in source) | `name` — user-set display name; `timestamp` |
| `branch_summary` | Summary of an abandoned conversation branch (from `branchWithSummary()`) | `summary` — text summary; `fromId` — which entry was branched from; `timestamp` |
| `label` | User bookmarks/markers on arbitrary entries | `targetId` — which entry is labeled; `label` — text of bookmark; `timestamp` |
| `custom` | Extension-persisted state data (not in LLM context) | `customType` — extension identifier; `data` — extension data |
| `custom_message` | Extension-injected messages that ARE in LLM context | `customType`; `content`; `display`; `details` |

### Fields on Existing Entry Types Not Currently Captured

| Entry Type | Field | Description | Example from real data |
|------------|-------|-------------|------------------------|
| `message` (assistant) | `usage` | Token counts from API | `{"input":2889,"output":208,"cacheRead":2228,"cacheWrite":0,"totalTokens":5325}` |
| `message` (assistant) | `stopReason` | Why the model stopped | `"toolUse"`, `"endTurn"`, `"length"` |
| `message` (assistant) | `errorMessage` | When API call failed | `"Connection error."` |
| `message` (assistant) | `model` | Model used (duplicate of last model_change) | `"qwen/qwen3.6-35b-a3b"` |
| `message` (assistant) | `api` | API backend used | `"openai-completions"` |
| `message` (toolResult) | `toolCallId` | Links back to the toolCall | Used to correlate calls with results |
| `message` (toolResult) | `toolName` | Which tool produced this result | `"bash"`, `"read"`, `"edit"` |
| `message` (toolResult) | `content` | The actual output of the tool call | Text content of the result |
| `message` (toolResult) | `isError` | Whether the tool call errored | `true`/`false` |
| `message` (toolResult) | `timestamp` | When the result was received | Can calculate round-trip time |
| `compaction` | `summary` | What was compressed | Markdown summary of conversation |
| `compaction` | `tokensBefore` | Token count before compaction | `20415` |
| `compaction` | `details` | Extension-specific data | `{"readFiles":[],"modifiedFiles":[]}` |
| `compaction` | `fromHook` | Whether an extension triggered it | `true`/`false` |
| `session` (header) | `version` | Session schema version | `1`, `2`, or `3` |
| `model_change` | `modelId` | Already parsed (✅) | `"qwen/qwen3.5-9b"` |

---

## 📋 Remaining / Future Enhancements

### 🔥 High Priority — Capture New Data from Session Manager

- [ ] **NEP-1: Parse `session_info` entries**
  - **What**: Add `'session_info'` to `parseJsonl()` valid types. Extract `name` field.
  - **Impact**: Session titles can now come from user-defined names instead of deriving from session IDs.
  - **Implementation**: In `event-parser/index.js` `buildSessionData()`, scan events for `type === 'session_info'`, take the `name` field (latest one wins — walk events in reverse to find the latest, same as `getSessionName()` in source). Use `name` as title if present, fall back to current `deriveTitle()` logic.
  - **Source**: `SessionInfoEntry` interface + `getSessionName()` method in `session-manager.ts`.

- [ ] **NEP-2: Parse compaction details**
  - **What**: Add `'compaction'` entries to parsing (already in validTypes but not used). Extract `summary`, `tokensBefore`, `details`, `firstKeptEntryId`.
  - **Impact**: Show compaction summary text, token counts, and whether it was extension-triggered (`fromHook`).
  - **Implementation**: In `buildSessionData()`, enrich the `compactionCount` field with an array of `{summary, tokensBefore, fromHook, details}` objects instead of just a count.
  - **HTML**: Replace `🗑 Compactions: N` with expandable compaction summaries showing tokens saved.
  - **Source**: `CompactionEntry` interface + `appendCompaction()` method.

- [ ] **NEP-3: Parse `branch_summary` entries**
  - **What**: Add `'branch_summary'` to valid types. Extract `summary`, `fromId`, `timestamp`.
  - **Impact**: When sessions are branched, the abandoned path's summary can be shown as context in the conversation.
  - **Implementation**: Collect all `branch_summary` events in `buildSessionData()`. Render them as special conversation entries between turns.
  - **Source**: `BranchSummaryEntry` interface + `branchWithSummary()` method.

- [ ] **NEP-4: Parse `label` entries**
  - **What**: Add `'label'` to valid types. Extract `targetId` and `label`.
  - **Impact**: Show user bookmarks as markers on the conversation entries they reference.
  - **Implementation**: Build a `labelsById` map (latest label wins for each target). After building turns, annotate turns whose messages match a `targetId` with their label text.
  - **HTML**: Add a visual bookmark indicator (e.g., 🔖) to labeled messages.
  - **Source**: `LabelEntry` interface + `appendLabelChange()` method.

- [ ] **NEP-5: Parse `custom` and `custom_message` entries**
  - **What**: Add `'custom'` and `'custom_message'` to valid types. Extract their fields.
  - **Impact**: Forward-compatible with extension data. `custom_message` entries should be rendered in the conversation flow.
  - **Implementation**: In `buildSessionData()`, collect `custom_message` entries and insert them into the conversation tree at their position. Render them as distinct styled blocks (like a system message).
  - **Source**: `CustomEntry` + `CustomMessageEntry` interfaces.

---

### ⚡ High Priority — Extract Fields from Existing Messages

- [ ] **NEP-6: Extract token usage from assistant messages**
  - **What**: Parse `message.usage` field from assistant messages. Structure: `{input, output, cacheRead, cacheWrite, totalTokens}`.
  - **Impact**: Show actual token counts per message and per session in metadata card.
  - **Implementation**: In `parseMessageContent()` or a new `parseMessageMetadata()`, extract `usage` if present. Add `usage` to enriched assistant message objects.
  - **HTML**: Add token breakdown to metadata card (e.g., `📊 2,889 in / 208 out / 5,325 total`), plus running total across session.
  - **Source**: `usage` field on assistant `AgentMessage` objects.

- [x] **NEP-7: Show `stopReason` and `errorMessage`**
  - **What**: Parse `message.stopReason` and `message.errorMessage` from assistant messages.
  - **Impact**: Visually flag failed API calls and show why the model stopped.
  - **Implementation**: In `buildSessionData()`, extract `stopReason` and `errorMessage` from assistant messages. Add to enriched assistant message objects.
  - **HTML**: Show error indicator (⚠️ error message) when `errorMessage` exists. Show stop-reason badge in assistant message header (`🔧 Tool`, `✅ End`, `⏹ Stop`, `📏 Length`, or `⚠️ <reason>`). Only truly unexpected stop reasons or error messages show the warning indicator.
  - **Source**: `AgentMessage` fields from pi-agent-core.

- [ ] **NEP-8: Parse and display tool call results**
  - **What**: Correlate `toolCall` messages (request) with `toolResult` messages (response). Extract `toolResult.content`, `toolResult.isError`, `toolResult.toolName`.
  - **Impact**: Show what each tool call actually returned — currently tool calls are shown but results are invisible.
  - **Implementation**: Build a lookup map from `toolCallId` → result content. In `buildConversationTree()`, after grouping into turns, match each assistant `toolCall` with its corresponding `toolResult` message from the conversation.
  - **HTML**: Expand tool call badges to show result preview (first 200 chars of output). Color-code results by `isError`.
  - **Source**: `toolResult` message type with `toolCallId` field.

---

### Performance

- [ ] Add pagination or lazy loading for sessions with many turns
- [ ] Cache parsed sessions to avoid re-parsing unchanged files
- [ ] Batch process large session directories

### Features
- [ ] **Token tracking**: Extract and display input/output token counts from session events
- [ ] **Cost estimation**: Show estimated API cost based on model + token counts
- [ ] **Search**: Client-side search across all message content
- [ ] **Export**: PDF export option
- [ ] **Session filtering**: Filter by model, date range, keywords
- [ ] **Timeline view**: Visual timeline of model/thinking changes

### UX
- [ ] **Copy buttons**: Allow copying message text / code blocks
- [ ] **Markdown rendering**: Parse markdown in assistant responses
- [ ] **Code syntax highlighting**: Use a lightweight syntax highlighter
- [ ] **Shareable links**: Generate short URLs for individual sessions
- [ ] **Session tags/folders**: Let users organize sessions into custom groups

### Data
- [ ] **Tool call result parsing**: Show results of executed tool calls (read, bash, edit)
- [ ] **Diff view**: Show changes made by `edit` tool calls
- [ ] **Session merge**: Combine split sessions into single conversation view

### Deployment
- [ ] **Docker**: Package as a Docker container
- [ ] **Web server**: Optional HTTP server mode for local access
- [ ] **CI/CD**: Automated testing and deployment

---

## Priority Queue

### NEP (New Entry Parsing) — High Priority
1. ✅ **NEP-1**: Parse `session_info` entries — DONE
2. ✅ **NEP-2**: Parse compaction details — DONE
3. ✅ **NEP-6**: Extract token usage from assistant messages — DONE
4. ✅ **NEP-7**: Show `stopReason` and `errorMessage` — flag failed API calls
5. ✅ **NEP-8**: Parse and display tool call results — DONE
6. **NEP-3**: Parse `branch_summary` entries — show abandoned path context
7. **NEP-4**: Parse `label` entries — show bookmarks on conversation entries
8. **NEP-5**: Parse `custom` and `custom_message` entries — forward-compatible with extensions

### Traditional Enhancements
1. ~~Token tracking~~ (NEP-6) — DONE
2. Markdown rendering + code syntax highlighting
3. Search functionality
4. Copy buttons
