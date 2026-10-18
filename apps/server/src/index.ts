import type { RequestHandler } from 'express';
import { webhookCallback } from 'grammy';
import { createApp } from './app.js';
import { createBot } from './bot/bot.js';
import { SupabaseBookmarkRepository } from './bookmarks/repository.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { SupabaseUserStore } from './users.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);
  const repo = new SupabaseBookmarkRepository(db);
  const users = new SupabaseUserStore(db);
  const bot = createBot(config, { repo, users });

  let telegramWebhook: RequestHandler | undefined;

  if (config.webhookUrl) {
    const url = `${config.webhookUrl.replace(/\/+$/, '')}/telegram/webhook`;
    await bot.api.setWebhook(url, {
      secret_token: config.webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: false,
    });

    telegramWebhook = config.webhookSecret
      ? webhookCallback(bot, 'express', { secretToken: config.webhookSecret })
      : webhookCallback(bot, 'express');

    console.log(`[bot] webhook: ${url}`);
  }

  const app = createApp({ config, repo, users, telegramWebhook });
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] listening on http://0.0.0.0:${config.port}`);
  });

  if (!telegramWebhook) {
    void bot
      .start({
        allowed_updates: ['message'],
        onStart: (info) => console.log(`[bot] long polling as @${info.username}`),
      })
      .catch((error) => {
        console.error('[bot] polling failed', error);
      });
  }

  let stopping = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[app] ${signal}, shutting down`);

    try {
      await bot.stop();
    } catch (error) {
      console.error('[bot] stop failed', error);
    }

    server.close(() => {
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error) => {
  console.error('[app] failed to start', error);
  process.exit(1);
});
