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

  // Group sessions by day for section markers
  const dayGroups = new Map();
  const dayOrder = [];
  for (const session of sorted) {
    const day = session.dayKey || session.date;
    if (!dayGroups.has(day)) {
      dayGroups.set(day, []);
      dayOrder.push(day);
    }
    dayGroups.get(day).push(session);
  }

  // Build HTML
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pi Sessions — Index</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='56' font-size='56' font-family='serif' font-weight='bold' fill='%231976d2'%3Eπ%3C/text%3E%3C/svg%3E" type="image/svg+xml">
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
      padding: 1rem 1.15rem 0.85rem;
      transition: box-shadow 0.15s, border-color 0.15s;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
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
      font-size: 0.75rem;
      color: #888;
      background: var(--border);
      border-radius: 3px;
      padding: 0.12rem 0.4rem;
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .day-marker {
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--accent);
      padding: 0.25rem 0.6rem;
      margin-bottom: 0.3rem;
      border-bottom: 2px solid var(--accent);
      display: inline-block;
      max-width: 100%;
      border-radius: 4px 4px 0 0;
    }

    @media (prefers-color-scheme: dark) {
      .day-marker {
        border-color: var(--accent);
      }
    }
    .card-preview {
      font-size: 0.88rem;
      color: var(--user-color);
      background: var(--card-bg);
      border-left: 3px solid var(--user-color);
      padding: 0.5rem 0.65rem;
      border-radius: 0 4px 4px 0;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
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
    .badge-branch {
      background: #f3e5f5;
      color: #7b1fa2;
    }
    @media (prefers-color-scheme: dark) {
      .badge-user { background: #0d3b66; }
      .badge-assistant { background: #1b3a20; }
      .badge-tool { background: #3e2424; }
      .badge-thinking { background: #2a2a3e; }
      .badge-result { background: #2a1a4e; }
      .badge-model { background: #333; color: #aaa; }
      .badge-branch { background: #3a1f5e; color: #ce93c8; }
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

    /* SR-4: Search and filter controls */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding: 0.75rem;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      align-items: center;
    }
    .filter-bar input[type="text"],
    .filter-bar input[type="number"],
    .filter-bar select {
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.85rem;
      background: var(--bg);
      color: var(--text);
      outline: none;
    }
    .filter-bar input[type="text"]:focus,
    .filter-bar input[type="number"]:focus,
    .filter-bar select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2);
    }
    .filter-bar input[type="text"] {
      flex: 1;
      min-width: 200px;
    }
    .filter-bar input[type="number"] {
      width: 70px;
    }
    .filter-bar label {
      font-size: 0.78rem;
      color: #888;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      align-items: flex-start;
    }
    .filter-bar .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: flex-end;
    }
    .filter-bar .filter-divider {
      width: 1px;
      height: 2rem;
      background: var(--border);
      margin: 0 0.25rem;
    }
    .filter-bar .btn-reset {
      padding: 0.4rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.8rem;
      cursor: pointer;
    }
    .filter-bar .btn-reset:hover {
      background: var(--code-bg);
    }
    .filter-count {
      font-size: 0.82rem;
      color: #888;
      margin-bottom: 0.5rem;
    }

    @media (prefers-color-scheme: dark) {
      .filter-bar {
        background: #2d2d44;
      }
      .filter-bar .btn-reset:hover {
        background: #3a3a5e;
      }
    }
  </style>
</head>
<body>
  <h1>Pi Sessions</h1>
  <p class="subtitle">Total sessions: ${sessionList.length}</p>
  <div class="filter-bar" id="filter-bar">
    <input type="text" id="search-input" placeholder="Search sessions by title, prompt, or ID…" autocomplete="off" />
    <div class="filter-divider"></div>
    <div class="filter-group">
      <label>
        Model
        <select id="model-filter">
          <option value="">All models</option>
          ${[...new Set(sessionList.map(s => s.model).filter(Boolean))].map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('\n')}
        </select>
      </label>
    </div>
    <div class="filter-divider"></div>
    <div class="filter-group">
      <label>
        Min turns
        <input type="number" id="min-turns" min="0" placeholder="0" />
      </label>
      <label>
        Max turns
        <input type="number" id="max-turns" min="0" placeholder="∞" />
      </label>
    </div>
    <button class="btn-reset" id="reset-filters">Reset</button>
  </div>
  <div class="filter-count" id="filter-count"></div>
  <div class="sessions-grid" id="sessions-grid">
${sorted.map((session, idx) => {
    const hasChildren = session.hasChildren;
    const childrenIcon = hasChildren ? '▶ ' : '';
    const promptExcerpt = session.promptExcerpt || session.firstUserPrompt || '';
    const promptHtml = escapeHtml(promptExcerpt);
    const dirText = escapeHtml(session.abbreviatedDir || '');
    const showDayMarker = (idx === 0 || sorted[idx - 1].dayKey !== session.dayKey);
    const dayMarker = showDayMarker && session.dayKey ? `<div class="day-marker">${escapeHtml(session.dayKey)}</div>` : '';
    
    const totalTurns = (session.userCount || 0) + (session.assistantCount || 0);
    return `<div class="session-card" data-search-text="${escapeHtml(session.title || '').replace(/"/g, '&quot;')} ${escapeHtml(promptExcerpt || '').replace(/"/g, '&quot;')} ${escapeHtml(session.sessionId || '').replace(/"/g, '&quot;')}" data-model="${escapeHtml(session.model || '').replace(/"/g, '&quot;')}" data-turns="${totalTurns}">
${dayMarker}
      <div class="card-header">
        <span class="tree-indicator" style="flex-shrink:0">${childrenIcon}</span>
        <a href="${session.link}">
          <div class="card-title">${escapeHtml(session.title || session.sessionId)}</div>
        </a>
        <span class="card-date" title="${session.dateFull || ''}">${session.date || ''}</span>
      </div>
      <div class="card-dir" title="${dirText}">${dirText}</div>
      <div class="card-preview">${promptHtml}</div>
      <div class="card-meta">
        <span class="badge badge-user" title="User messages">👤 ${session.userCount || 0}</span>
        <span class="badge badge-assistant" title="Assistant messages">💬 ${session.assistantCount || 0}</span>
        <span class="badge badge-tool" title="Tool calls">🔧 ${session.toolCallCount || 0}</span>
        <span class="badge badge-thinking" title="Thinking blocks">💭 ${session.thinkingCount || 0}</span>
        <span class="badge badge-result" title="Tool results">📋 ${session.resultCount || 0}</span>
        ${session.branchSummaryCount > 0 ? `<span class="badge badge-branch" title="Branch summaries">🌿 ${session.branchSummaryCount || 0}</span>` : ''}
        ${session.model ? `<span class="badge badge-model" title="Model">${escapeHtml(session.model)}</span>` : ''}
      </div>
    </div>`;
  }).join('\n')}
  </div>
  <script>
    // SR-4: Client-side search and filter for index page
    function applyFilters() {
      var searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
      var modelFilter = document.getElementById('model-filter').value;
      var minTurns = parseInt(document.getElementById('min-turns').value) || 0;
      var maxTurns = parseInt(document.getElementById('max-turns').value) || Infinity;
      var cards = document.querySelectorAll('.session-card');
      var visibleCount = 0;

      cards.forEach(function(card) {
        var searchText = (card.dataset.searchText || '').toLowerCase();
        var cardModel = (card.dataset.model || '').toLowerCase();
        var turns = parseInt(card.dataset.turns) || 0;

        var matchesSearch = !searchQuery || searchText.includes(searchQuery);
        var matchesModel = !modelFilter || cardModel === modelFilter.toLowerCase();
        var matchesTurns = turns >= minTurns && turns <= maxTurns;

        if (matchesSearch && matchesModel && matchesTurns) {
          card.style.display = '';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      var countEl = document.getElementById('filter-count');
      if (countEl) {
        countEl.textContent = visibleCount + ' session' + (visibleCount !== 1 ? 's' : '') + ' found';
      }
    }

    // Wire up filter controls
    document.addEventListener('DOMContentLoaded', function() {
      var searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.addEventListener('input', applyFilters);

      var modelFilter = document.getElementById('model-filter');
      if (modelFilter) modelFilter.addEventListener('change', applyFilters);

      var minTurns = document.getElementById('min-turns');
      if (minTurns) minTurns.addEventListener('input', applyFilters);

      var maxTurns = document.getElementById('max-turns');
      if (maxTurns) maxTurns.addEventListener('input', applyFilters);

      var resetBtn = document.getElementById('reset-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          if (searchInput) searchInput.value = '';
          if (modelFilter) modelFilter.value = '';
          if (minTurns) minTurns.value = '';
          if (maxTurns) maxTurns.value = '';
          applyFilters();
        });
      }

      // Initial filter application
      applyFilters();
    });
  </script>
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
