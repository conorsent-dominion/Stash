import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isFresh, verifyInitData } from '../auth/telegram.js';
import { AuthError } from '../lib/errors.js';

const TOKEN = '123456789:AAHtest-token-value';
const NOW = 1_780_000_000;

function sign(fields: Record<string, string>, token = TOKEN): string {
  const params = new URLSearchParams(fields);
  const entries = [...params.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const checkString = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function userFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    query_id: 'AAHtest',
    auth_date: String(NOW),
    user: JSON.stringify({ id: 42, first_name: 'Иван', username: 'ivan' }),
    ...overrides,
  };
}

describe('verifyInitData', () => {
  it('returns the Telegram profile for a valid signature', () => {
    const profile = verifyInitData(sign(userFields()), TOKEN, { now: NOW });

    expect(profile).toEqual({
      id: 42,
      first_name: 'Иван',
      username: 'ivan',
      last_name: undefined,
      language_code: undefined,
    });
  });

  it('ignores the Bot API 8.0 signature field when checking the hash', () => {
    const profile = verifyInitData(sign(userFields({ signature: 'ed25519-signature' })), TOKEN, {
      now: NOW,
    });

    expect(profile.id).toBe(42);
  });

  it('rejects a tampered payload', () => {
    const initData = sign(userFields());
    const tampered = initData.replace('AAHtest', 'AAHother');

    expect(() => verifyInitData(tampered, TOKEN, { now: NOW })).toThrow(AuthError);
  });

  it('rejects a different bot token', () => {
    const initData = sign(userFields());
    expect(() => verifyInitData(initData, '999999:other-token', { now: NOW })).toThrow(
      /signature/,
    );
  });

  it('rejects stale initData', () => {
    const initData = sign(userFields({ auth_date: String(NOW - 90_000) }));
    expect(() => verifyInitData(initData, TOKEN, { now: NOW })).toThrow(/expired/);
  });

  it('rejects a missing hash', () => {
    const params = new URLSearchParams(userFields());
    expect(() => verifyInitData(params.toString(), TOKEN, { now: NOW })).toThrow(/hash/);
  });
});

describe('isFresh', () => {
  it('allows small clock skew into the future', () => {
    expect(isFresh(NOW + 60, 3600, NOW)).toBe(true);
  });

  it('rejects timestamps far in the future', () => {
    expect(isFresh(NOW + 3600, 3600, NOW)).toBe(false);
  });
});
