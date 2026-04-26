'use strict';

const path = require('path');

/**
 * SI-1: Index generator
 * Generate index.html with all sessions displayed as flexbox cards
 * sorted by newest first (no directory grouping).
 */
function generateIndex(sessionList) {
  // Sort all sessions by newest first (timestamp is ISO string)
  const sorted = [...sessionList].sort((a, b) => {
    const tsA = a.timestamp || '';
    const tsB = b.timestamp || '';
    return tsB.localeCompare(tsA);
  });

  // Build HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pi Sessions — Index</title>
  <style>
    :root {
      --bg: #fafafa;
      --text: #1a1a1a;
      --border: #e0e0e0;
      --accent: #1976d2;
      --card-bg: #ffffff;
      --user-color: #1565c0;
      --assistant-color: #2e7d32;
      --tool-color: #e65100;
      --thinking-color: #757575;
      --result-color: #4527a0;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a2e;
        --text: #e0e0e0;
        --border: #333;
        --accent: #64b5f6;
        --card-bg: #2d2d44;
        --user-color: #64b5f6;
        --assistant-color: #a5d6a7;
        --tool-color: #ffb74d;
        --thinking-color: #9e9e9e;
        --result-color: #b388ff;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 2rem;
      line-height: 1.6;
    }
    h1 { margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .sessions-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .session-card {
      flex: 1 1 340px;
      max-width: 420px;
      min-width: 280px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1.15rem;
      transition: box-shadow 0.15s, border-color 0.15s;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .session-card:hover {
      border-color: var(--accent);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .session-card a {
      color: var(--text);
      text-decoration: none;
    }
    .session-card a:hover { text-decoration: underline; }
    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }
    .card-title {
      font-weight: 600;
      font-size: 0.95rem;
      line-height: 1.3;
      flex: 1;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card-date {
      font-size: 0.75rem;
      color: #888;
      white-space: nowrap;
    }
    .card-dir {
      font-size: 0.78rem;
      color: #888;
      background: var(--border);
      border-radius: 3px;
      padding: 0.15rem 0.45rem;
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-preview {
      font-size: 0.82rem;
      color: var(--user-color);
      background: var(--card-bg);
      border-left: 3px solid var(--user-color);
      padding: 0.4rem 0.6rem;
      border-radius: 0 4px 4px 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: #888;
    }
    .card-meta-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.72rem;
      font-weight: 500;
    }
    .badge-user {
      background: #e3f2fd;
      color: var(--user-color);
    }
    .badge-assistant {
      background: #e8f5e9;
      color: var(--assistant-color);
    }
    .badge-tool {
      background: #fff3e0;
      color: var(--tool-color);
    }
    .badge-thinking {
      background: #f5f5f5;
      color: var(--thinking-color);
    }
    .badge-result {
      background: #ede7f6;
      color: var(--result-color);
    }
    .badge-model {
      background: var(--border);
      color: #666;
    }
    @media (prefers-color-scheme: dark) {
      .badge-user { background: #0d3b66; }
      .badge-assistant { background: #1b3a20; }
      .badge-tool { background: #3e2424; }
      .badge-thinking { background: #2a2a3e; }
      .badge-result { background: #2a1a4e; }
      .badge-model { background: #333; color: #aaa; }
    }
    .tree-indicator {
      color: var(--accent);
      font-size: 0.8rem;
      cursor: default;
    }
    .no-sessions {
      color: #888;
      padding: 2rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>Pi Sessions</h1>
  <p class="subtitle">Total sessions: ${sessionList.length}</p>
  <div class="sessions-grid">
${sorted.map(session => {
    const hasChildren = session.hasChildren;
    const childrenIcon = hasChildren ? '▶ ' : '';
    const preview = escapeHtml(session.firstUserPrompt || '');
    const previewClass = session.firstUserPrompt ? 'card-preview' : '';
    const previewText = preview.length > 120 ? preview.substring(0, 120) + '…' : preview;
    const dirText = escapeHtml(session.directory || '');
    
    return `    <div class="session-card">
      <div class="card-header">
        <span class="tree-indicator" style="flex-shrink:0">${childrenIcon}</span>
        <a href="${session.link}">
          <div class="card-title">${escapeHtml(session.title || session.sessionId)}</div>
        </a>
        <span class="card-date">${session.date || ''}</span>
      </div>
      <div class="card-dir" title="${dirText}">${dirText}</div>
      <div class="${previewClass}">${previewText}</div>
      <div class="card-meta">
        <span class="badge badge-user" title="User messages">👤 ${session.userCount || 0}</span>
        <span class="badge badge-assistant" title="Assistant messages">💬 ${session.assistantCount || 0}</span>
        <span class="badge badge-tool" title="Tool calls">🔧 ${session.toolCallCount || 0}</span>
        <span class="badge badge-thinking" title="Thinking blocks">💭 ${session.thinkingCount || 0}</span>
        <span class="badge badge-result" title="Tool results">📋 ${session.resultCount || 0}</span>
        ${session.model ? `<span class="badge badge-model" title="Model">${escapeHtml(session.model)}</span>` : ''}
      </div>
    </div>`;
  }).join('\n')}
  </div>
</body>
</html>`;

  return html;
}

/**
 * Helper: Escape HTML.
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
 * Parse session file paths into index entries.
 */
function parseSessionEntries(filePaths) {
  const entries = [];
  
  for (const filePath of filePaths) {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath, '.jsonl');
    const relDir = dir.replace(process.env.HOME, '~');
    
    entries.push({
      filePath,
      directory: relDir,
      fileName,
      title: fileName.substring(0, 30),
      link: `${fileName}.html`,
      timestamp: 0,
      model: '',
      date: '',
      hasChildren: false
    });
  }
  
  return entries;
}

module.exports = {
  generateIndex,
  parseSessionEntries,
  escapeHtml
};
