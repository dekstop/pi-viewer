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
  <style>
    ${CSS}
  </style>
</head>
<body>
  <div class="container">
    <header class="metadata-header">
      ${buildMetadataCard(sessionData)}
    </header>
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
      
      return `<div class="turn turn-${idx + 1}">
        ${userHtml}
        ${assistantHtml}
        ${toolResultsHtml}
      </div>`;
    }).join('\n');

  return turnsHtml;
}

/**
 * Build a user message block.
 */
function buildUserMessage(user) {
  const text = user.text || '';
  const summary = text.split('\n')[0] || 'User message';
  const timestamp = user.timestamp ? formatTimestamp(user.timestamp) : '';
  
  return `<div class="message user-message">
    <div class="message-header">
      <span class="role-badge user-badge">User</span>
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
  
  // Error indicator if there's an error message or unexpected stop reason
  const errorReasons = ['cancelled', 'error', 'load'];
  const isUnexpectedStop = stopReason && !errorReasons.includes(stopReason) && stopReason !== 'toolUse' && stopReason !== 'endTurn';
  
  if (errorMessage || isUnexpectedStop) {
    const errMsg = escapeHtml(errorMessage || `Unexpected stop reason: ${stopReason}`);
    parts.push(`<div class="error-indicator">⚠️ ${errMsg}</div>`);
  }
  
  // Thinking block (collapsible)
  if (thinking && thinking.length > 0) {
    const thinkingText = thinking.join('\n');
    parts.push(`<details class="thinking-block">
      <summary>💭 Thinking</summary>
      <div class="thinking-content">${escapeHtml(thinkingText)}</div>
    </details>`);
  }
  
  // Text content
  if (text) {
    parts.push(`<div class="message-body">${escapeHtml(text)}</div>`);
  }
  
  // Tool calls summary
  if (toolCalls && toolCalls.length > 0) {
    const toolCallHtml = toolCalls.map(tc => {
      let preview = '';
      if (typeof tc.arguments === 'string' && tc.arguments) {
        preview = tc.arguments.substring(0, 50);
      } else if (typeof tc.arguments === 'object' && tc.arguments) {
        // Extract first meaningful value from object arguments
        const keys = Object.keys(tc.arguments);
        preview = keys.map(k => `${k}: ${tc.arguments[k]}`).join(', ').substring(0, 50);
      }
      const icon = getToolCallIcon(tc.name);
      return `<span class="tool-call-badge">${icon} ${escapeHtml(tc.name)}${preview ? ` — ${escapeHtml(preview)}…` : ''}</span>`;
    }).join(' ');
    
    parts.push(`<div class="tool-calls">${toolCallHtml}</div>`);
  }
  
  const timestamp = msg.timestamp ? formatTimestamp(msg.timestamp) : '';
  const model = msg.model || '';
  
  return `<div class="message assistant-message">
    <div class="message-header">
      <span class="role-badge assistant-badge">Assistant</span>
      ${model ? `<span class="model-label">${escapeHtml(model)}</span>` : ''}
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
  
  if (isError) {
    return `<div class="message tool-result-message tool-result-error">
      <div class="message-header">
        <span class="role-badge tool-result-badge">⚠️ Error</span>
        ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
      </div>
      <div class="message-body">${escapeHtml(errorMessage || 'Tool execution failed')}</div>
    </div>`;
  }
  
  const preview = text ? text.trim().substring(0, 200) + (text.length > 200 ? '…' : '') : 'No output';
  const expandClass = text && text.length > 200 ? `<div class="message-full" style="display:none"><pre>${escapeHtml(text.trim())}</pre></div><div class="message-expand" onclick="toggleExpand(this)">${text.length > 200 ? 'Show full result' : 'Show full result'}</div>` : '';
  
  return `<div class="message tool-result-message">
    <div class="message-header">
      <span class="role-badge tool-result-badge">🔧 ${escapeHtml(toolName || 'Tool Result')}</span>
      ${timestamp ? `<span class="message-time">${timestamp}</span>` : ''}
    </div>
    <div class="message-body">${escapeHtml(preview)}</div>
    ${expandClass}
  </div>`;
}

/**
 * HR-3: Metadata card renderer
 * Show model, tokens, cost, duration info.
 */
function buildMetadataCard(sessionData) {
  const { title, timestamp, cwd, currentModel, durationSec, compactionCount, compactionEntries, totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheWriteTokens, totalAllTokens } = sessionData;
  
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
          const summaryHtml = c.summary ? `<div class="compaction-summary">${escapeHtml(c.summary.substring(0, 300))}${c.summary.length > 300 ? '…' : ''}</div>` : '';
          return `<details class="compaction-detail" id="compaction-${idx}">
            <summary>Compaction ${idx + 1}${hookTag}${tokensStr}</summary>
            ${summaryHtml}
          </details>`;
        }).join('\n');
      html += `<div class="compaction-details">${compactionDetails}</div>`;
    }
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
 * Helper: Format Unix timestamp to readable date.
 */
function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
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
  
  .message-time {
    margin-left: auto;
    color: #888;
    font-size: 0.75rem;
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
 * Inline JS for expand/collapse behavior.
 */
const JS = `
  function toggleExpand(el) {
    const parent = el.parentElement;
    const fullMsg = parent.querySelector('.message-full');
    if (fullMsg) {
      if (fullMsg.style.display === 'none') {
        fullMsg.style.display = 'block';
        el.textContent = 'Show less';
      } else {
        fullMsg.style.display = 'none';
        el.textContent = 'Show full message';
      }
    }
  }
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
