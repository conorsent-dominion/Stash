import { describe, expect, it } from 'vitest';
import { domainOf, initials, plural, relativeDate } from './format.js';

describe('format helpers', () => {
  it('strips www from domains', () => {
    expect(domainOf('https://www.example.com/a')).toBe('example.com');
  });

  it('formats recent dates in Russian', () => {
    const now = Date.parse('2026-10-18T12:00:00.000Z');
    expect(relativeDate('2026-10-18T11:58:00.000Z', now)).toBe('2 минуты назад');
    expect(relativeDate('2026-10-18T09:00:00.000Z', now)).toBe('3 часа назад');
  });

  it('uses Russian plural forms', () => {
    expect(plural(1, 'закладка', 'закладки', 'закладок')).toBe('закладка');
    expect(plural(3, 'закладка', 'закладки', 'закладок')).toBe('закладки');
    expect(plural(11, 'закладка', 'закладки', 'закладок')).toBe('закладок');
  });

  it('builds an initial', () => {
    expect(initials('алексей')).toBe('А');
    expect(initials('')).toBe('Б');
  });
});
