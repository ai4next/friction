import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { AppConfig, ProviderStageConfig, LLMProvider } from '../types.js';
import { CONFIG_PATH, ensureFrictionHome } from './paths.js';

const DEFAULT_CONFIG: AppConfig = {
  llm: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-7',
    apiKey: '',
    providers: [
      { stage: 'extraction', provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-7', temperature: 0.2 },
      { stage: 'verification', provider: 'anthropic', apiKey: '', model: 'claude-haiku-3-5', temperature: 0.2 },
      { stage: 'persona', provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-7', temperature: 0.8 },
      { stage: 'dedup', provider: 'anthropic', apiKey: '', model: 'claude-haiku-3-5', temperature: 0.1 },
      { stage: 'default', provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-7', temperature: 0.7 },
    ],
  },
  storage: {
    dbPath: '',
  },
};

let configCache: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (configCache) return configCache;

  ensureFrictionHome();

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as AppConfig;
      configCache = mergeConfig(DEFAULT_CONFIG, parsed);
      return configCache;
    } catch {
      // Fall through to default
    }
  }

  setConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function mergeConfig(defaults: AppConfig, overrides: Partial<AppConfig>): AppConfig {
  return {
    ...defaults,
    ...overrides,
    llm: {
      ...defaults.llm,
      ...(overrides.llm || {}),
      providers: (overrides.llm?.providers || defaults.llm.providers),
    },
    storage: {
      ...defaults.storage,
      ...(overrides.storage || {}),
    },
  };
}

export function setConfig(config: AppConfig): void {
  configCache = config;
  ensureFrictionHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getProviderConfig(stage: string = 'default'): ProviderStageConfig | undefined {
  const cfg = getConfig();
  return cfg.llm.providers.find((p) => p.stage === stage) || cfg.llm.providers.find((p) => p.stage === 'default');
}

export function resolveApiKey(stage: string): string {
  const providerConfig = getProviderConfig(stage);
  if (providerConfig?.apiKey) return providerConfig.apiKey;

  const defaultApiKey = getConfig().llm.apiKey;
  if (defaultApiKey) return defaultApiKey;

  const provider = providerConfig?.provider || getConfig().llm.defaultProvider;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || '';
  return process.env.OPENAI_API_KEY || '';
}

export function clearConfigCache(): void {
  configCache = null;
}