'use strict';

const fs = require('fs');
const path = require('path');

/**
 * SR-2: Discover session files
 * Recursively scan ~/.pi/agent/sessions/** for .jsonl files.
 * Skip non-JSONL files.
 * Returns an array of file paths.
 */
function discoverSessions(baseDir) {
  const sessionsDir = path.join(baseDir || process.env.HOME, '.pi', 'agent', 'sessions');
  const jsonlFiles = [];

  if (!fs.existsSync(sessionsDir)) {
    return jsonlFiles;
  }

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        jsonlFiles.push(fullPath);
      }
    }
  }

  scan(sessionsDir);
  return jsonlFiles;
}

/**
 * SR-1: Parse .jsonl files
 * Read each .jsonl file line by line, parse each JSON line.
 * Validate event types: session, model_change, thinking_level_change, message, compaction.
 * Returns an array of raw event objects.
 */
function parseJsonl(filePath) {
  const validTypes = new Set([
    'session',
    'session_info',
    'model_change',
    'thinking_level_change',
    'message',
    'compaction'
  ]);

  const events = [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const event = JSON.parse(line);
      if (event.type && validTypes.has(event.type)) {
        events.push(event);
      }
    } catch (err) {
      // Skip malformed lines
      process.stderr.write(`Warning: Skipping malformed JSON at line ${i + 1} in ${filePath}: ${err.message}\n`);
    }
  }

  return events;
}

module.exports = {
  discoverSessions,
  parseJsonl
};
