import { HttpError } from '../errors.js';

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

export async function anthropicReply({ message, fullPrompt, settings }) {
  const apiKey = process.env.MAIN_MODEL_API_KEY;
  const model = process.env.MAIN_MODEL_NAME;
  if (!apiKey || !model) {
    throw new HttpError(
      503,
      'model_not_configured',
      'Claude API Key 或模型名尚未配置，请先填写环境变量。',
    );
  }

  const baseUrl = normalizeBaseUrl(process.env.MAIN_MODEL_BASE_URL || 'https://api.anthropic.com');
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: fullPrompt,
      messages: [{ role: 'user', content: message }],
      max_tokens: settings.maxReplyTokens,
      temperature: settings.temperature,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, 'model_request_failed', `Claude 请求失败：${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const reasoning = (data.content || [])
    .filter((block) => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('\n');

  return { content: text || '（Claude 返回了空回复）', reasoningContent: reasoning || null };
}
