import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

const baseEnv = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'https://demo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-that-is-long-enough',
  BOT_TOKEN: '123456789:AAHtest-token-value',
  WEBAPP_URL: 'https://app.example.com',
  ALLOWED_ORIGINS: 'http://localhost:3001',
};

describe('loadConfig', () => {
  it('builds a config and always allows the WebApp origin', () => {
    const config = loadConfig(baseEnv);

    expect(config.port).toBe(8787);
    expect(config.nodeEnv).toBe('development');
    expect(config.allowedOrigins).toContain('https://app.example.com');
    expect(config.allowedOrigins).toContain('http://localhost:3001');
    expect(config.initDataMaxAgeSeconds).toBe(86400);
  });

  it('lists missing variables', () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL/);
  });

  it('rejects plain http WebApp URL in production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        WEBAPP_URL: 'http://app.example.com',
      }),
    ).toThrow(/https/);
  });

  it('forbids dev auth in production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        DEV_TELEGRAM_ID: '42',
      }),
    ).toThrow(/DEV_TELEGRAM_ID/);
  });

  it('treats empty optional values as absent', () => {
    const config = loadConfig({
      ...baseEnv,
      DEV_TELEGRAM_ID: '',
      WEBHOOK_URL: '',
      WEBHOOK_SECRET: '',
    });

    expect(config.devTelegramId).toBeUndefined();
    expect(config.webhookUrl).toBeUndefined();
  });
});
