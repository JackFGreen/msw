export const agents = ["claude", "codex", "opencode"] as const;

export type Agent = (typeof agents)[number];

export type ModelConfig = {
  name: string;
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  variants?: Record<string, { options?: Record<string, unknown> }>;
};

export type Provider = {
  name: string;
  baseURL: string;
  baseURLs?: Partial<Record<Agent, string>>;
  apiKey: string;
  defaultModel: string;
  models: Record<string, ModelConfig>;
};

export type ActiveSelection = {
  provider: string;
  model: string;
};

export type MswConfig = {
  version: 1;
  providers: Record<string, Provider>;
  active: Partial<Record<Agent, ActiveSelection>>;
};
