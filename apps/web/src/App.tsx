import { useMemo } from 'react';
import { BookmarkCard } from './components/BookmarkCard.js';
import { EmptyState } from './components/EmptyState.js';
import { Header } from './components/Header.js';
import { BookmarkIcon, TelegramIcon } from './components/Icons.js';
import { SearchBar } from './components/SearchBar.js';
import { SkeletonList } from './components/SkeletonList.js';
import { TagFilter } from './components/TagFilter.js';
import { useBookmarks } from './hooks/useBookmarks.js';
import { createApi } from './lib/api.js';
import { createDemoApi } from './lib/demo.js';
import { confirmAction, getInitData, getTelegramUser, hapticTap } from './lib/telegram.js';

export default function App() {
  const demoMode =
    import.meta.env.VITE_DEMO === '1' ||
    new URLSearchParams(window.location.search).get('demo') === '1';
  const initData = getInitData();
  const devAuth = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === '1';
  const api = useMemo(
    () =>
      demoMode
        ? createDemoApi()
        : createApi(import.meta.env.VITE_API_URL ?? '', initData),
    [demoMode, initData],
  );

  if (!demoMode && !initData && !devAuth) {
    return <TelegramGate />;
  }

  return <Library api={api} demo={demoMode} />;
}

function Library({ api, demo }: { api: ReturnType<typeof createApi>; demo: boolean }) {
  const bookmarks = useBookmarks(api);
  const telegramUser = getTelegramUser();
  const name = telegramUser?.first_name ?? (demo ? 'Алексей' : 'Друг');
  const botUrl = import.meta.env.VITE_BOT_URL;

  const handleDelete = async (id: string) => {
    const confirmed = await confirmAction('Удалить закладку? Это действие нельзя отменить.');
    if (!confirmed) return;
    hapticTap();
    await bookmarks.removeBookmark(id);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col bg-canvas">
      <Header name={name} total={bookmarks.libraryTotal} loading={bookmarks.loading} />

      {demo && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11.5px] leading-snug text-amber-700">
          Демо-режим · данные живут только в этой вкладке
        </div>
      )}

      <div className="sticky top-0 z-20 bg-canvas px-4 pb-3 pt-1">
        <SearchBar value={bookmarks.query} onChange={bookmarks.setQuery} />
        <TagFilter
          tags={bookmarks.tags}
          activeTag={bookmarks.activeTag}
          total={bookmarks.libraryTotal}
          onSelect={bookmarks.setActiveTag}
        />
        <div className={`mt-2 h-0.5 overflow-hidden rounded-full bg-line ${bookmarks.loading ? 'opacity-100' : 'opacity-0'}`}>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      </div>

      <main className="flex-1 px-4 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
        {bookmarks.error && bookmarks.items.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] leading-snug text-red-600">
            <span className="flex-1">{bookmarks.error}</span>
            <button
              type="button"
              onClick={bookmarks.retry}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Повторить
            </button>
          </div>
        )}

        {bookmarks.loading && bookmarks.items.length === 0 ? (
          <SkeletonList />
        ) : bookmarks.items.length === 0 ? (
          bookmarks.error ? (
            <EmptyState kind="error" message={bookmarks.error} onRetry={bookmarks.retry} />
          ) : bookmarks.hasFilters ? (
            <EmptyState kind="search" onReset={bookmarks.clearFilters} />
          ) : (
            <EmptyState kind="empty" botUrl={botUrl} />
          )
        ) : (
          <div className="space-y-2.5" aria-busy={bookmarks.loading}>
            {bookmarks.items.map((item) => (
              <BookmarkCard
                key={item.id}
                item={item}
                onDelete={(id) => void handleDelete(id)}
                onTagClick={bookmarks.setActiveTag}
              />
            ))}

            {bookmarks.items.length < bookmarks.total && (
              <button
                type="button"
                onClick={() => void bookmarks.loadMore()}
                disabled={bookmarks.loadingMore || bookmarks.loading}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[13px] font-medium text-ink transition active:scale-[0.99] disabled:opacity-60"
              >
                {bookmarks.loadingMore ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
                    Загружаем…
                  </>
                ) : (
                  `Показать ещё · ${bookmarks.total - bookmarks.items.length}`
                )}
              </button>
            )}

            <p className="pb-2 pt-6 text-center text-[11px] leading-relaxed text-muted">
              Сохраняйте ссылки прямо в чате с ботом —<br />
              они появятся здесь автоматически.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function TelegramGate() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col items-center justify-center bg-canvas px-6 text-center">
      <div className="grid size-16 place-items-center rounded-3xl bg-linear-to-br from-sky-400 via-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
        <BookmarkIcon className="size-7" />
      </div>
      <h1 className="mt-5 text-[23px] font-semibold tracking-[-0.02em] text-ink">
        Закладки в Telegram
      </h1>
      <p className="mt-2 max-w-[19rem] text-[13.5px] leading-relaxed text-muted">
        Откройте приложение из чата с ботом — Telegram передаст данные для входа автоматически.
      </p>

      {import.meta.env.VITE_BOT_URL && (
        <a
          href={import.meta.env.VITE_BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex h-11 items-center gap-2 rounded-2xl bg-accent px-5 text-sm font-medium text-accent-ink"
        >
          <TelegramIcon className="size-4" />
          Открыть бота
        </a>
      )}

      <a
        href="?demo=1"
        className="mt-5 text-[12px] font-medium text-muted underline decoration-line underline-offset-4"
      >
        Посмотреть демо
      </a>
    </div>
  );
}
