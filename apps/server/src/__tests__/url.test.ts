import { describe, expect, it } from 'vitest';
import {
  buildTsQuery,
  extractFirstUrl,
  extractHashtags,
  normalizeTag,
  normalizeUrl,
  stripUrlsAndHashtags,
  tagName,
} from '../bookmarks/url.js';

describe('extractFirstUrl', () => {
  it('finds a URL inside a sentence and trims punctuation', () => {
    expect(extractFirstUrl('Смотри https://example.com/a?x=1. Полезно')).toBe(
      'https://example.com/a?x=1',
    );
  });

  it('adds https to www links', () => {
    expect(extractFirstUrl('www.example.com/page')).toBe('https://www.example.com/page');
  });

  it('returns null when there is no link', () => {
    expect(extractFirstUrl('просто заметка #тег')).toBeNull();
  });
});

describe('hashtags', () => {
  it('extracts unicode tags and de-duplicates by slug', () => {
    expect(extractHashtags('#Дизайн #UI_Kit #дизайн')).toEqual(['Дизайн', 'UI_Kit']);
  });

  it('does not treat a URL fragment as a hashtag', () => {
    expect(extractHashtags('https://example.com/page#section #чтение')).toEqual(['чтение']);
  });

  it('normalizes tag slugs', () => {
    expect(normalizeTag('#UI Kit!')).toBe('ui-kit');
    expect(normalizeTag('#Привет')).toBe('привет');
    expect(normalizeTag('###')).toBe('');
    expect(tagName('  #UI   Kit ')).toBe('UI Kit');
  });

  it('strips links and tags from the note', () => {
    expect(
      stripUrlsAndHashtags('https://example.com Отличная статья про дизайн #дизайн #чтение'),
    ).toBe('Отличная статья про дизайн');
  });
});

describe('normalizeUrl', () => {
  it('lowercases host, drops fragment and tracking params', () => {
    expect(
      normalizeUrl('HTTPS://Example.COM:443/a/?utm_source=tg&b=1&fbclid=x#frag'),
    ).toBe('https://example.com/a/?b=1');
  });

  it('removes a trailing slash on the root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  it('is idempotent', () => {
    const once = normalizeUrl('https://example.com/a?utm_medium=social&x=1');
    expect(normalizeUrl(once)).toBe(once);
  });

  it('rejects non-http protocols', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow();
  });
});

describe('buildTsQuery', () => {
  it('builds prefix tokens and neutralizes tsquery syntax', () => {
    expect(buildTsQuery('Дизайн посты')).toBe('дизайн:* & посты:*');
    expect(buildTsQuery("a & b' | c")).toBe('a:* & b:* & c:*');
  });

  it('returns null for empty input', () => {
    expect(buildTsQuery('   ')).toBeNull();
    expect(buildTsQuery('!!!')).toBeNull();
  });

  it('de-duplicates tokens', () => {
    expect(buildTsQuery('дизайн Дизайн')).toBe('дизайн:*');
  });
});
