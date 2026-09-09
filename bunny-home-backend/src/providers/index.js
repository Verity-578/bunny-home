import { anthropicReply } from './anthropic.js';
import { HttpError } from '../errors.js';
import { localReply } from './local.js';
import { openAiCompatibleReply } from './openaiCompatible.js';

export const modelCatalog = [
  { value: 'local', label: '本地演示', ready: true },
  {
    value: 'claude',
    label: process.env.MAIN_MODEL_NAME ? `Claude · ${process.env.MAIN_MODEL_NAME}` : 'Claude',
    ready: Boolean(process.env.MAIN_MODEL_API_KEY && process.env.MAIN_MODEL_NAME),
  },
  {
    value: 'deepseek',
    label: process.env.DEEPSEEK_MODEL
      ? `DeepSeek · ${process.env.DEEPSEEK_MODEL}`
      : 'DeepSeek',
    ready: Boolean(process.env.DEEPSEEK_API_KEY),
  },
  {
    value: 'deepseek-reasoner',
    label: 'DeepSeek 思考',
    ready: Boolean(process.env.DEEPSEEK_API_KEY),
  },
];

export function getModelDefinition(value) {
  return modelCatalog.find((model) => model.value === value);
}

export async function generateReply({ model, message, fullPrompt, memoryText, historyText, settings }) {
  const definition = getModelDefinition(model);
  if (!definition) {
    throw new HttpError(400, 'unknown_model', `未知模型：${model}`);
  }

  if (model === 'claude') {
    if (!definition.ready) {
      throw new HttpError(
        503,
        'model_not_configured',
        'Claude 尚未配置，请先填写 MAIN_MODEL_API_KEY 与 MAIN_MODEL_NAME。',
      );
    }
    return anthropicReply({ message, fullPrompt, settings });
  }

  if (model === 'deepseek') {
    if (!definition.ready) {
      throw new HttpError(
        503,
        'model_not_configured',
        'DeepSeek 尚未配置，请先填写 DEEPSEEK_API_KEY。',
      );
    }
    return openAiCompatibleReply({
      message,
      fullPrompt,
      settings,
      endpoint: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      },
    });
  }

  if (model === 'deepseek-reasoner') {
    if (!definition.ready) {
      throw new HttpError(
        503,
        'model_not_configured',
        'DeepSeek 尚未配置，请先填写 DEEPSEEK_API_KEY。',
      );
    }
    return openAiCompatibleReply({
      message,
      fullPrompt,
      settings,
      endpoint: {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: 'deepseek-reasoner',
      },
    });
  }

  return localReply({ message, fullPrompt, memoryText, historyText, settings });
}
