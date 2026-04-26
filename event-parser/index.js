'use strict';

/**
 * EP-1: Session info extractor
 * From `session` event, extract metadata.
 * Optionally override the title with a user-defined name.
 */
function extractSessionInfo(sessionEvent, titleOverride) {
  const cwd = sessionEvent.cwd || null;
  const parentSession = sessionEvent.parentSession || null;
  
  // Use provided title if present (user-defined), otherwise derive from session id
  const title = titleOverride || deriveTitle(sessionEvent.id);

  return {
    sessionId: sessionEvent.id,
    title,
    timestamp: sessionEvent.timestamp || null,
    cwd,
    parentSessionId: parentSession
  };
}

/**
 * Derive a human-readable title from the session directory path.
 * Strip `--home-` prefix and restore path separators.
 */
function deriveTitle(sessionId) {
  if (!sessionId) return 'Untitled Session';
  
  // The session id is typically a hash/directory name
  // We'll try to extract something readable from it
  const parts = sessionId.split('--');
  if (parts.length > 2) {
    // Join parts after stripping 'home' prefix
    const relevantParts = parts.slice(1);
    const title = relevantParts.join('/').replace(/-/g, ' ');
    return title || 'Untitled Session';
  }
  
  return sessionId.substring(0, 32) + '...';
}

/**
 * EP-2: Model & thinking state tracker
 * Build timelines from model_change and thinking_level_change events.
 */
function buildStateTimelines(events) {
  const modelTimeline = [];
  const thinkingTimeline = [];

  for (const event of events) {
    if (event.type === 'model_change' && event.provider && event.modelId) {
      modelTimeline.push({
        timestamp: event.timestamp,
        provider: event.provider,
        model: event.modelId
      });
    } else if (event.type === 'thinking_level_change') {
      thinkingTimeline.push({
        timestamp: event.timestamp,
        level: event.level || event.thinkingLevel
      });
    }
  }

  return { modelTimeline, thinkingTimeline };
}

/**
 * EP-3: Conversation tree builder
 * Build a tree of message events keyed by id, with parentId references.
 * Group messages into turns: a user message + its assistant response(s) form one turn.
 * Also groups toolResult messages with their parent assistant response.
 */
function buildConversationTree(events) {
  const messages = events.filter(e => e.type === 'message');
  
  // Index messages by id for O(1) lookup
  const msgMap = new Map();

  for (const msg of messages) {
    msgMap.set(msg.id, msg);
  }

  // Sort all messages by timestamp
  const allMessages = [...messages].sort((a, b) => {
    const tsA = a.timestamp || 0;
    const tsB = b.timestamp || 0;
    return tsA - tsB;
  });

  // Find user messages: every user message starts a new turn.
  // In Pi's session model, parentId defines tree structure (branching path),
  // not turn boundaries. A user replying to an assistant or toolResult is
  // still a new turn — the fork is captured by the tree, not hidden.
  const userMessages = allMessages.filter(m => {
    const role = m.message?.role || m.role;
    return role === 'user';
  });

  // Build turns: user message + assistant responses + toolResults
  const turns = [];
  
  for (const userMsg of userMessages) {
    const turn = {
      user: userMsg,
      assistant: [],
      toolResults: [],
      parentId: userMsg.parentId || null
    };
    
    // Find all assistant messages that reference this user message as parentId
    const responses = allMessages.filter(
      m => (m.message?.role === 'assistant' || m.role === 'assistant') && m.parentId === userMsg.id
    );
    
    turn.assistant = responses;
    
    // Find toolResult messages for each assistant response
    for (const resp of responses) {
      const toolResults = allMessages.filter(
        m => (m.message?.role === 'toolResult' || m.role === 'toolResult') && m.parentId === resp.id
      );
      toolResults.forEach(tr => {
        tr.associatedAssistantId = resp.id;
        turn.toolResults.push(tr);
      });
    }
    
    turns.push(turn);
  }

  return turns;
}

/**
 * EP-4: Message content parser
 * Extract thinking blocks, text, and toolCall blocks from message events.
 */
