import 'dotenv/config';
import { z } from 'zod';

export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  botToken: string;
  webappUrl: string;
  webhookUrl?: string;
  webhookSecret?: string;
  allowedOrigins: string[];
  devTelegramId?: number;
  initDataMaxAgeSeconds: number;
}

const emptyToUndefined = (value: unknown) => (value === '' || value === undefined ? undefined : value);

const rawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(8787)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  BOT_TOKEN: z.string().min(10),
  WEBAPP_URL: z.string().url(),
  WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  ALLOWED_ORIGINS: z.string().default(''),
  DEV_TELEGRAM_ID: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().safe().optional(),
  ),
  INIT_DATA_MAX_AGE_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(60).max(604800).default(86400),
  ),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const raw = parsed.data;
  const webapp = new URL(raw.WEBAPP_URL);

  if (raw.NODE_ENV === 'production' && webapp.protocol !== 'https:') {
    throw new Error('WEBAPP_URL must use https in production');
  }
  if (raw.NODE_ENV === 'production' && raw.DEV_TELEGRAM_ID !== undefined) {
    throw new Error('DEV_TELEGRAM_ID is not allowed in production');
  }

  const allowedOrigins = Array.from(
    new Set(
      [webapp.origin, ...raw.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())]
        .filter((origin) => origin.length > 0 && origin !== 'null'),
    ),
  );

  return {
    port: raw.PORT,
    nodeEnv: raw.NODE_ENV,
    supabaseUrl: raw.SUPABASE_URL,
    supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
    botToken: raw.BOT_TOKEN,
    webappUrl: raw.WEBAPP_URL,
    webhookUrl: raw.WEBHOOK_URL,
    webhookSecret: raw.WEBHOOK_SECRET,
    allowedOrigins,
    devTelegramId: raw.DEV_TELEGRAM_ID,
    initDataMaxAgeSeconds: raw.INIT_DATA_MAX_AGE_SECONDS,
  };
}
