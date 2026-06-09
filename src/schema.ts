import { z } from "zod";
import { agents } from "./types.js";

const providerIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "provider id must contain only letters, numbers, _ or -");

export const providerSchema = z.object({
  name: z.string().min(1),
  baseURL: z.string().url(),
  baseURLs: z
    .object({
      claude: z.string().url().optional(),
      codex: z.string().url().optional(),
      opencode: z.string().url().optional()
    })
    .optional(),
  apiKey: z.string().min(1),
  defaultModel: z.string().min(1),
  models: z.record(z.record(z.unknown())).optional()
}).transform((provider) => ({
  ...provider,
  models: provider.models ?? {
    [provider.defaultModel]: {
      name: provider.defaultModel
    }
  }
}));

export const activeSelectionSchema = z.object({
  provider: providerIdSchema,
  model: z.string().min(1)
});

export const configSchema = z
  .object({
    version: z.literal(1),
    providers: z.record(providerIdSchema, providerSchema),
    active: z
      .object({
        claude: activeSelectionSchema.optional(),
        codex: activeSelectionSchema.optional(),
        opencode: activeSelectionSchema.optional()
      })
      .default({})
  })
  .superRefine((config, context) => {
    for (const [agent, selection] of Object.entries(config.active)) {
      if (selection && !config.providers[selection.provider]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["active", agent, "provider"],
          message: `unknown active provider: ${selection.provider}`
        });
      }
    }
  });

export const addProviderSchema = z.object({
  id: providerIdSchema,
  name: z.string().min(1).optional(),
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1)
});

export function assertAgent(value: string) {
  const parsed = z.enum(agents).safeParse(value);
  if (!parsed.success) {
    throw new Error(`unknown agent: ${value}`);
  }
  return parsed.data;
}
