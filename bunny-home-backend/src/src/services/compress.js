import { openAiCompatibleReply } from '../providers/openaiCompatible.js';

function localCompress(messages) {
  const first = messages.slice(0, 3)
    .map((message) => `${message.role === 'user' ? '你说' : 'Bunny说'}：${message.content}`)
    .join('\n');
  const recent = messages.slice(-2)
    .map((message) => `${message.role === 'user' ? '你' : 'Bunny'}：${message.content}`)
    .join('\n');
  return `离线记忆摘要（共 ${messages.length} 条消息）\n较早的部分：\n${first}\n最近的部分：\n${recent}`;
}

export async function compressMessages(messages) {
  if (messages.length === 0) return '';

  if (!process.env.DEEPSEEK_API_KEY) {
    return localCompress(messages);
  }

  const transcript = messages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n');
  const summary = await openAiCompatibleReply({
    message: transcript,
    fullPrompt: '请把用户消息压缩成一段简洁、保留重要关系和情绪线索的中文记忆摘要。',
    settings: { maxReplyTokens: 900, temperature: 0.2 },
    endpoint: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
  }).catch(() => localCompress(messages));

  return summary.content;
}
