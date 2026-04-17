import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().optional().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  GROK_API_KEY: z.string().optional().default(""),
  GROK_API_KEY_FALLBACK: z.string().optional().default(""),
  GROK_API_URL: z.string().optional().default("https://api.x.ai/v1/chat/completions"),
  GROK_MODEL: z.string().optional().default("grok-2-latest"),
  GROK_MODEL_FALLBACKS: z.string().optional().default("grok-3-latest,grok-3-mini-latest"),
  CORS_ORIGIN: z.string().optional().default("http://localhost:5174"),
  MAX_UPLOAD_FILES: z.coerce.number().int().positive().default(20),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(2),
  GITHUB_API_TOKEN: z.string().optional().default("")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
