import type { Db } from './db.js';
import type { TelegramProfile, User } from './types.js';
import { toUser } from './types.js';

export interface UserStore {
  upsertByTelegram(profile: TelegramProfile): Promise<User>;
}

export class SupabaseUserStore implements UserStore {
  constructor(private readonly db: Db) {}

  async upsertByTelegram(profile: TelegramProfile): Promise<User> {
    const { data, error } = await this.db
      .from('users')
      .upsert(
        {
          telegram_id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name ?? null,
          username: profile.username ?? null,
          language_code: profile.language_code ?? null,
        },
        { onConflict: 'telegram_id' },
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert user: ${error?.message ?? 'no data'}`);
    }

    return toUser(data);
  }
}
