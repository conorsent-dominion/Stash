import type { Api } from './api.js';
import type { Bookmark, Tag, TagWithCount, User } from './types.js';

const tag = (id: string, name: string, slug: string): Tag => ({ id, name, slug });

const TAGS = {
  design: tag('tag-design', 'Дизайн', 'дизайн'),
  react: tag('tag-react', 'React', 'react'),
  postgres: tag('tag-postgres', 'PostgreSQL', 'postgresql'),
  telegram: tag('tag-telegram', 'Telegram', 'telegram'),
  reading: tag('tag-reading', 'Чтение', 'чтение'),
  productivity: tag('tag-productivity', 'Продуктивность', 'продуктивность'),
  ai: tag('tag-ai', 'AI', 'ai'),
} as const;

const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

const DEMO_ITEMS: Bookmark[] = [
  {
    id: 'demo-1',
    url: 'https://example.com/design-interfaces',
    title: 'Как проектировать интерфейсы, которые не бесят',
    preview:
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=60',
    description: 'Практические принципы спокойных интерфейсов.',
    userNote: 'Перечитать перед следующим редизайном. Особенно про пустые состояния и микрокопирайт.',
    tags: [TAGS.design, TAGS.reading],
    createdAt: hoursAgo(2),
  },
  {
    id: 'demo-2',
    url: 'https://example.com/react-19',
    title: 'React 19: что изменилось для разработчиков',
    preview:
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=900&q=60',
    description: 'Actions, use(), формы и серверные компоненты.',
    userNote: 'Собрать список задач для миграции. Проверить, как Actions сочетаются с нашим API.',
    tags: [TAGS.react],
    createdAt: hoursAgo(7),
  },
  {
    id: 'demo-3',
    url: 'https://example.com/postgres-indexes',
    title: 'Индексы в PostgreSQL: практический гайд',
    preview:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=900&q=60',
    description: 'B-tree, GIN, частичные и составные индексы.',
    userNote: 'Пригодится для поиска по закладкам. Составной индекс user_id + created_at.',
    tags: [TAGS.postgres, TAGS.reading],
    createdAt: hoursAgo(26),
  },
  {
    id: 'demo-4',
    url: 'https://example.com/telegram-mini-apps',
    title: 'Telegram Mini Apps: от идеи до продакшена',
    preview:
      'https://images.unsplash.com/photo-1611605698335-8b1569810432?auto=format&fit=crop&w=900&q=60',
    description: 'initData, темы, WebApp-кнопки и деплой.',
    userNote: 'Проверить валидацию initData и тему оформления. #telegram #разработка',
    tags: [TAGS.telegram, TAGS.design],
    createdAt: hoursAgo(30),
  },
  {
    id: 'demo-5',
    url: 'https://example.com/two-minute-rule',
    title: 'Правило двух минут и другие способы не тонуть в задачах',
    preview: null,
    description: 'Маленькие шаги против прокрастинации.',
    userNote: 'Попробовать неделю: если задача короче двух минут — делать сразу.',
    tags: [TAGS.productivity],
    createdAt: hoursAgo(50),
  },
  {
    id: 'demo-6',
    url: 'https://example.com/rag-guide',
    title: 'Гайд по RAG для небольших продуктов',
    preview:
      'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=900&q=60',
    description: 'Chunking, embeddings и оценка качества ответов.',
    userNote: 'Базовая архитектура для поиска по личной библиотеке. Начать с pgvector.',
    tags: [TAGS.ai, TAGS.reading],
    createdAt: hoursAgo(74),
  },
  {
    id: 'demo-7',
    url: 'https://example.com/clean-code-notes',
    title: 'Чистый код: заметки после перечитывания',
    preview:
      'https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=900&q=60',
    description: 'Имена, границы модулей и цена абстракций.',
    userNote: 'Не тащить абстракцию, пока нет третьего повторения.',
    tags: [TAGS.reading, TAGS.productivity],
    createdAt: hoursAgo(120),
  },
];

const DEMO_USER: User = {
  id: 'demo-user',
  telegramId: 100000001,
  username: 'bookmarks_demo',
  firstName: 'Алексей',
  lastName: null,
  languageCode: 'ru',
  createdAt: hoursAgo(500),
};

export function createDemoApi(): Api {
  let items = [...DEMO_ITEMS];

  return {
    async me() {
      await wait(80);
      return DEMO_USER;
    },

    async items(filters) {
      await wait(160);
      throwIfAborted(filters.signal);

      const query = filters.q?.trim().toLowerCase() ?? '';
      let result = items;

      if (filters.tag) {
        result = result.filter((item) => item.tags.some((itemTag) => itemTag.slug === filters.tag));
      }

      if (query) {
        result = result.filter((item) => {
          const haystack = `${item.title} ${item.userNote} ${item.url}`.toLowerCase();
          return haystack.includes(query);
        });
      }

      const limit = filters.limit ?? 30;
      const offset = filters.offset ?? 0;

      return {
        items: result.slice(offset, offset + limit),
        total: result.length,
        limit,
        offset,
      };
    },

    async tags() {
      await wait(100);
      const counts = new Map<string, TagWithCount>();

      for (const item of items) {
        for (const itemTag of item.tags) {
          const existing = counts.get(itemTag.slug);
          if (existing) {
            existing.itemCount += 1;
          } else {
            counts.set(itemTag.slug, { ...itemTag, itemCount: 1 });
          }
        }
      }

      return [...counts.values()].sort(
        (a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name, 'ru'),
      );
    },

    async remove(id) {
      await wait(120);
      items = items.filter((item) => item.id !== id);
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}
