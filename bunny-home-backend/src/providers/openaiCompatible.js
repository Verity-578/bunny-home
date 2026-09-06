import { HttpError } from '../errors.js';

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

export async function openAiCompatibleReply({ message, fullPrompt, settings, endpoint }) {
  const { apiKey, baseUrl, model } = endpoint;
  if (!apiKey || !model) {
    throw new HttpError(
      503,
      'model_not_configured',
      '该模型尚未配置 API Key 或模型名，请先填写环境变量。',
    );
  }

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: fullPrompt },
        { role: 'user', content: message },
      ],
      temperature: settings.temperature,
      max_tokens: settings.maxReplyTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new HttpError(502, 'model_request_failed', `模型请求失败：${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || '（模型返回了空回复）',
    reasoningContent: choice?.message?.reasoning_content || null,
  };
}
