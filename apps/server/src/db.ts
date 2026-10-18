import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppConfig } from './config.js';
import type { Database } from './types.js';

export type Db = SupabaseClient<Database>;

export function createDb(config: AppConfig): Db {
  return createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'telegram-bookmarks/1.0' },
    },
  });
}
