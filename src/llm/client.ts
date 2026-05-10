import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { LLMProvider } from '../types.js';
import { getProviderConfig, resolveApiKey } from '../storage/config.js';

const llmCache = new Map<string, BaseChatModel>();

export function getLLM(stage: string = 'default'): BaseChatModel {
  const providerConfig = getProviderConfig(stage);
  const provider = providerConfig?.provider || 'anthropic';
  const model = providerConfig?.model || 'claude-sonnet-4-7';
  const temperature = providerConfig?.temperature ?? 0.7;
  const cacheKey = `${stage}:${provider}:${model}:${temperature}`;

  const cached = llmCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = resolveApiKey(stage);
  const baseURL = providerConfig?.baseURL;

  let llm: BaseChatModel;

  if (provider === 'anthropic') {
    llm = new ChatAnthropic({
      model,
      temperature,
      anthropicApiKey: apiKey,
      ...(baseURL ? { anthropicApiUrl: baseURL } : {}),
    });
  } else if (provider === 'openrouter' && baseURL) {
    llm = new ChatOpenAI({
      model,
      temperature,
      openAIApiKey: apiKey,
      configuration: { baseURL },
    });
  } else {
    llm = new ChatOpenAI({
      model,
      temperature,
      openAIApiKey: apiKey,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  llmCache.set(cacheKey, llm);
  return llm;
}

export function clearLLMCache(): void {
  llmCache.clear();
}