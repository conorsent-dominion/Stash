import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type Api } from '../lib/api.js';
import type { Bookmark, TagWithCount } from '../lib/types.js';

const PAGE_SIZE = 20;

export interface UseBookmarksResult {
  items: Bookmark[];
  total: number;
  libraryTotal: number;
  tags: TagWithCount[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: string;
  activeTag: string | null;
  hasFilters: boolean;
  setQuery: (value: string) => void;
  setActiveTag: (slug: string | null) => void;
  clearFilters: () => void;
  retry: () => void;
  loadMore: () => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
}

export function useBookmarks(api: Api): UseBookmarksResult {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [items, setItems] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const debouncedQuery = useDebounced(query, 250);
  const loadMoreAbort = useRef<AbortController | null>(null);

  const loadTags = useCallback(async () => {
    try {
      const next = await api.tags();
      setTags(next);
      setTagsLoaded(true);
    } catch {
      setTagsLoaded(true);
    }
  }, [api]);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreAbort.current?.abort();
    loadMoreAbort.current = null;

    setLoading(true);
    setLoadingMore(false);
    setError(null);

    api
      .items({
        q: debouncedQuery.trim() || undefined,
        tag: activeTag ?? undefined,
        limit: PAGE_SIZE,
        offset: 0,
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setTotal(page.total);
        if (!debouncedQuery.trim() && !activeTag) setLibraryTotal(page.total);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [api, debouncedQuery, activeTag, reloadToken]);

  useEffect(() => {
    return () => loadMoreAbort.current?.abort();
  }, []);

  useEffect(() => {
    if (!tagsLoaded || !activeTag || tags.length === 0) return;
    if (!tags.some((tag) => tag.slug === activeTag)) {
      setActiveTag(null);
    }
  }, [tags, tagsLoaded, activeTag]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || items.length >= total) return;

    const controller = new AbortController();
    loadMoreAbort.current?.abort();
    loadMoreAbort.current = controller;

    setLoadingMore(true);
    setError(null);

    try {
      const page = await api.items({
        q: debouncedQuery.trim() || undefined,
        tag: activeTag ?? undefined,
        limit: PAGE_SIZE,
        offset: items.length,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(page.total);
    } catch (caught) {
      if (!controller.signal.aborted && !isAbortError(caught)) setError(errorMessage(caught));
    } finally {
      if (loadMoreAbort.current === controller) {
        loadMoreAbort.current = null;
        setLoadingMore(false);
      }
    }
  }, [api, loading, loadingMore, items.length, total, debouncedQuery, activeTag]);

  const removeBookmark = useCallback(
    async (id: string) => {
      const snapshot = items;
      const previousTotal = total;
      const previousLibraryTotal = libraryTotal;
      setItems((previous) => previous.filter((item) => item.id !== id));
      setTotal((previous) => Math.max(0, previous - 1));
      setLibraryTotal((previous) => Math.max(0, previous - 1));
      setError(null);

      try {
        await api.remove(id);
        void loadTags();
      } catch (caught) {
        setItems(snapshot);
        setTotal(previousTotal);
        setLibraryTotal(previousLibraryTotal);
        setError(errorMessage(caught));
      }
    },
    [api, items, total, libraryTotal, loadTags],
  );

  const clearFilters = useCallback(() => {
    setQuery('');
    setActiveTag(null);
  }, []);

  return {
    items,
    total,
    libraryTotal,
    tags,
    loading,
    loadingMore,
    error,
    query,
    activeTag,
    hasFilters: Boolean(debouncedQuery.trim() || activeTag),
    setQuery,
    setActiveTag,
    clearFilters,
    retry: () => setReloadToken((token) => token + 1),
    loadMore,
    removeBookmark,
  };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия Telegram истекла. Переоткройте приложение из чата.';
    return error.message;
  }
  return 'Не удалось загрузить закладки. Попробуйте ещё раз.';
}
