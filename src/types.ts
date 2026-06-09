export const agents = ["claude", "codex", "opencode"] as const;

export type Agent = (typeof agents)[number];

export type Provider = {
  name: string;
  baseURL: string;
  baseURLs?: Partial<Record<Agent, string>>;
  apiKey: string;
  defaultModel: string;
  models: Record<string, Record<string, unknown>>;
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
