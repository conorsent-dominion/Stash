import cors from 'cors';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { requireTelegramUser } from './auth/middleware.js';
import type { BookmarkRepository } from './bookmarks/repository.js';
import { AppError } from './lib/errors.js';
import { itemsRouter } from './routes/items.js';
import { meRouter } from './routes/me.js';
import { tagsRouter } from './routes/tags.js';
import type { UserStore } from './users.js';

export interface AppDeps {
  config: AppConfig;
  repo: BookmarkRepository;
  users: UserStore;
  telegramWebhook?: RequestHandler;
}

export function createApp(deps: AppDeps): Express {
  const { config, repo, users } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin(
        origin: string | undefined,
        callback: (
          error: Error | null,
          allow?: boolean | string | RegExp | Array<string | RegExp>,
        ) => void,
      ) {
        if (!origin || config.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, 'origin_not_allowed', 'Origin is not allowed'));
      },
      methods: ['GET', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'telegram-bookmarks' });
  });

  if (deps.telegramWebhook) {
    app.post('/telegram/webhook', deps.telegramWebhook);
  }

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  app.use('/api', requireTelegramUser(config, users));

  app.use('/api/me', meRouter());
  app.use('/api/items', itemsRouter(repo));
  app.use('/api/tags', tagsRouter(repo));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Маршрут не найден' } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      const message = error.issues[0]?.message ?? 'Некорректный запрос';
      res.status(400).json({ error: { code: 'validation_error', message } });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }

    console.error('[api] unhandled error', error);
    res.status(500).json({ error: { code: 'internal_error', message: 'Внутренняя ошибка сервера' } });
  });

  return app;
}
