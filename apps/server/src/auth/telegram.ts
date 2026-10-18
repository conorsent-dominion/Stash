import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthError } from '../lib/errors.js';
import type { TelegramProfile } from '../types.js';

const HEX_64 = /^[0-9a-f]{64}$/;
const MAX_FUTURE_SKEW_SECONDS = 300;

export interface VerifyOptions {
  maxAgeSeconds?: number;
  now?: number;
}

/**
 * Validates raw Telegram WebApp initData.
 *
 * secret = HMAC_SHA256(key = "WebAppData", message = bot_token)
 * hash   = HMAC_SHA256(key = secret, message = sorted "key=value" lines)
 *
 * Both `hash` and `signature` (Bot API 8.0+) are excluded from the signed
 * payload. Values are used exactly as received; the JSON is parsed only after
 * the signature check.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  opts: VerifyOptions = {},
): TelegramProfile {
  if (!initData) {
    throw new AuthError('missing_init_data', 'Telegram initData is missing');
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    throw new AuthError('malformed', 'Telegram initData is malformed');
  }

  const hash = params.get('hash');
  if (!hash || !HEX_64.test(hash)) {
    throw new AuthError('malformed', 'Telegram initData hash is missing');
  }

  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');
  if (!authDateRaw || !userRaw) {
    throw new AuthError('malformed', 'Telegram initData is incomplete');
  }

  const authDate = Number(authDateRaw);
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new AuthError('malformed', 'Telegram auth_date is invalid');
  }

  const maxAge = opts.maxAgeSeconds ?? 86_400;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (!isFresh(authDate, maxAge, now)) {
    throw new AuthError('expired', 'Telegram initData has expired');
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash' || key === 'signature') continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();

  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AuthError('invalid_signature', 'Telegram initData signature is invalid');
  }

  let user: unknown;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new AuthError('malformed', 'Telegram user payload is invalid');
  }

  if (
    typeof user !== 'object' ||
    user === null ||
    typeof (user as { id?: unknown }).id !== 'number' ||
    !Number.isSafeInteger((user as { id: number }).id) ||
    (user as { id: number }).id <= 0
  ) {
    throw new AuthError('malformed', 'Telegram user id is invalid');
  }

  const typed = user as {
    id: number;
    first_name?: unknown;
    last_name?: unknown;
    username?: unknown;
    language_code?: unknown;
  };

  return {
    id: typed.id,
    first_name: typeof typed.first_name === 'string' && typed.first_name ? typed.first_name : 'Гость',
    last_name: typeof typed.last_name === 'string' ? typed.last_name : undefined,
    username: typeof typed.username === 'string' ? typed.username : undefined,
    language_code: typeof typed.language_code === 'string' ? typed.language_code : undefined,
  };
}

export function isFresh(authDate: number, maxAgeSeconds: number, now = Math.floor(Date.now() / 1000)): boolean {
  if (authDate > now + MAX_FUTURE_SKEW_SECONDS) return false;
  return now - authDate <= maxAgeSeconds;
}
