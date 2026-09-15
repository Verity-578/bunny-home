import { randomUUID } from 'node:crypto';

import { badRequest, notFound } from '../errors.js';
import { generateReply, getModelDefinition } from '../providers/index.js';
import { storage } from '../storage.js';
import { compressMessages } from './compress.js';
import { maybeCollectMemory } from './memoryCollector.js';

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export function buildFullPrompt({ settings, messages, memories, memoryLibraryText = '', message }) {
  const persona = settings.personaPrompt || settings.systemPrompt || '';
  const languageStyle = settings.languageStylePrompt || '';
  const memoryText = (memories || [])
    .map((memory) => memory.summary)
    .filter(Boolean)
    .join('\n');
  const historyText = (messages || [])
    .map((item) => `${item.role === 'user' ? '用户' : 'Bunny'}：${item.content}`)
    .join('\n');

  const sections = [persona];
  if (settings.bunnyName) sections.unshift(`你的名字是 ${settings.bunnyName}。`);
  if (languageStyle) sections.push(`【语言风格】\n${languageStyle}`);
  sections.push(`当前时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  if (memoryLibraryText) sections.push(`【个人记忆库】\n${memoryLibraryText}`);
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

async function getMemoryLibraryText({ sessionId, settings }) {
  const all = await storage.listMemoryEntries(2000);
  const relevant = settings.memorySharedAcrossSessions
    ? all
    : all.filter(
        (entry) =>
          !entry.sourceSessionId ||
          entry.sourceSessionId === sessionId ||
          (entry.kind === 'diary' && entry.sourceSessionId === sessionId),
      );
  return relevant
    .slice(0, 16)
    .map(
      (entry) =>
        `${entry.kind === 'diary' ? '日记' : entry.title || '记忆'}：${entry.content}`,
    )
    .join('\n');
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
  await storage.lockSessionMessages(sessionId);
  if (settings.memoryCollectionEnabled) {
    setTimeout(() => {
      maybeCollectMemory({ sessionId }).catch((error) => console.error('memory collect', error));
    }, 0);
  }
  await storage.addMessage({ sessionId, role: 'user', content: message });

  let messages = (await storage.listMessages(sessionId, true)).filter((item) => item.isCurrent);
  messages = await compressIfNeeded({ sessionId, settings, messages, message });
  const memories = await storage.listMemories(10);
  const memoryLibraryText = await getMemoryLibraryText({ sessionId, settings });
  const context = buildFullPrompt({ settings, messages, memories, memoryLibraryText, message });

  const result = await generateReply({
    model,
    message,
    fullPrompt: context.fullPrompt,
    memoryText: context.memoryText,
    historyText: context.historyText,
    settings,
  });

  const assistantMessage = await storage.addMessage({
    sessionId,
    role: 'assistant',
    content: result.content,
    reasoningContent: result.reasoningContent,
  });
  return assistantMessage;
}

export function createEmptySessionId() {
  return randomUUID();
}

export async function regenerateReply({ sessionId, model = 'local' }) {
  const session = await storage.getSession(sessionId);
  if (!session) throw notFound('会话不存在');
  if (!getModelDefinition(model)) throw notFound('未知模型');

  const settings = await storage.getSettings();
  const messages = await storage.listMessages(sessionId, true);
  const lastAssistantIndex = [...messages].reverse().findIndex((item) => item.role === 'assistant');
  if (lastAssistantIndex < 0) throw badRequest('nothing_to_regenerate', '没有可重新生成的消息');
  const lastAssistant = messages[messages.length - 1 - lastAssistantIndex];
  if (lastAssistant.locked) {
    throw badRequest('message_locked', '已经继续对话的消息不能再修改');
  }
  if (messages[messages.length - 1 - lastAssistantIndex - 1]?.role !== 'user') {
    throw badRequest('nothing_to_regenerate', '没有可重新生成的上一条用户消息');
  }

  await storage.supersedeMessageGroup(lastAssistant.versionGroupId || lastAssistant.id);
  const history = (await storage.listMessages(sessionId, true)).filter((item) => item.isCurrent);
  const userMessage = history[history.length - 1];
  const memories = await storage.listMemories(10);
  const memoryLibraryText = await getMemoryLibraryText({ sessionId, settings });
  const context = buildFullPrompt({
    settings,
    messages: history,
    memories,
    memoryLibraryText,
    message: userMessage.content,
  });
  const result = await generateReply({
    model,
    message: userMessage.content,
    fullPrompt: context.fullPrompt,
    memoryText: context.memoryText,
    historyText: context.historyText,
    settings,
  });
  return storage.addMessage({
    sessionId,
    role: 'assistant',
    content: result.content,
    reasoningContent: result.reasoningContent,
    versionGroupId: lastAssistant.versionGroupId || lastAssistant.id,
    versionNumber: (lastAssistant.versionNumber || 1) + 1,
    isCurrent: true,
    locked: false,
  });
}

export async function editTailMessage({ sessionId, messageId, instruction, model = 'local' }) {
  const settings = await storage.getSettings();
  const messages = (await storage.listMessages(sessionId, true)).filter(
    (message) => message.isCurrent,
  );
  const current = messages[messages.length - 1];
  if (!current || current.id !== messageId) {
    throw badRequest('message_not_tail', '只能修改最后一条消息');
  }
  if (current.locked) {
    throw badRequest('message_locked', '已经继续对话的消息不能再修改');
  }
  if (!instruction.trim()) {
    throw badRequest('instruction_required', '请输入修改指示');
  }

  const historyText = messages
    .slice(-8)
    .map((item) => `${item.role === 'user' ? '用户' : 'Bunny'}：${item.content}`)
    .join('\n');
  const fullPrompt =
    `你是文字编辑助手。根据指示改写指定的这一条消息，保持它的角色和事实，只输出改写后的正文。\n` +
    `【角色】${current.role === 'user' ? '用户' : 'Bunny'}\n` +
    `【修改指示】${instruction}\n` +
    `【近期对话】\n${historyText}`;
  const result = await generateReply({
    model,
    message: current.content,
    fullPrompt,
    memoryText: '',
    historyText,
    settings: { ...settings, maxReplyTokens: Math.min(settings.maxReplyTokens, 1200) },
  });

  await storage.supersedeMessageGroup(current.versionGroupId || current.id);
  return storage.addMessage({
    sessionId,
    role: current.role,
    content: result.content,
    reasoningContent: result.reasoningContent,
    versionGroupId: current.versionGroupId || current.id,
    versionNumber: (current.versionNumber || 1) + 1,
    isCurrent: true,
    locked: false,
    editedFromId: current.id,
  });
}
