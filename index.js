#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { discoverSessions, parseJsonl } = require('./session-reader');
const { buildSessionData } = require('./event-parser');
const { buildPage } = require('./html-renderer');
const { generateIndex, parseSessionEntries } = require('./session-indexer');

/**
 * CL-1: CLI argument parsing
 * Parse <output-dir> argument. Default to process.cwd() if omitted.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const outputDir = args[0] || process.cwd();
  return { outputDir };
}

/**
 * CL-2: Error handling
 * Gracefully handle malformed files and log warnings.
 */
function main() {
  const { outputDir } = parseArgs();

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`🔍 Discovering sessions...`);
  const sessionFiles = discoverSessions();
  console.log(`✅ Found ${sessionFiles.length} session file(s)`);

  if (sessionFiles.length === 0) {
    console.log(`ℹ️  No .jsonl files found in ~/.pi/agent/sessions/`);
    return;
  }

  // Parse each session file
  console.log(`\n📄 Parsing sessions...`);
  const sessions = [];

  for (const filePath of sessionFiles) {
    try {
      const events = parseJsonl(filePath);
      const sessionData = buildSessionData(events);

      if (sessionData) {
        sessions.push({
          filePath,
          data: sessionData,
          directory: path.dirname(filePath).replace(process.env.HOME || '', '~')
        });
        console.log(`  ✅ ${path.basename(filePath)} → ${sessionData.title}`);
      } else {
        console.warn(`  ⚠️  ${path.basename(filePath)} → No valid session event found`);
      }
    } catch (err) {
      console.error(`  ❌ ${path.basename(filePath)}: ${err.message}`);
    }
  }

  // Generate HTML files for each session
  console.log(`\n🎨 Generating HTML files...`);
  for (const session of sessions) {
    const fileName = path.basename(session.filePath, '.jsonl') + '.html';
    const html = buildPage(session.data, { title: session.data.title });
    const outputPath = path.join(outputDir, fileName);
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`  ✅ ${fileName}`);
  }

  // Build session tree relationships (check for children)
  const sessionIds = new Set(sessions.map(s => s.data.sessionId));
  const childMap = new Map();
  
  for (const session of sessions) {
    if (session.data.parentSessionId && sessionIds.has(session.data.parentSessionId)) {
      if (!childMap.has(session.data.parentSessionId)) {
        childMap.set(session.data.parentSessionId, []);
      }
      childMap.get(session.data.parentSessionId).push(session.data.sessionId);
    }
  }

  // Generate index.html
  console.log(`\n📑 Generating index.html...`);
  const entries = parseSessionEntries(sessions.map(s => s.filePath));
  
  // Day-of-week abbreviations
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // British date formatter with weekday: DDD DD/MM/YYYY
  function toBritishDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const dayName = dayNames[d.getDay()];
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${dayName} ${day}/${month}/${year}`;
  }

  // British date+time formatter: DDD DD/MM/YYYY HH:mm
  function toBritishDateFull(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const dayName = dayNames[d.getDay()];
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${dayName} ${day}/${month}/${year} ${hours}:${minutes}`;
  }

  // Enrich entries with session data and tree info
  const enrichedEntries = entries.map(entry => {
    const session = sessions.find(s => s.filePath === entry.filePath);
    if (session) {
      const hasChildren = childMap.has(session.data.sessionId);
      const turns = session.data.turns || [];
      const firstUser = turns.find(t => t.user)?.user;
      const firstUserPrompt = firstUser ? firstUser.text || '' : '';
      
      // Count message types
      let userCount = 0, assistantCount = 0, toolCallCount = 0, thinkingCount = 0, resultCount = 0;
      for (const turn of turns) {
        if (turn.user) userCount++;
        assistantCount += turn.assistant?.length || 0;
        toolCallCount += (turn.assistant || []).reduce((sum, a) => sum + (a.toolCalls?.length || 0), 0);
        thinkingCount += (turn.assistant || []).reduce((sum, a) => sum + (a.thinking?.length || 0), 0);
        resultCount += turn.toolResults?.length || 0;
      }

      // NEP-3: Count branch summaries
      const branchSummaryCount = session.data.branchSummaryEntries?.length || 0;

      // Abbreviate directory to final path component only
      // Handle both normal paths (/) and encoded paths (--component-separator--)
      let abbreviatedDir = '';
      const rawDir = session.directory || entry.directory;
      // First extract the last path component
      const lastComponent = rawDir.split('/').pop() || '';
      if (lastComponent.startsWith('--') && lastComponent.endsWith('--')) {
        // Encoded path format: --home-mongo.guest-Users-mongo-Code-2026-pi-viewer--
        const inner = lastComponent.slice(2, -2);
        const parts = inner.split('-');
        // Filter empty parts and take the last meaningful component
        const filtered = parts.filter(p => p);
        abbreviatedDir = filtered[filtered.length - 1] || '';
      } else {
        // Normal path format
        abbreviatedDir = lastComponent;
      }

      // Extract a meaningful prompt excerpt (longer, multi-line friendly)
      const promptLines = firstUserPrompt.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      let promptExcerpt = '';
      for (const line of promptLines) {
        if ((promptExcerpt + '\n' + line).length > 300) break;
        promptExcerpt = promptExcerpt ? promptExcerpt + '\n' + line : line;
        if (promptExcerpt.length >= 200) break;
      }

      return {
        ...entry,
        sessionId: session.data.sessionId,
        title: session.data.title,
        timestamp: session.data.timestamp,
        date: toBritishDate(session.data.timestamp),
        dateFull: toBritishDateFull(session.data.timestamp),
        dayKey: toBritishDate(session.data.timestamp),
        model: session.data.currentModel ? `${session.data.currentModel.provider || ''} / ${session.data.currentModel.model || ''}` : '',
        hasChildren,
        firstUserPrompt,
        promptExcerpt,
        userCount,
        assistantCount,
        toolCallCount,
        thinkingCount,
        resultCount,
        branchSummaryCount,
        directory: session.directory || entry.directory,
        abbreviatedDir
      };
    }
    return entry;
  });

  const indexHtml = generateIndex(enrichedEntries);
  const indexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(indexPath, indexHtml, 'utf-8');

  console.log(`  ✅ index.html`);
  console.log(`\n🎉 Done! Open ${path.join(outputDir, 'index.html')} in your browser.`);
}

// Run
main();
