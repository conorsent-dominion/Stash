import { describe, expect, it } from 'vitest';
import { escapeHtml, renderRecent, renderSavedReply } from '../bot/format.js';
import type { Bookmark } from '../types.js';

const bookmark: Bookmark = {
  id: '1',
  url: 'https://example.com/?a=1&b=2',
  title: '<script>alert("x")</script>',
  preview: null,
  description: null,
  userNote: 'Заметка <b>с тегом</b>',
  tags: [],
  createdAt: '2026-10-18T10:00:00.000Z',
};

describe('format', () => {
  it('escapes HTML from user content and URLs', () => {
    const text = renderSavedReply({
      bookmark,
      tags: [{ name: '<Дизайн>', slug: 'дизайн' }],
      duplicate: false,
    });

    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
    expect(text).toContain('&lt;Дизайн&gt;');
    expect(text).toContain('https://example.com/?a=1&amp;b=2');
  });

  it('uses a different heading for duplicates', () => {
    const text = renderSavedReply({ bookmark, tags: [], duplicate: true });
    expect(text).toContain('Обновил');
  });

  it('renders an empty recent list with a hint', () => {
    expect(renderRecent([])).toMatch(/Пока пусто/);
  });

  it('renders recent bookmarks as links', () => {
    const text = renderRecent([bookmark]);
    expect(text).toContain('Последние закладки');
    expect(text).toContain('href=');
  });

  it('escapes quotes in attributes', () => {
    expect(escapeHtml('" onmouseover="x')).toBe('&quot; onmouseover=&quot;x');
  });
});
