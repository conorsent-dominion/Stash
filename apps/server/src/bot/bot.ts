import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { saveBookmarkFromText, type FetchPreview } from '../bookmarks/service.js';
import type { BookmarkRepository } from '../bookmarks/repository.js';
import { extractFirstUrl } from '../bookmarks/url.js';
import type { UserStore } from '../users.js';
import { HELP_TEXT, renderRecent, renderSavedReply, START_TEXT } from './format.js';

export interface BotDeps {
  repo: BookmarkRepository;
  users: UserStore;
  fetchPreview?: FetchPreview;
}

export function createBot(config: AppConfig, deps: BotDeps): Bot {
  const bot = new Bot(config.botToken);

  bot.command('start', async (ctx) => {
    await ctx.reply(START_TEXT, replyOptions(ctx, config));
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT, replyOptions(ctx, config));
  });

  bot.command('recent', async (ctx) => {
    if (!ctx.from) return;

    try {
      const user = await deps.users.upsertByTelegram(profileFrom(ctx));
      const page = await deps.repo.list(user.id, { limit: 5, offset: 0 });
      await ctx.reply(renderRecent(page.items), replyOptions(ctx, config));
    } catch (error) {
      console.error('[bot] /recent failed', error);
      await ctx.reply('Не получилось загрузить закладки. Попробуй ещё раз.');
    }
  });

  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;

    const text = ctx.message.text.trim();

    if (text.startsWith('/')) {
      await ctx.reply('Неизвестная команда. Посмотри /help.', replyOptions(ctx, config));
      return;
    }

    const hiddenUrl = findTextLink(ctx);
    const source = hiddenUrl && !extractFirstUrl(text) ? `${text}\n${hiddenUrl}` : text;

    if (!extractFirstUrl(source)) {
      await ctx.reply(
        'Пришли ссылку — можно с заметкой и хэштегами, например:\n\nhttps://example.com #чтение',
        replyOptions(ctx, config),
      );
      return;
    }

    try {
      const user = await deps.users.upsertByTelegram(profileFrom(ctx));
      const result = await saveBookmarkFromText(
        deps.repo,
        user.id,
        source,
        deps.fetchPreview,
      );
      await ctx.reply(renderSavedReply(result), replyOptions(ctx, config));
    } catch (error) {
      if (error instanceof AppError && error.code === 'no_url') {
        await ctx.reply('В сообщении не нашёл ссылку. Пришли обычный http(s)-адрес.');
        return;
      }

      console.error('[bot] save failed', error);
      await ctx.reply('Не получилось сохранить ссылку. Попробуй ещё раз через минуту.');
    }
  });

  bot.catch((error) => {
    console.error('[bot] unhandled', error.error);
  });

  return bot;
}

function profileFrom(ctx: Context) {
  const from = ctx.from!;
  return {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    language_code: from.language_code,
  };
}

function findTextLink(ctx: Context): string | null {
  const message = ctx.message;
  if (!message || !('entities' in message) || !message.entities) return null;

  for (const entity of message.entities) {
    if (entity.type === 'text_link') return entity.url;
  }
  return null;
}

function replyOptions(ctx: Context, config: AppConfig) {
  const keyboard = new InlineKeyboard();
  const isPrivate = ctx.chat?.type === 'private';
  const canOpenWebApp = isPrivate && config.webappUrl.startsWith('https://');

  if (canOpenWebApp) {
    keyboard.webApp('📚 Открыть библиотеку', config.webappUrl);
  }

  return {
    parse_mode: 'HTML' as const,
    link_preview_options: { is_disabled: true },
    ...(keyboard.inline_keyboard.length > 0 ? { reply_markup: keyboard } : {}),
  };
}
