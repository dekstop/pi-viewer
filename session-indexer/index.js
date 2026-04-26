'use strict';

const path = require('path');

/**
 * SI-1: Index generator
 * Generate index.html with all discovered sessions grouped by directory.
 */
function generateIndex(sessionList) {
  // Group sessions by parent directory
  const grouped = {};
  
  for (const session of sessionList) {
    const dir = session.directory || 'Unknown';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(session);
  }

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
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a2e;
        --text: #e0e0e0;
        --border: #333;
        --accent: #64b5f6;
        --card-bg: #2d2d44;
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
    .section { margin-bottom: 2rem; }
    .section h2 {
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
      color: var(--accent);
    }
    .session-list {
      list-style: none;
    }
    .session-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.4rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      transition: background 0.15s;
    }
    .session-item:hover { background: var(--border); }
    .session-item a {
      color: var(--text);
      text-decoration: none;
      flex: 1;
    }
    .session-item a:hover { text-decoration: underline; }
    .session-title { font-weight: 500; }
    .session-meta {
      font-size: 0.8rem;
      color: #888;
      white-space: nowrap;
    }
    .tree-indicator {
      color: var(--accent);
      font-size: 0.8rem;
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
  <p class="subtitle">Total sessions: ${sessionList.length}</p>`;

  // Render grouped sections
  for (const [dir, sessions] of Object.entries(grouped).sort()) {
    html += `
  <div class="section">
    <h2>${escapeHtml(dir)} (${sessions.length})</h2>
    <ul class="session-list">`;
    
    for (const session of sessions.sort((a, b) => {
      return (b.timestamp || 0) - (a.timestamp || 0);
    })) {
      const hasChildren = session.hasChildren ? 'tree-indicator' : '';
      const childrenIcon = session.hasChildren ? '▶ ' : '';
      
      html += `
      <li class="session-item">
        <span class="tree-indicator">${childrenIcon}</span>
        <a href="${session.link}">
          <span class="session-title">${escapeHtml(session.title || session.sessionId)}</span>
        </a>
        <span class="session-meta">${session.model || ''} · ${session.date || ''}</span>
      </li>`;
    }
    
    html += `
    </ul>
  </div>`;
  }

  html += `
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
