import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config.js';
import type { BookmarkRepository } from '../bookmarks/repository.js';
import type { UserStore } from '../users.js';
import type { User } from '../types.js';

const USER: User = {
  id: '11111111-1111-4111-8111-111111111111',
  telegramId: 100000001,
  username: 'dev_user',
  firstName: 'Dev',
  lastName: 'User',
  languageCode: 'ru',
  createdAt: '2026-10-18T10:00:00.000Z',
};

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    nodeEnv: 'test',
    supabaseUrl: 'https://demo.supabase.co',
    supabaseServiceRoleKey: 'x'.repeat(40),
    botToken: '123:token',
    webappUrl: 'https://app.example.com',
    allowedOrigins: ['https://app.example.com', 'http://localhost:3001'],
    devTelegramId: 100000001,
    initDataMaxAgeSeconds: 86400,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<BookmarkRepository> = {}): BookmarkRepository {
  return {
    async list() {
      return { items: [], total: 0 };
    },
    async tags() {
      return [];
    },
    async save() {
      throw new Error('not used');
    },
    async remove() {
      return true;
    },
    async findByNormalizedUrl() {
      return null;
    },
    ...overrides,
  };
}

const users: UserStore = {
  async upsertByTelegram() {
    return USER;
  },
};

async function withApp(
  app: Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error: Error | null | undefined) => (error ? reject(error) : resolve()));
      (server as { closeAllConnections?: () => void }).closeAllConnections?.();
    });
  }
}

describe('API', () => {
  it('exposes a public health check', async () => {
    const app = createApp({ config: makeConfig(), repo: makeRepo(), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    });
  });

  it('requires Telegram auth outside dev fallback', async () => {
    const app = createApp({
      config: makeConfig({ devTelegramId: undefined }),
      repo: makeRepo(),
      users,
    });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/items`);
      expect(response.status).toBe(401);
    });
  });

  it('passes filters to the repository', async () => {
    const list = vi.fn(async () => ({ items: [], total: 12 }));
    const app = createApp({ config: makeConfig(), repo: makeRepo({ list }), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/items?tag=design&q=%20react%20&limit=5&offset=10`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ total: 12 });
      expect(list).toHaveBeenCalledWith(USER.id, {
        tag: 'design',
        q: 'react',
        limit: 5,
        offset: 10,
      });
    });
  });

  it('rejects an out-of-range limit', async () => {
    const app = createApp({ config: makeConfig(), repo: makeRepo(), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/items?limit=500`);
      expect(response.status).toBe(400);
    });
  });

  it('returns 404 when deleting an unknown bookmark', async () => {
    const app = createApp({
      config: makeConfig(),
      repo: makeRepo({ remove: async () => false }),
      users,
    });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/items/22222222-2222-4222-8222-222222222222`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(404);
    });
  });

  it('rejects foreign CORS origins', async () => {
    const app = createApp({ config: makeConfig(), repo: makeRepo(), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil.example' },
      });
      expect(response.status).toBe(403);
    });
  });

  it('allows the WebApp origin', async () => {
    const app = createApp({ config: makeConfig(), repo: makeRepo(), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://app.example.com' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    });
  });

  it('marks API responses as private', async () => {
    const app = createApp({ config: makeConfig(), repo: makeRepo(), users });

    await withApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/me`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
  });
});
