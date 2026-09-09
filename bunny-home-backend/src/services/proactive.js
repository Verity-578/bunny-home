import { generateReply } from '../providers/index.js';
import { storage } from '../storage.js';
import { buildFullPrompt } from './chat.js';

function inQuietHours(now, start, end) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value) => {
    const [h, m] = value.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const startMin = parse(start || '23:00');
  const endMin = parse(end || '08:00');
  if (startMin <= endMin) return minutes >= startMin && minutes < endMin;
  return minutes >= startMin || minutes < endMin;
}

export function startProactiveScheduler() {
  const run = async () => {
    try {
      const settings = await storage.getSettings();
      if (!settings.proactiveEnabled) return;

      const now = new Date();
      if (inQuietHours(now, settings.proactiveQuietStart, settings.proactiveQuietEnd)) {
        return;
      }

      const intervalMs = Math.max(1, Number(settings.proactiveIntervalMinutes) || 180) * 60 * 1000;
      const lastRun = settings.lastProactiveAt ? new Date(settings.lastProactiveAt).getTime() : 0;
      if (lastRun && now.getTime() - lastRun < intervalMs) return;

      const sessions = await storage.listSessions();
      if (!sessions.length) return;
      const target = sessions[0];
      const recentMessages = await storage.listMessages(target.id, true);
      if (recentMessages.length) {
        const lastAt = new Date(recentMessages[recentMessages.length - 1].createdAt).getTime();
        if (now.getTime() - lastAt < 5 * 60 * 1000) return;
      }

      const memories = await storage.listMemories(10);
      const model = process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'local';
      const count = Math.max(1, Math.min(5, Number(settings.proactiveBatchCount) || 1));
      for (let i = 0; i < count; i += 1) {
        const context = buildFullPrompt({
          settings,
          messages: recentMessages,
          memories,
          message: 'proactive',
        });
        const result = await generateReply({
          model,
          message: '此刻由你主动对用户说一句话，不要解释这是定时消息。',
          fullPrompt: context.fullPrompt,
          memoryText: context.memoryText,
          historyText: context.historyText,
          settings,
        });
        await storage.addMessage({
          sessionId: target.id,
          role: 'assistant',
          content: result.content,
          reasoningContent: result.reasoningContent,
        });
      }

      await storage.updateSettings({ lastProactiveAt: now.toISOString() });
    } catch (error) {
      console.error('proactive scheduler error', error);
    }
  };

  run();
  return setInterval(run, 60 * 1000);
}
