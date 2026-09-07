import { randomUUID } from 'node:crypto';

import { notFound } from '../errors.js';
import { generateReply, getModelDefinition } from '../providers/index.js';
import { storage } from '../storage.js';
import { compressMessages } from './compress.js';

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export function buildFullPrompt({ settings, messages, memories, message }) {
  const systemPrompt = settings.systemPrompt || '';
  const memoryText = (memories || [])
    .map((memory) => memory.summary)
    .filter(Boolean)
    .join('\n');
  const historyText = (messages || [])
    .map((item) => `${item.role === 'user' ? '用户' : 'Bunny'}：${item.content}`)
    .join('\n');

  const sections = [systemPrompt];
  if (memoryText) sections.push(`【长期记忆】\n${memoryText}`);
  if (historyText) sections.push(`【当前对话】\n${historyText}`);

  const fullPrompt = sections.join('\n\n');
  return {
    fullPrompt,
    memoryText,
    historyText,
    tokenEstimate: estimateTokens(fullPrompt) + estimateTokens(message),
  };
}

async function compressIfNeeded({ sessionId, settings, messages, message }) {
  const context = buildFullPrompt({ settings, messages, memories: [], message });
  if (context.tokenEstimate < settings.compressThreshold) {
    return messages;
  }

  const keepCount = Math.max(2, Number(settings.compressKeepRounds) * 2);
  const removable = messages.slice(0, Math.max(0, messages.length - keepCount));
  if (removable.length < 2) return messages;

  const summary = await compressMessages(removable);
  await storage.insertMemory({
    summary,
    conversationId: `${sessionId}:${Date.now()}`,
    metadata: { source: 'auto', count: removable.length },
  });
  await storage.hideMessages(removable);
  return await storage.listMessages(sessionId, true);
}

export async function runChat({ sessionId, message, model = 'local' }) {
  const session = await storage.getSession(sessionId);
  if (!session) throw notFound('会话不存在');
  if (!getModelDefinition(model)) throw notFound('未知模型');

  const settings = await storage.getSettings();
  await storage.addMessage({ sessionId, role: 'user', content: message });

  let messages = await storage.listMessages(sessionId, true);
  messages = await compressIfNeeded({ sessionId, settings, messages, message });
  const memories = await storage.listMemories(10);
  const context = buildFullPrompt({ settings, messages, memories, message });

  const result = await generateReply({
    model,
    message,
    fullPrompt: context.fullPrompt,
    memoryText: context.memoryText,
    historyText: context.historyText,
    settings,
  });

  return await storage.addMessage({
    sessionId,
    role: 'assistant',
    content: result.content,
    reasoningContent: result.reasoningContent,
  });
}

export function createEmptySessionId() {
  return randomUUID();
}
