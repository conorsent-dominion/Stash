import type { SaveBookmarkResult } from '../bookmarks/service.js';
import type { Bookmark } from '../types.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSavedReply(result: SaveBookmarkResult): string {
  const { bookmark, tags, duplicate } = result;
  const lines: string[] = [];

  lines.push(duplicate ? '♻️ <b>Обновил закладку</b>' : '✅ <b>Сохранил в библиотеку</b>');
  lines.push(
    `<b><a href="${escapeHtml(bookmark.url)}">${escapeHtml(truncate(bookmark.title, 200))}</a></b>`,
  );

  if (bookmark.userNote) {
    lines.push(`📝 ${escapeHtml(truncate(bookmark.userNote, 300))}`);
  }

  if (tags.length > 0) {
    lines.push(tags.map((tag) => `#${escapeHtml(tag.name)}`).join(' '));
  }

  return lines.join('\n');
}

export function renderRecent(items: Bookmark[]): string {
  if (items.length === 0) {
    return 'Пока пусто. Перешли мне ссылку с заметкой и хэштегами — сохраню.';
  }

  const lines = ['📚 <b>Последние закладки</b>'];
  items.forEach((item, index) => {
    lines.push(
      `${index + 1}. <a href="${escapeHtml(item.url)}">${escapeHtml(truncate(item.title, 120))}</a>`,
    );
  });
  return lines.join('\n');
}

export const START_TEXT = [
  '👋 <b>Привет! Я сохраняю полезные ссылки.</b>',
  '',
  'Перешли мне сообщение со ссылкой и добавь заметку — я вытащу заголовок и картинку из OpenGraph.',
  '',
  '<b>Пример:</b>',
  '<pre>https://example.com/article Не забыть прочитать #дизайн #чтение</pre>',
  '',
  'Хэштеги станут тегами, остальной текст — заметкой. Всё это доступно в приложении ниже.',
].join('\n');

export const HELP_TEXT = [
  '<b>Как пользоваться</b>',
  '',
  '1. Отправь или перешли ссылку.',
  '2. Добавь текст — он станет заметкой.',
  '3. Поставь #хэштеги — они станут тегами.',
  '',
  '<b>Команды</b>',
  '/recent — последние пять закладок',
  '/help — эта справка',
  '',
  'Повторная ссылка обновит заметку и добавит новые теги, дубликат не появится.',
].join('\n');

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
