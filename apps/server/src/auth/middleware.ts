import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { AuthError } from '../lib/errors.js';
import type { UserStore } from '../users.js';
import { verifyInitData } from './telegram.js';

export function requireTelegramUser(config: AppConfig, users: UserStore) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const initData = req.get('x-telegram-init-data')?.trim() ?? '';

      let profile;
      if (initData) {
        profile = verifyInitData(initData, config.botToken, {
          maxAgeSeconds: config.initDataMaxAgeSeconds,
        });
      } else if (config.nodeEnv !== 'production' && config.devTelegramId) {
        profile = {
          id: config.devTelegramId,
          first_name: 'Dev',
          last_name: 'User',
          username: 'dev_user',
          language_code: 'ru',
        };
      } else {
        throw new AuthError('missing_init_data', 'Откройте приложение из Telegram');
      }

      req.user = await users.upsertByTelegram(profile);
      next();
    } catch (error) {
      next(error);
    }
  };
}
