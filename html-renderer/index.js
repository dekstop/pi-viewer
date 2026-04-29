'use strict';

/**
 * HR-1: Page builder
 * Generate a full HTML document with inline CSS, inline JS, metadata header, conversation body.
 */
function buildPage(sessionData, options = {}) {
  const { title: pageTitle } = options;
  const title = pageTitle || `${sessionData.title} — Pi Session`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/marked@14.1.0/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/lib/highlight.min.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/styles/github.min.css">
  <style>
    ${CSS}
  </style>
</head>
<body>
  <div class="container">
    <header class="metadata-header">
      ${buildMetadataCard(sessionData)}
    </header>
    <div class="search-bar" id="search-bar">
      <input type="text" id="search-input" placeholder="Search messages…" autocomplete="off" />
      <span class="search-count" id="search-count"></span>
      <button class="search-nav" id="search-prev" title="Previous match" style="display:none">‹</button>
      <button class="search-nav" id="search-next" title="Next match" style="display:none">›</button>
    </div>
    <div class="content">
      ${buildSessionTree(sessionData)}
      <div class="conversation">
        ${buildConversationView(sessionData)}
      </div>
    </div>
  </div>
  <script>${JS}</script>
</body>
</html>`;
}

/**
 * HR-2: Conversation view renderer
 * Render messages in a conversation flow.
 */
function buildConversationView(sessionData) {
  // NEP-3: Reset branch summary tracking for each page render
  _renderedBranchSummaryIds = null;
  
  if (!sessionData.turns || sessionData.turns.length === 0) {
    return '<div class="no-messages">No conversation messages found.</div>';
  }

  const turnsHtml = sessionData.turns
    .filter(turn => turn.user || turn.assistant.length > 0)
    .map((turn, idx) => {
      const userHtml = turn.user ? buildUserMessage(turn.user) : '';
      const assistantHtml = turn.assistant
        .map(msg => buildAssistantMessage(msg))
        .join('\n');
      const toolResultsHtml = (turn.toolResults || [])
        .map(tr => buildToolResultMessage(tr))
        .join('\n');

      // NEP-4: Show label summary if this turn has labels
      const turnLabelHtml = buildTurnLabelSummary(turn);

      // NEP-5: Insert custom messages before this turn if applicable
      const customMessageHtml = buildCustomMessagesBeforeTurn(sessionData, idx);

      // NEP-3: Insert branch summary before this turn if applicable
      const branchSummaryHtml = buildBranchSummaryBeforeTurn(sessionData, idx);

      return `<div class="turn turn-${idx + 1}">
        ${customMessageHtml}
        ${branchSummaryHtml}
        ${turnLabelHtml}
        ${userHtml}
        ${assistantHtml}
        ${toolResultsHtml}
      </div>`;
    }).join('\n');

  // NEP-3: Append any branch summaries that don't attach to a turn
  const remainingBranchSummaries = buildOrphanBranchSummaries(sessionData);

  return turnsHtml + remainingBranchSummaries;
}

/**
 * Build a user message block.
 */
function buildUserMessage(user) {
  const text = user.text || '';
  const summary = text.split('\n')[0] || 'User message';
  const timestamp = user.timestamp ? formatTimestamp(user.timestamp) : '';
  const labelHtml = user.label ? buildBookmarkIndicator(user.label) : '';
  
  return `<div class="message user-message">
    <div class="message-header">
      <span class="role-badge user-badge">User</span>
      ${labelHtml}
      ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
    </div>
    <div class="message-body">${escapeHtml(summary)}</div>
    ${text.includes('\n') ? `<div class="message-full" style="display:none"><pre>${escapeHtml(text)}</pre></div>
    <div class="message-expand" onclick="toggleExpand(this)">Show full message</div>` : ''}
  </div>`;
}

/**
 * Build an assistant message block with thinking, text, and tool calls.
 */
function buildAssistantMessage(msg) {
  const { thinking, text, toolCalls, stopReason, errorMessage } = msg;
  const parts = [];
  
  // Valid/expected stop reasons: normal completions from the model
  const expectedStopReasons = ['toolUse', 'endTurn', 'stop', 'length', 'cancelled'];
  
  // Show error indicator if there's an error message or truly unexpected stop reason
  if (errorMessage) {
    parts.push(`<div class="error-indicator">⚠️ ${escapeHtml(errorMessage)}</div>`);
  } else if (stopReason && !expectedStopReasons.includes(stopReason)) {
    parts.push(`<div class="error-indicator">⚠️ Unexpected stop reason: ${escapeHtml(stopReason)}</div>`);
  }
  
  // Thinking block (collapsible, MR-1: markdown rendering)
  if (thinking && thinking.length > 0) {
    const thinkingText = thinking.join('\n');
    parts.push(`<details class="thinking-block">
      <summary>💭 Thinking</summary>
      <div class="thinking-content" data-markdown="${escapeHtml(thinkingText)}"></div>
    </details>`);
  }
  
  // Text content (MR-1: markdown rendering)
  if (text) {
    parts.push(`<div class="message-body" data-markdown="${escapeHtml(text)}"></div>`);
  }
  
  // Tool calls summary with inline results (NEP-8)
  if (toolCalls && toolCalls.length > 0) {
    const toolCallHtml = toolCalls.map(tc => {
      const icon = getToolCallIcon(tc.name);
      let preview = '';
      if (typeof tc.arguments === 'string' && tc.arguments) {
        preview = tc.arguments.substring(0, 50);
      } else if (typeof tc.arguments === 'object' && tc.arguments) {
        const keys = Object.keys(tc.arguments);
        preview = keys.map(k => `${k}: ${tc.arguments[k]}`).join(', ').substring(0, 50);
      }

      const badgeId = `tc-${tc.toolCallId || tc.name}-${Math.random().toString(36).slice(2, 8)}`;

      // Show result inline if available
      let resultHtml = '';
      if (tc.result) {
        const resultClass = tc.result.isError ? 'result-error' : 'result-success';
        const resultIcon = tc.result.isError ? '❌' : '✅';
        const resultText = tc.result.errorMessage || tc.result.text;
        const previewText = resultText ? resultText.substring(0, 100) : '';
        const isLong = (resultText || '').length > 100;
        const expandId = `tr-${tc.toolCallId || tc.name}-${Math.random().toString(36).slice(2, 8)}`;
        resultHtml = `<span class="tool-call-result ${resultClass}">${resultIcon} ${escapeHtml(tc.result.toolName || '')}${isLong ? ` ${escapeHtml(previewText)}…` : ''}</span>`;
        if (isLong && resultText) {
          resultHtml += `<span class="tool-call-result-full" style="display:none" id="${expandId}">${escapeHtml(resultText)}</span>`;
          resultHtml += ` <span class="tool-call-result-expand" data-target="${expandId}" onclick="toggleToolResult(this)">Show full result</span>`;
        }
      }

      return `<span class="tool-call-badge" id="${badgeId}">${icon} ${escapeHtml(tc.name)}${preview ? ` — ${escapeHtml(preview)}…` : ''}${resultHtml}</span>`;
    }).join(' ');

    parts.push(`<div class="tool-calls">${toolCallHtml}</div>`);
  }
  
  const timestamp = msg.timestamp ? formatTimestamp(msg.timestamp) : '';
  const model = msg.model || '';
  let stopBadge = '';
  if (stopReason) {
    const stopLabel = stopReason === 'toolUse' ? '🔧 Tool' : stopReason === 'endTurn' ? '✅ End' : stopReason === 'stop' ? '⏹ Stop' : stopReason === 'length' ? '📏 Length' : `⚠️ ${stopReason}`;
    stopBadge = `<span class="stop-badge" title="Stop reason: ${escapeHtml(stopReason)}">${stopLabel}</span>`;
  }
  
  return `<div class="message assistant-message">
    <div class="message-header">
      <span class="role-badge assistant-badge">Assistant</span>
      ${model ? `<span class="model-label">${escapeHtml(model)}</span>` : ''}
      ${stopBadge}
      ${msg.label ? buildBookmarkIndicator(msg.label) : ''}
      ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
    </div>
    <div class="message-body-wrapper">
      ${parts.join('\n')}
    </div>
  </div>`;
}

/**
 * Build a tool result message block.
 */
function buildToolResultMessage(msg) {
  const { text, toolName, isError, errorMessage } = msg;
  const timestamp = msg.timestamp ? formatTimestamp(msg.timestamp) : '';
  const labelHtml = msg.label ? buildBookmarkIndicator(msg.label) : '';
  
  if (isError) {
    return `<div class="message tool-result-message tool-result-error">
      <div class="message-header">
        <span class="role-badge tool-result-badge">⚠️ Error</span>
        ${labelHtml}
        ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
      </div>
      <div class="message-body">${escapeHtml(errorMessage || 'Tool execution failed')}</div>
    </div>`;
  }
  
  const preview = text ? text.trim().substring(0, 200) + (text.length > 200 ? '…' : '') : 'No output';
  const expandClass = text && text.length > 200 ? `<div class="message-full" style="display:none"><pre data-markdown="${escapeHtml(text.trim())}"></pre></div><div class="message-expand" onclick="toggleExpand(this)">${text.length > 200 ? 'Show full result' : 'Show full result'}</div>` : '';
  
  return `<div class="message tool-result-message">
    <div class="message-header">
      <span class="role-badge tool-result-badge">🔧 ${escapeHtml(toolName || 'Tool Result')}</span>
      ${labelHtml}
      ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
    </div>
    <div class="message-body" data-markdown="${escapeHtml(preview)}"></div>
    ${expandClass}
  </div>`;
}

/**
 * HR-3: Metadata card renderer
 * Show model, tokens, cost, duration info.
 */
function buildMetadataCard(sessionData) {
  const { title, timestamp, cwd, currentModel, durationSec, compactionCount, compactionEntries, labelEntries, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheWriteTokens, totalAllTokens } = sessionData;
  
  let html = `<h1>${escapeHtml(title)}</h1>`;
  
  if (timestamp) {
    html += `<div class="meta-row">📅 ${formatTimestamp(timestamp)}</div>`;
  }
  
  if (currentModel) {
    html += `<div class="meta-row">🤖 ${escapeHtml(currentModel.provider || '')} / ${escapeHtml(currentModel.model || '')}</div>`;
  }
  
  if (durationSec !== undefined) {
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    html += `<div class="meta-row">⏱ Duration: ${durStr}</div>`;
  }
  
  if (cwd) {
    html += `<div class="meta-row">📁 ${escapeHtml(cwd)}</div>`;
  }
  
  // Token usage stats
  if (totalAllTokens > 0) {
    html += `<div class="meta-row">📊 Token stats:</div>`;
    html += `<div class="meta-row token-stats">`; 
    html += `📥 ${totalInputTokens.toLocaleString()} in `;
    html += `📤 ${totalOutputTokens.toLocaleString()} out `;
    html += `📊 ${totalAllTokens.toLocaleString()} total`;
    if (totalCacheReadTokens > 0) {
      html += ` • 🧠 ${totalCacheReadTokens.toLocaleString()} cached`;
      if (totalCacheWriteTokens > 0) {
        html += `/ ${totalCacheWriteTokens.toLocaleString()} written`;
      }
    }
    html += `</div>`;
  }
  
  if (compactionCount > 0) {
    const hookCount = (compactionEntries || []).filter(c => c.fromHook).length;
    html += `<div class="meta-row">🗑 Compactions: ${compactionCount}${hookCount > 0 ? ` (${hookCount} auto)` : ''}</div>`;
    
    // Render expandable compaction summaries
    if (compactionEntries && compactionEntries.length > 0) {
      const compactionDetails = compactionEntries
        .map((c, idx) => {
          const hookTag = c.fromHook ? ' <span class="hook-tag">auto</span>' : '';
          const tokensStr = c.tokensBefore ? ` • ${c.tokensBefore.toLocaleString()} tokens` : '';
          const summaryHtml = c.summary ? `<div class="compaction-summary" data-markdown="${escapeHtml(c.summary.substring(0, 300))}${c.summary.length > 300 ? '…' : ''}"></div>` : '';
          return `<details class="compaction-detail" id="compaction-${idx}">
            <summary>Compaction ${idx + 1}${hookTag}${tokensStr}</summary>
            ${summaryHtml}
          </details>`;
        }).join('\n');
      html += `<div class="compaction-details">${compactionDetails}</div>`;
    }
  }
  
  // NEP-4: Show label count
  const labelCount = labelEntries ? labelEntries.filter(l => l.label).length : 0;
  if (labelCount > 0) {
    const labelsDisplay = labelEntries
      .filter(l => l.label)
      .map(l => escapeHtml(l.label))
      .join(', ');
    const tooltip = labelsDisplay.length > 100 ? labelsDisplay.substring(0, 100) + '…' : labelsDisplay;
    html += `<div class="meta-row" title="Bookmarks: ${labelsDisplay}">🔖 Bookmarks: ${labelCount} <span style="color:#888;font-size:0.78rem">(${tooltip})</span></div>`;
  }
  
  return `<div class="metadata-card">${html}</div>`;
}

/**
 * HR-4: Session tree renderer
 * Show parent-child session tree.
 */
function buildSessionTree(sessionData) {
  if (!sessionData.parentSessionId) {
    return '';
  }
  
  return `<div class="session-tree">
    <h3>Session Tree</h3>
    <ul class="tree-root">
      <li class="tree-node">
        <span class="tree-label">📂 ${escapeHtml(sessionData.parentSessionId.substring(0, 16))}…</span>
        <ul>
          <li class="tree-node tree-current">
            <span class="tree-label tree-label-current">📂 This Session</span>
          </li>
        </ul>
      </li>
    </ul>
  </div>`;
}

/**
 * NEP-3: Build branch summary block(s) before a given turn index.
 * Attaches branch summaries whose fromId matches messages in that turn.
 * Tracks which summaries have been rendered to avoid duplicates.
 */
let _renderedBranchSummaryIds = null;

function buildBranchSummaryBeforeTurn(sessionData, turnIdx) {
  if (!sessionData.branchSummaryEntries || sessionData.branchSummaryEntries.length === 0) {
    return '';
  }
  
  if (_renderedBranchSummaryIds === null) {
    _renderedBranchSummaryIds = new Set();
  }
  
  const turn = sessionData.turns[turnIdx];
  if (!turn) return '';
  
  // Collect all message IDs in this turn
  const turnIds = new Set();
  if (turn.user) turnIds.add(turn.user.id);
  for (const assistant of (turn.assistant || [])) {
    turnIds.add(assistant.id);
  }
  for (const tr of (turn.toolResults || [])) {
    turnIds.add(tr.id);
  }
  
  let html = '';
  for (const bs of sessionData.branchSummaryEntries) {
    if (_renderedBranchSummaryIds.has(bs.id)) continue;
    // Attach if fromId matches any message in this turn
    if (turnIds.has(bs.fromId)) {
      _renderedBranchSummaryIds.add(bs.id);
      html += '\n' + buildBranchSummaryBlock(bs);
    }
  }
  return html;
}

function buildOrphanBranchSummaries(sessionData) {
  if (!sessionData.branchSummaryEntries || sessionData.branchSummaryEntries.length === 0) {
    return '';
  }
  
  let html = '';
  for (const bs of sessionData.branchSummaryEntries) {
    if (!_renderedBranchSummaryIds || !_renderedBranchSummaryIds.has(bs.id)) {
      _renderedBranchSummaryIds.add(bs.id);
      html += '\n' + buildBranchSummaryBlock(bs);
    }
  }
  return html;
}

/**
 * Build a single branch summary block.
 * Styled as a collapsible context block between conversation turns.
 */
function buildBranchSummaryBlock(branchSummary) {
  const timestamp = branchSummary.timestamp ? formatTimestamp(branchSummary.timestamp) : '';
  const hookTag = branchSummary.fromHook ? ' <span class="hook-tag">auto</span>' : '';
  const fromIdPreview = branchSummary.fromId ? `<span class="branch-from-id">${escapeHtml(branchSummary.fromId.substring(0, 12))}…</span>` : '';
  
  return `<div class="branch-summary" id="branch-summary-${branchSummary.id ? branchSummary.id.substring(0, 8) : Math.random().toString(36).slice(2, 8)}">
    <details class="branch-summary-details">
      <summary class="branch-summary-summary">
        🌿 Branch${hookTag} — ${escapeHtml(branchSummary.summary || 'Branch summary').substring(0, 80)}${branchSummary.summary && branchSummary.summary.length > 80 ? '…' : ''}
        ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
        ${fromIdPreview}
      </summary>
      <div class="branch-summary-content" data-markdown="${escapeHtml(branchSummary.summary || '(no summary)')}"></div>
    </details>
  </div>`;
}

/**
 * NEP-4: Build a bookmark indicator for a labeled message.
 */
function buildBookmarkIndicator(label) {
  return `<span class="bookmark-indicator" title="Bookmark: ${escapeHtml(label)}">🔖 ${escapeHtml(label)}</span>`;
}

/**
 * NEP-4: Build a label summary for a turn that has labeled messages.
 * Shows the label text above the turn so it's clearly associated.
 */
function buildTurnLabelSummary(turn) {
  const labels = [];
  if (turn.user && turn.user.label) labels.push({ id: turn.user.id, label: turn.user.label, role: 'User' });
  for (const a of (turn.assistant || [])) {
    if (a.label) labels.push({ id: a.id, label: a.label, role: 'Assistant' });
  }
  for (const tr of (turn.toolResults || [])) {
    if (tr.label) labels.push({ id: tr.id, label: tr.label, role: 'Tool Result' });
  }

  if (labels.length === 0) return '';

  const labelItems = labels.map(l => `<span class="bookmark-indicator" title="${escapeHtml(l.label)}">🔖 ${escapeHtml(l.label)}</span>`);
  return `<div class="turn-labels">${labelItems.join(' ')}</div>`;
}

/**
 * NEP-5: Build custom_message block(s) before a given turn index.
 * Custom messages are extension-injected messages that participate in LLM context.
 */
let _renderedCustomMessageIds = null;

function buildCustomMessagesBeforeTurn(sessionData, turnIdx) {
  if (!sessionData.customMessageEntries || sessionData.customMessageEntries.length === 0) {
    return '';
  }

  if (_renderedCustomMessageIds === null) {
    _renderedCustomMessageIds = new Set();
  }

  const turn = sessionData.turns[turnIdx];
  if (!turn) return '';

  // Collect all message IDs in this turn
  const turnIds = new Set();
  if (turn.user) turnIds.add(turn.user.id);
  for (const assistant of (turn.assistant || [])) {
    turnIds.add(assistant.id);
  }
  for (const tr of (turn.toolResults || [])) {
    turnIds.add(tr.id);
  }

  // Also collect all message IDs up to this turn (for messages that reference earlier entries)
  const allPrevIds = new Set();
  for (let i = 0; i <= turnIdx; i++) {
    const t = sessionData.turns[i];
    if (t) {
      if (t.user) allPrevIds.add(t.user.id);
      for (const a of (t.assistant || [])) allPrevIds.add(a.id);
      for (const tr of (t.toolResults || [])) allPrevIds.add(tr.id);
    }
  }

  let html = '';
  for (const cm of sessionData.customMessageEntries) {
    if (_renderedCustomMessageIds.has(cm.id)) continue;
    if (cm.display === false) continue;
    // Render custom messages that match this turn or have been unattached so far
    // Custom messages without a clear parent are rendered before all turns
    if (allPrevIds.has(cm.id) || _renderedCustomMessageIds.size === 0) {
      _renderedCustomMessageIds.add(cm.id);
      html += '\n' + buildCustomMessageBlock(cm);
    }
  }
  return html;
}

/**
 * Build a single custom_message block.
 * Styled as a distinct message type (different from regular user messages).
 */
function buildCustomMessageBlock(cm) {
  const timestamp = cm.timestamp ? formatTimestamp(cm.timestamp) : '';
  const typeTag = cm.customType ? `<span class="custom-type-tag">${escapeHtml(cm.customType)}</span>` : '';
  const content = cm.content || '';
  const preview = content.trim().substring(0, 200) || '(empty)';
  const isLong = content.length > 200;
  
  return `<div class="message custom-message">
    <div class="message-header">
      <span class="role-badge custom-badge">📦 Custom</span>
      ${typeTag}
      ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
    </div>
    <div class="message-body" data-markdown="${escapeHtml(preview)}"></div>
    ${isLong ? `<div class="message-full" style="display:none"><pre data-markdown="${escapeHtml(content.trim())}"></pre></div>
    <div class="message-expand" onclick="toggleExpand(this)">Show full message</div>` : ''}
  </div>`;
}

/**
 * Helper: Get icon for tool call type.
 */
function getToolCallIcon(name) {
  const icons = {
    'read': '📖',
    'write': '✍️',
    'bash': '⚡',
    'edit': '🔧'
  };
  return icons[name] || '🔧';
}

/**
 * DF-1a: Format Unix timestamp to ISO string for client-side locale-aware formatting.
 * The actual formatting is done in the generated HTML via JS to respect the viewer's locale.
 */
function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toISOString();
}

/**
 * Helper: Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Inline CSS for the page.
 */
const CSS = `
  :root {
    --bg: #fafafa;
    --text: #1a1a1a;
    --border: #e0e0e0;
    --user-bg: #e3f2fd;
    --assistant-bg: #f5f5f5;
    --user-text: #1565c0;
    --code-bg: #f0f0f0;
    --accent: #1976d2;
  }
  
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a2e;
      --text: #e0e0e0;
      --border: #333;
      --user-bg: #0d3b66;
      --assistant-bg: #2d2d44;
      --user-text: #64b5f6;
      --code-bg: #2a2a3e;
      --accent: #64b5f6;
    }
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 1rem;
  }
  
  .container {
    max-width: 900px;
    margin: 0 auto;
  }
  
  .metadata-header {
    margin-bottom: 1.5rem;
  }
  
  .metadata-card {
    background: var(--assistant-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem 1.25rem;
    font-size: 0.9rem;
  }
  
  .metadata-card h1 {
    font-size: 1.4rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
  }
  
  .meta-row {
    display: inline-block;
    margin-right: 1.5rem;
    margin-bottom: 0.5rem;
    color: #666;
  }
  
  .meta-row .token-stats {
    display: block;
    margin-left: 2rem;
    font-size: 0.82rem;
    color: #888;
  }
  
  .error-indicator {
    background: #ffebee;
    border: 1px solid #ef9a9a;
    border-radius: 4px;
    padding: 0.35rem 0.6rem;
    font-size: 0.82rem;
    color: #c62828;
    margin-top: 0.5rem;
  }
  
  @media (prefers-color-scheme: dark) {
    .error-indicator {
      background: #3e2424;
      border-color: #6c4a4a;
      color: #ef9a9a;
    }
  }
  
  @media (prefers-color-scheme: dark) {
    .meta-row { color: #aaa; }
  }
  
  .content {
    display: flex;
    gap: 1.5rem;
  }

  /* SR-3: Search bar styling */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.5rem;
    background: var(--assistant-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  #search-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.9rem;
    background: var(--bg);
    color: var(--text);
    outline: none;
  }

  #search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
  }

  .search-count {
    font-size: 0.8rem;
    color: #888;
    white-space: nowrap;
    min-width: 80px;
    text-align: right;
  }

  .search-nav {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .search-nav:hover {
    background: var(--code-bg);
  }

  /* SR-3: Search match highlighting */
  .search-highlight {
    background: #fff59d;
    color: inherit;
    border-radius: 2px;
    padding: 0.05rem 0.1rem;
  }

  @media (prefers-color-scheme: dark) {
    .search-highlight {
      background: #757500;
    }
  }

  .search-highlight.current {
    background: #ffeb3b;
    box-shadow: 0 0 0 2px #f57f17;
  }

  @media (prefers-color-scheme: dark) {
    .search-highlight.current {
      background: #c6ff00;
      box-shadow: 0 0 0 2px #f57c00;
    }
  }
  
  .session-tree {
    flex-shrink: 0;
    min-width: 180px;
  }
  
  .session-tree h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
    margin-bottom: 0.5rem;
  }
  
  .tree-root, .tree-root ul {
    list-style: none;
    padding-left: 1rem;
  }
  
  .tree-node {
    margin: 0.3rem 0;
    font-size: 0.85rem;
  }
  
  .tree-label {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  
  .tree-label-current {
    background: var(--accent);
    color: white;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    font-weight: 500;
  }
  
  .conversation {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .turn {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .message {
    border-radius: 8px;
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
  }
  
  .user-message {
    background: var(--user-bg);
    border-left: 3px solid #2196f3;
  }
  
  .assistant-message {
    background: var(--assistant-bg);
    border-left: 3px solid #4caf50;
  }
  
  .message-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }
  
  .role-badge {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
  }
  
  .user-badge { color: var(--user-text); }
  .assistant-badge { color: #388e3c; }
  
  .model-label {
    background: var(--code-bg);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.75rem;
  }
  
  .stop-badge {
    background: var(--code-bg);
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.72rem;
    color: #555;
    border: 1px solid var(--border);
  }
  
  @media (prefers-color-scheme: dark) {
    .stop-badge {
      color: #bbb;
    }
  }
  
  .message-time {
    margin-left: auto;
    color: #888;
    font-size: 0.75rem;
  }
  
  /* NEP-3: Branch summary blocks */
  .branch-summary {
    margin: 0.5rem 0;
  }
  
  .branch-summary-details {
    border: 1px dashed #ce93c8;
    border-radius: 6px;
    overflow: hidden;
    background: rgba(206, 145, 200, 0.06);
  }
  
  @media (prefers-color-scheme: dark) {
    .branch-summary-details {
      border-color: #7b4fa0;
      background: rgba(123, 79, 160, 0.12);
    }
  }
  
  .branch-summary-summary {
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: #7b1fa2;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  @media (prefers-color-scheme: dark) {
    .branch-summary-summary {
      color: #ce93c8;
    }
  }
  
  .branch-summary-content {
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    color: #666;
    background: var(--code-bg);
    white-space: pre-wrap;
    line-height: 1.5;
  }
  
  .branch-from-id {
    font-size: 0.7rem;
    color: #999;
    font-family: monospace;
  }

  /* NEP-4: Bookmark indicators */
  .bookmark-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #fff3e0;
    color: #e65100;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.72rem;
    font-weight: 500;
    margin-left: 0.35rem;
  }

  @media (prefers-color-scheme: dark) {
    .bookmark-indicator {
      background: #3e3a2a;
      color: #ffb74d;
    }
  }

  .turn-labels {
    margin-top: 0.35rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  
  .message-body {
    font-size: 0.95rem;
    line-height: 1.7;
  }
  
  .message-body pre {
    background: var(--code-bg);
    padding: 0.75rem 1rem;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 0.85rem;
  }
  
  /* MR-1e: Markdown rendering styles */
  .message-body h1,
  .message-body h2,
  .message-body h3,
  .message-body h4,
  .message-body h5,
  .message-body h6 {
    margin: 0.8rem 0 0.4rem;
    font-weight: 600;
    line-height: 1.3;
  }
  
  .message-body h1 { font-size: 1.3rem; }
  .message-body h2 { font-size: 1.15rem; }
  .message-body h3 { font-size: 1.05rem; }
  
  .message-body p {
    margin: 0.5rem 0;
  }
  
  .message-body p:first-child {
    margin-top: 0;
  }
  
  .message-body ul,
  .message-body ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  
  .message-body li {
    margin: 0.25rem 0;
  }
  
  .message-body blockquote {
    margin: 0.5rem 0;
    padding: 0.35rem 0.75rem;
    border-left: 3px solid var(--accent);
    color: #666;
    background: var(--code-bg);
    border-radius: 0 4px 4px 0;
  }
  
  @media (prefers-color-scheme: dark) {
    .message-body blockquote {
      color: #aaa;
    }
  }
  
  .message-body table {
    border-collapse: collapse;
    margin: 0.5rem 0;
    width: 100%;
    overflow-x: auto;
    display: block;
  }
  
  .message-body th,
  .message-body td {
    border: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    text-align: left;
  }
  
  .message-body th {
    background: var(--code-bg);
    font-weight: 600;
  }
  
  .message-body tr:nth-child(even) {
    background: var(--code-bg);
  }
  
  .message-body hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 1rem 0;
  }
  
  .message-body a {
    color: var(--accent);
    text-decoration: underline;
  }
  
  .message-body img {
    max-width: 100%;
    border-radius: 4px;
  }
  
  .message-body code {
    background: var(--code-bg);
    padding: 0.15rem 0.35rem;
    border-radius: 3px;
    font-size: 0.88em;
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
  }
  
  .message-body pre {
    margin: 0.5rem 0;
  }
  
  .message-body pre code {
    background: none;
    padding: 0;
    border-radius: 0;
    font-size: 0.85rem;
  }

  /* SH-1: Syntax highlighting for code blocks */
  .message-body pre code,
  .thinking-content pre code,
  .tool-result-message pre code,
  .custom-message pre code,
  .branch-summary-content pre code,
  .compaction-summary pre code {
    display: block;
    overflow-x: auto;
  }

  .message-body code,
  .thinking-content code,
  .tool-result-message code,
  .custom-message code,
  .branch-summary-content code,
  .compaction-summary code {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace;
  }

  /* highlight.js overrides for message bodies */
  .message-body .hljs,
  .thinking-content .hljs,
  .tool-result-message .hljs,
  .custom-message .hljs,
  .branch-summary-content .hljs,
  .compaction-summary .hljs {
    background: var(--code-bg) !important;
    padding: 0.75rem 1rem !important;
    border-radius: 6px !important;
    overflow-x: auto !important;
  }

  @media (prefers-color-scheme: dark) {
    /* highlight.js dark mode */
    .message-body .hljs,
    .thinking-content .hljs,
    .tool-result-message .hljs,
    .custom-message .hljs,
    .branch-summary-content .hljs,
    .compaction-summary .hljs {
      background: #2d2d44 !important;
    }
  }
  
  /* MR-1e: Markdown styles for thinking blocks */
  .thinking-content h1,
  .thinking-content h2,
  .thinking-content h3,
  .thinking-content h4,
  .thinking-content h5,
  .thinking-content h6 {
    margin: 0.5rem 0 0.25rem;
    font-size: 0.9rem;
    color: #888;
  }
  
  .thinking-content p {
    margin: 0.3rem 0;
  }
  
  .thinking-content ul,
  .thinking-content ol {
    margin: 0.3rem 0;
    padding-left: 1.25rem;
  }
  
  .thinking-content li {
    margin: 0.15rem 0;
  }
  
  .thinking-content code {
    background: rgba(0,0,0,0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  
  .thinking-content pre {
    margin: 0.4rem 0;
  }
  
  /* MR-1e: Markdown styles for branch summaries */
  .branch-summary-content h1,
  .branch-summary-content h2,
  .branch-summary-content h3 {
    margin: 0.4rem 0 0.2rem;
    font-size: 0.88rem;
  }
  
  .branch-summary-content p {
    margin: 0.3rem 0;
  }
  
  .branch-summary-content code {
    background: rgba(0,0,0,0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  
  .branch-summary-content pre {
    margin: 0.3rem 0;
  }
  
  /* MR-1e: Markdown styles for compaction summaries */
  .compaction-summary h1,
  .compaction-summary h2,
  .compaction-summary h3 {
    margin: 0.4rem 0 0.2rem;
    font-size: 0.88rem;
  }
  
  .compaction-summary p {
    margin: 0.3rem 0;
  }
  
  .compaction-summary code {
    background: rgba(0,0,0,0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  
  .compaction-summary pre {
    margin: 0.3rem 0;
  }
  
  .message-expand {
    color: var(--accent);
    cursor: pointer;
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }
  
  .message-expand:hover {
    text-decoration: underline;
  }
  
  .thinking-block {
    margin-bottom: 0.75rem;
    border: 1px dashed var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  
  .thinking-block summary {
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
    color: #888;
  }
  
  .thinking-content {
    padding: 0.75rem;
    font-size: 0.85rem;
    color: #666;
    background: var(--code-bg);
  }
  
  .tool-calls {
    margin-top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  
  .compaction-details {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  
  .compaction-detail {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  
  .compaction-detail summary {
    padding: 0.4rem 0.75rem;
    cursor: pointer;
    font-size: 0.82rem;
    color: #888;
    background: var(--code-bg);
  }
  
  .compaction-summary {
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    color: #666;
    white-space: pre-wrap;
  }
  
  .hook-tag {
    font-size: 0.7rem;
    padding: 0.1rem 0.3rem;
    background: var(--accent);
    color: white;
    border-radius: 3px;
    margin-left: 0.3rem;
  }
  
  .tool-call-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.78rem;
    color: #555;
  }
  
  .tool-result-message {
    border-left: 3px solid #ff9800;
    opacity: 0.85;
  }
  
  .tool-result-error {
    border-left: 3px solid #f44336;
    opacity: 0.85;
  }
  
  .tool-result-badge {
    color: #e65100;
  }
  
  .tool-result-error .tool-result-badge {
    color: #d32f2f;
  }
  
  @media (prefers-color-scheme: dark) {
    .tool-result-badge {
      color: #ffb74d;
    }
    .tool-result-error .tool-result-badge {
      color: #ef9a9a;
    }
  }

  /* NEP-5: Custom message entries */
  .custom-message {
    background: linear-gradient(135deg, #e3f2fd, #f3e5f5);
    border-left: 3px solid #9c27b0;
    opacity: 0.92;
  }

  @media (prefers-color-scheme: dark) {
    .custom-message {
      background: linear-gradient(135deg, #1a3a5c, #3a1a5c);
    }
  }

  .custom-badge {
    color: #7b1fa2;
  }

  @media (prefers-color-scheme: dark) {
    .custom-badge {
      color: #ce93c8;
    }
  }

  .custom-type-tag {
    background: #f3e5f5;
    color: #7b1fa2;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
    font-size: 0.72rem;
    font-family: monospace;
    margin-left: 0.35rem;
  }

  @media (prefers-color-scheme: dark) {
    .custom-type-tag {
      background: #3e2a5c;
      color: #ce93c8;
    }
  }

  /* NEP-8: Inline tool call results */
  .tool-call-result {
    margin-left: 0.3rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .tool-call-result.result-success {
    background: #e8f5e9;
    color: #2e7d32;
  }
  
  .tool-call-result.result-error {
    background: #ffebee;
    color: #c62828;
  }
  
  @media (prefers-color-scheme: dark) {
    .tool-call-result.result-success {
      background: #1b3a20;
      color: #a5d6a7;
    }
    .tool-call-result.result-error {
      background: #3e2424;
      color: #ef9a9a;
    }
  }
  
  .tool-call-result-expand {
    color: var(--accent);
    cursor: pointer;
    font-size: 0.72rem;
    margin-left: 0.2rem;
  }
  
  .tool-call-result-expand:hover {
    text-decoration: underline;
  }
  
  @media (max-width: 600px) {
    .content {
      flex-direction: column;
    }
    .session-tree {
      display: none;
    }
  }
`;

/**
 * Inline JS for expand/collapse and markdown rendering.
 */
const JS = `
  // MR-1: Client-side markdown renderer
  // Escapes HTML first (XSS prevention), then renders markdown
  const MARKED_CONFIG = {
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  };

  function renderMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    // Escape HTML first to prevent XSS
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    // Then parse as markdown
    try {
      return marked.parse(escaped, MARKED_CONFIG);
    } catch (e) {
      return '<span style="color:red">[Markdown render error]</span>';
    }
  }

  // SH-1: Apply syntax highlighting to code blocks after markdown rendering
  function highlightCodeBlocks() {
    if (typeof hljs === 'undefined') return;
    // Find all pre > code blocks and highlight them
    document.querySelectorAll('pre code').forEach(function(block) {
      hljs.highlightElement(block);
    });
  }

  // MR-1: Post-process all message bodies to render markdown
  function renderAllMarkdown() {
    // Process assistant message bodies
    document.querySelectorAll('.assistant-message .message-body').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process thinking content
    document.querySelectorAll('.thinking-content').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process tool result bodies (preview)
    document.querySelectorAll('.tool-result-message .message-body').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process expanded tool result content
    document.querySelectorAll('.tool-result-message .message-full pre').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process custom message bodies
    document.querySelectorAll('.custom-message .message-body').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process expanded custom message content
    document.querySelectorAll('.custom-message .message-full pre').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process branch summary content
    document.querySelectorAll('.branch-summary-content').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // Process compaction summary content
    document.querySelectorAll('.compaction-summary').forEach(function(el) {
      const raw = el.getAttribute('data-markdown');
      if (raw && raw !== '') {
        el.innerHTML = renderMarkdown(raw);
      }
    });

    // SH-1: Apply syntax highlighting to code blocks
    highlightCodeBlocks();
  }
  // Uses the viewer's system locale for consistent formatting across all machines
  function formatTimestamp(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }) + ', ' + d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  // Run markdown rendering after DOM is ready
  if (typeof marked !== 'undefined') {
    document.addEventListener('DOMContentLoaded', renderAllMarkdown);
  }

  function toggleExpand(el) {
    const parent = el.parentElement;
    const fullMsg = parent.querySelector('.message-full');
    if (fullMsg) {
      if (fullMsg.style.display === 'none') {
        fullMsg.style.display = 'block';
        el.textContent = 'Show less';
        // Render markdown when expanding
        renderAllMarkdown();
      } else {
        fullMsg.style.display = 'none';
        el.textContent = 'Show full message';
      }
    }
  }

  // NEP-8: Toggle inline tool call result expansion
  function toggleToolResult(el) {
    const targetId = el.dataset.target;
    const fullText = document.getElementById(targetId);
    if (fullText) {
      if (fullText.style.display === 'none') {
        fullText.style.display = 'inline';
        el.textContent = 'Show less';
        // Render markdown when expanding
        renderAllMarkdown();
      } else {
        fullText.style.display = 'none';
        el.textContent = 'Show full result';
      }
    }
  }

  // SH-1: Run syntax highlighting when highlight.js is loaded
  if (typeof hljs !== 'undefined') {
    hljs.initHighlightingOnLoad();
  }

  // SR-3: Client-side search functionality
  var _searchMatches = [];
  var _searchCurrentIndex = -1;
  var _searchDebounceTimer = null;

  function escapeRegex(str) {
    return str.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  }

  function removeHighlights() {
    document.querySelectorAll('.search-highlight').forEach(function(el) {
      var parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
  }

  function performSearch(query) {
    removeHighlights();
    _searchMatches = [];
    _searchCurrentIndex = -1;

    var countEl = document.getElementById('search-count');
    var prevBtn = document.getElementById('search-prev');
    var nextBtn = document.getElementById('search-next');

    if (!query || query.length < 2) {
      if (countEl) countEl.textContent = '';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      return;
    }

    // Find all text nodes in the conversation area
    var conversation = document.querySelector('.conversation');
    if (!conversation) return;

    var textNodes = [];
    var walker = document.createTreeWalker(conversation, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    var pattern = escapeRegex(query);
    var regex = new RegExp('(' + pattern + ')', 'gi');

    textNodes.forEach(function(textNode) {
      var text = textNode.nodeValue;
      var match;
      while ((match = regex.exec(text)) !== null) {
        var span = document.createElement('span');
        span.className = 'search-highlight';
        span.textContent = match[0];
        textNode.parentNode.insertBefore(span, textNode.nextSibling);
        textNode.deleteData(match.index, match[0].length);
        _searchMatches.push(span);
      }
    });

    // Update UI
    if (countEl) {
      countEl.textContent = _searchMatches.length > 0 ? _searchMatches.length + ' matches' : 'No matches';
    }
    if (prevBtn) prevBtn.style.display = _searchMatches.length > 0 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = _searchMatches.length > 0 ? 'flex' : 'none';

    // Expand any collapsed sections to show matches
    expandForMatches();
  }

  function expandForMatches() {
    // Expand collapsed details elements to show matches
    document.querySelectorAll('details:not([open])').forEach(function(details) {
      // Check if any content inside would match
      var textContent = details.textContent;
      var input = document.getElementById('search-input');
      if (input && input.value && input.value.length >= 2) {
        var pattern = escapeRegex(input.value);
        var regex = new RegExp('(' + pattern + ')', 'i');
        if (regex.test(textContent)) {
          details.open = true;
        }
      }
    });
  }

  function navigateSearch(direction) {
    if (_searchMatches.length === 0) return;

    // Remove current class
    _searchMatches.forEach(function(el) {
      el.classList.remove('current');
    });

    _searchCurrentIndex += direction;
    if (_searchCurrentIndex >= _searchMatches.length) _searchCurrentIndex = 0;
    if (_searchCurrentIndex < 0) _searchCurrentIndex = _searchMatches.length - 1;

    var current = _searchMatches[_searchCurrentIndex];
    current.classList.add('current');
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Debounced search input handler
  function onSearchInput(e) {
    var query = e.target.value.trim();
    if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(function() {
      performSearch(query);
    }, 250);
  }

  // Wire up search controls
  document.addEventListener('DOMContentLoaded', function() {
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', onSearchInput);
    }

    var prevBtn = document.getElementById('search-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() { navigateSearch(-1); });
    }

    var nextBtn = document.getElementById('search-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() { navigateSearch(1); });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        var searchBar = document.getElementById('search-bar');
        if (searchBar) {
          var input = document.getElementById('search-input');
          if (input) {
            input.focus();
            input.select();
          }
        }
      }
      if (e.key === 'F3' || (e.shiftKey && e.key === 'F3')) {
        e.preventDefault();
        navigateSearch(e.shiftKey ? -1 : 1);
      }
    });
  });
`;

module.exports = {
  buildPage,
  buildConversationView,
  buildUserMessage,
  buildAssistantMessage,
  buildToolResultMessage,
  buildMetadataCard,
  buildSessionTree,
  getToolCallIcon,
  formatTimestamp,
  escapeHtml
};
