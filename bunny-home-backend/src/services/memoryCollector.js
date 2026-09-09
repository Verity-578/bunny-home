import { openAiCompatibleReply } from '../providers/openaiCompatible.js';
import { storage } from '../storage.js';

let collecting = false;

function dateKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseEntries(text) {
  const cleaned = (text || '')
    .replace(/```json|```/g, '')
    .replace(/^\[?/, '')
    .trim();
  const wrapped = cleaned.startsWith('[') ? cleaned : `[${cleaned}]`;
  try {
    return JSON.parse(wrapped);
  } catch {
    return [];
  }
}

export async function maybeCollectMemory({ sessionId }) {
  if (collecting) return;
  collecting = true;
  try {
    const settings = await storage.getSettings();
    if (!settings.memoryCollectionEnabled) return;
    const messages = await storage.listMessages(sessionId, true);
    const threshold = Math.max(2, Number(settings.memoryEveryMessages) || 8);
    if (messages.length < threshold) return;

    const transcript = messages
      .slice(-30)
      .map((item) => `${item.role === 'user' ? '用户' : 'Bunny'}：${item.content}`)
      .join('\n');

    if (!process.env.DEEPSEEK_API_KEY) {
      const lastUser = [...messages].reverse().find((item) => item.role === 'user');
      if (lastUser) {
        await storage.addMemoryEntry({
          kind: 'memory',
          title: '对话要点',
          content: lastUser.content.slice(0, 500),
          sourceSessionId: sessionId,
        });
      }
      return;
    }

    const result = await openAiCompatibleReply({
      message: transcript,
      fullPrompt:
        '你是一个长期记忆整理器。请从对话中找出最深刻、最常出现、最能反映用户偏好和情绪的信息，' +
        '整理成 2-5 条记忆，并生成今天的一篇 AI 日记。' +
        '只返回 JSON 数组，不要解释：' +
        '[{"kind":"memory","title":"短标题","content":"具体记忆","importance":1-5,"tags":["标签"]},' +
        '{"kind":"diary","title":"今天日记","content":"日记内容","importance":1}]',
      settings: { maxReplyTokens: 1600, temperature: 0.4 },
      endpoint: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: 'deepseek-chat',
      },
    });

    const entries = parseEntries(result.content);
    const today = dateKey();
    for (const entry of entries) {
      if (!entry || typeof entry.content !== 'string') continue;
      const kind = ['memory', 'diary', 'preference', 'relationship'].includes(entry.kind)
        ? entry.kind
        : 'memory';
      const importance = Number(entry.importance) || 1;
      const tags = Array.isArray(entry.tags) ? entry.tags.map(String).slice(0, 8) : [];

      if (kind === 'diary') {
        const diary = await storage.findDiaryByDate(today);
        if (diary) {
          await storage.updateMemoryEntry(diary.id, {
            title: entry.title || `日记 ${today}`,
            content: `${diary.content}\n\n${entry.content}`.slice(-6000),
            importance,
            tags: Array.from(new Set([...diary.tags, ...tags])).slice(0, 12),
          });
        } else {
          await storage.addMemoryEntry({
            kind: 'diary',
            title: entry.title || `日记 ${today}`,
            content: entry.content,
            importance,
            tags,
            sourceSessionId: sessionId,
            diaryDate: today,
          });
        }
      } else {
        await storage.addMemoryEntry({
          kind,
          title: entry.title || '',
          content: entry.content,
          importance,
          tags,
          sourceSessionId: sessionId,
        });
      }
    }
  } finally {
    collecting = false;
  }
}