function parseMessageContent(messageEvent) {
  const content = messageEvent.content || messageEvent.message?.content || [];
  const thinking = [];
  const textBlocks = [];
  const toolCalls = [];

  if (!Array.isArray(content)) {
    // Fallback: content might be a string
    return {
      thinking,
      text: typeof content === 'string' ? content : '',
      toolCalls: []
    };
  }

  for (const block of content) {
    if (!block) continue;
    
    if (block.type === 'thinking') {
      if (block.thinking || block.value) {
        thinking.push(block.thinking || block.value || '');
      }
    } else if (block.type === 'text') {
      textBlocks.push(block.text || block.value || '');
    } else if (block.type === 'toolCall') {
      toolCalls.push({
        name: block.name || '',
        arguments: block.arguments || '',
        toolCallId: block.toolCallId || block.id || null
      });
    }
  }

  const text = textBlocks.join('\n').trim();
  
  return {
    thinking,
    text,
    toolCalls
  };
}

/**
 * EP-5: Build session data structure
 * Combine all parsed pieces into a single structure per session.
 */
function buildSessionData(events) {
  // Extract session info
  const sessionEvent = events.find(e => e.type === 'session');
  
  // Extract user-defined session name from session_info entries (latest wins)
  let sessionName = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'session_info' && ev.name) {
      sessionName = ev.name;
      break;
    }
  }
  
  // Use user-defined name if present, otherwise derive from session id
  const title = sessionName || deriveTitle(sessionEvent?.id);
  
  const sessionInfo = sessionEvent ? extractSessionInfo(sessionEvent, title) : null;
  
  if (!sessionInfo) {
    return null;
  }

  // Build state timelines
  const { modelTimeline, thinkingTimeline } = buildStateTimelines(events);
  
  // Build conversation tree
  const turns = buildConversationTree(events);
  
  // Parse each message content
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalAllTokens = 0;

  // NEP-8: Build toolCallId -> result lookup for correlation
  // Maps toolCallId from the toolCall block to the full toolResult object
  const toolResultByCallId = new Map();
  for (const turn of turns) {
    if (turn.toolResults) {
      for (const tr of turn.toolResults) {
        const callId = tr.message?.toolCallId || tr.toolCallId || null;
        if (callId) {
          toolResultByCallId.set(callId, tr);
        }
      }
    }
  }

  // Helper to extract text content from a toolResult message
  function extractResultText(result) {
    const content = result.content || result.message?.content || [];
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(b => b && b.type === 'text')
        .map(b => b.text || b.value || '')
        .join('\n')
        .trim();
    }
    return '';
  }

  const enrichedTurns = turns.map(turn => {
    const enrichedUser = turn.user ? { ...parseMessageContent(turn.user), id: turn.user.id, timestamp: turn.user.timestamp, role: turn.user.message?.role || turn.user.role } : null;
    const enrichedAssistant = turn.assistant.map(a => {
      const parsed = parseMessageContent(a);
      const usage = a.message?.usage || null;
      if (usage) {
        totalInputTokens += usage.input || 0;
        totalOutputTokens += usage.output || 0;
        totalCacheReadTokens += usage.cacheRead || 0;
        totalCacheWriteTokens += usage.cacheWrite || 0;
        totalAllTokens += usage.totalTokens || (usage.input + usage.output || 0);
      }

      // NEP-8: Correlate each toolCall with its result
      const enrichedToolCalls = (parsed.toolCalls || []).map(tc => {
        const result = toolResultByCallId.get(tc.toolCallId);
        let resultSummary = null;
        if (result) {
          const resultText = extractResultText(result);
          resultSummary = {
            toolCallId: tc.toolCallId,
            toolName: result.toolName || (result.message?.toolName) || tc.name,
            text: resultText,
            isError: result.isError || (result.message?.isError) || false,
            errorMessage: result.errorMessage || (result.message?.errorMessage) || ''
          };
        }
        return { ...tc, result: resultSummary };
      });

      return {
        ...parsed,
        toolCalls: enrichedToolCalls,
        id: a.id,
        timestamp: a.timestamp,
        role: a.message?.role || a.role,
        model: a.message?.model || '',
        usage: usage,
        stopReason: a.message?.stopReason || null,
        errorMessage: a.message?.errorMessage || null
      };
    });

    const enrichedToolResults = turn.toolResults ? turn.toolResults.map(tr => ({
      ...parseMessageContent(tr),
      id: tr.id,
      timestamp: tr.timestamp,
      role: tr.message?.role || tr.role,
      toolName: tr.message?.toolName || tr.message?.toolCallId || '',
      toolCallId: tr.message?.toolCallId || '',
      content: tr.message?.content || '',
      isError: tr.message?.isError || false,
      errorMessage: tr.message?.errorMessage || ''
    })) : [];

    return {
      user: enrichedUser,
      assistant: enrichedAssistant,
      toolResults: enrichedToolResults
    };
  });

  // Collect compaction details
  const compactionEntries = events
    .filter(e => e.type === 'compaction')
    .map(c => ({
      summary: c.summary || null,
      tokensBefore: c.tokensBefore || null,
      fromHook: c.fromHook || false,
      details: c.details || null,
      firstKeptEntryId: c.firstKeptEntryId || null
    }));
  const compactionCount = compactionEntries.length;

  // NEP-3: Collect branch_summary entries
  const branchSummaryEntries = events
    .filter(e => e.type === 'branch_summary')
    .map(b => ({
      id: b.id || null,
      fromId: b.fromId || null,
      summary: b.summary || '',
      timestamp: b.timestamp || null,
      fromHook: b.fromHook || false,
      details: b.details || null
    }));

  // NEP-5: Collect custom_message entries (extension-injected messages for LLM context)
  const customMessageEntries = events
    .filter(e => e.type === 'custom_message')
    .map(cm => ({
      id: cm.id || null,
      customType: cm.customType || '',
      content: typeof cm.content === 'string' ? cm.content : '',
      display: cm.display !== false, // default true
      details: cm.details || null,
      timestamp: cm.timestamp || null
    }));

  // Collect custom entries (extension state, not shown in UI)
  const customEntries = events
    .filter(e => e.type === 'custom')
    .map(c => ({
      id: c.id || null,
      customType: c.customType || '',
      data: c.data || null
    }));

  // NEP-4: Build labels map (latest label wins for each target)
  // Also collect all labels in order for display
  const labelEntries = events
    .filter(e => e.type === 'label' && e.label)
    .map(l => ({
      targetId: l.targetId || null,
      label: l.label || '',
      timestamp: l.timestamp || null
    }));
  const labelsById = new Map();
  const labelTimestampsById = new Map();
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type === 'label' && ev.label) {
      labelsById.set(ev.targetId, ev.label);
      labelTimestampsById.set(ev.targetId, ev.timestamp);
      break; // only need the latest
    }
  }

  // Build a messageId -> label lookup for annotating messages
  const labelsByMessageId = new Map();
  for (const entry of labelEntries) {
    if (entry.label) {
      labelsByMessageId.set(entry.targetId, entry.label);
    }
  }

  // Annotate enriched turns with labels
  const labeledTurns = enrichedTurns.map(turn => {
    const labeledUser = turn.user ? { ...turn.user, label: labelsByMessageId.get(turn.user.id) || null } : null;
    const labeledAssistant = turn.assistant.map(a => ({
      ...a,
      label: labelsByMessageId.get(a.id) || null
    }));
    const labeledToolResults = turn.toolResults.map(tr => ({
      ...tr,
      label: labelsByMessageId.get(tr.id) || null
    }));

    return {
      user: labeledUser,
      assistant: labeledAssistant,
      toolResults: labeledToolResults
    };
  });

  // Get latest model from timeline
  const currentModel = modelTimeline.length > 0 ? modelTimeline[modelTimeline.length - 1] : null;
  
  // Calculate duration from first to last event
  // Timestamps can be ISO 8601 strings or epoch numbers
  const timestamps = events.map(e => {
    const ts = e.timestamp;
    if (!ts) return null;
    return typeof ts === 'string' ? new Date(ts).getTime() : Number(ts);
  }).filter(Boolean).sort((a, b) => a - b);
  const durationMs = timestamps.length >= 2 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  const durationSec = Math.round(durationMs / 1000);

  return {
    sessionId: sessionInfo.sessionId,
    title: sessionInfo.title,
    timestamp: sessionInfo.timestamp,
    cwd: sessionInfo.cwd,
    parentSessionId: sessionInfo.parentSessionId,
    modelTimeline,
    thinkingTimeline,
    turns: labeledTurns,
    compactionCount,
    compactionEntries,
    branchSummaryEntries,
    customMessageEntries,
    customEntries,
    labelEntries,
    labelsById,
    currentModel,
    durationSec,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    totalAllTokens
  };
}

module.exports = {
  extractSessionInfo,
  deriveTitle,
  buildStateTimelines,
  buildConversationTree,
  parseMessageContent,
  buildSessionData
};
