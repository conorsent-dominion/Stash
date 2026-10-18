import { describe, expect, it, vi } from 'vitest';
import { saveBookmarkFromText } from '../bookmarks/service.js';
import type { BookmarkRepository } from '../bookmarks/repository.js';
import type { Bookmark, SaveBookmarkInput } from '../types.js';
import { AppError } from '../lib/errors.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function makeRepo(overrides: Partial<BookmarkRepository> = {}): BookmarkRepository {
  return {
    async list() {
      return { items: [], total: 0 };
    },
    async tags() {
      return [];
    },
    async save(_userId: string, input: SaveBookmarkInput): Promise<Bookmark> {
      return {
        id: 'item-1',
        url: input.url,
        title: input.title,
        preview: input.preview,
        description: input.description,
        userNote: input.userNote,
        tags: input.tags.map((tag, index) => ({ ...tag, id: `tag-${index}` })),
        createdAt: '2026-10-18T10:00:00.000Z',
      };
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

const preview = async () => ({
  url: 'https://example.com/article',
  normalizedUrl: 'https://example.com/article',
  title: 'Заголовок из OpenGraph',
  preview: 'https://example.com/cover.jpg',
  description: 'Описание',
});

describe('saveBookmarkFromText', () => {
  it('parses note and hashtags, then saves with OpenGraph data', async () => {
    const repo = makeRepo();
    const save = vi.spyOn(repo, 'save');

    const result = await saveBookmarkFromText(
      repo,
      USER_ID,
      'https://example.com/article Отличная статья #Дизайн #UI_Kit',
      preview,
    );

    expect(result.duplicate).toBe(false);
    expect(result.tags).toEqual([
      { name: 'Дизайн', slug: 'дизайн' },
      { name: 'UI_Kit', slug: 'ui_kit' },
    ]);
    expect(save).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        normalizedUrl: 'https://example.com/article',
        title: 'Заголовок из OpenGraph',
        userNote: 'Отличная статья',
      }),
    );
  });

  it('falls back to the hostname when the preview fails', async () => {
    const failingPreview = async () => {
      throw new Error('blocked');
    };

    const result = await saveBookmarkFromText(
      makeRepo(),
      USER_ID,
      'https://example.com/page',
      failingPreview,
    );

    expect(result.bookmark.title).toBe('example.com');
    expect(result.bookmark.preview).toBeNull();
  });

  it('marks an existing URL as duplicate', async () => {
    const repo = makeRepo({
      async findByNormalizedUrl() {
        return { id: 'old', title: 'Old' };
      },
    });

    const result = await saveBookmarkFromText(
      repo,
      USER_ID,
      'https://example.com/article',
      preview,
    );

    expect(result.duplicate).toBe(true);
  });

  it('keeps an existing title when the repeated preview falls back to hostname', async () => {
    const repo = makeRepo({
      async findByNormalizedUrl() {
        return { id: 'old', title: 'Хороший заголовок' };
      },
    });
    const save = vi.spyOn(repo, 'save');
    const failedPreview = async () => {
      throw new Error('site is down');
    };

    await saveBookmarkFromText(
      repo,
      USER_ID,
      'https://example.com/article',
      failedPreview,
    );

    expect(save).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: '' }),
    );
  });

  it('rejects messages without a URL', async () => {
    await expect(saveBookmarkFromText(makeRepo(), USER_ID, 'просто заметка', preview)).rejects.toMatchObject({
      code: 'no_url',
    });
  });

  it('uses the detected final URL after redirects', async () => {
    const redirectPreview = async () => ({
      url: 'https://example.com/final',
      normalizedUrl: 'https://example.com/final',
      title: 'Final',
      preview: null,
      description: null,
    });

    const result = await saveBookmarkFromText(
      makeRepo(),
      USER_ID,
      'https://example.com/start',
      redirectPreview,
    );

    expect(result.bookmark.url).toBe('https://example.com/final');
  });
});
