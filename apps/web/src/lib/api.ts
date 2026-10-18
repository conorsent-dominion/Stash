import type { Bookmark, Filters, ItemsPage, TagWithCount, User } from './types.js';

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Api {
  me(): Promise<User>;
  items(filters: Filters): Promise<ItemsPage>;
  tags(): Promise<TagWithCount[]>;
  remove(id: string): Promise<void>;
}

export function createApi(baseUrl: string, initData: string): Api {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (initData) headers.set('X-Telegram-Init-Data', initData);

    let response: Response;
    try {
      response = await fetch(`${root}${path}`, { ...init, headers });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(0, 'network_error', 'Нет связи с сервером. Проверьте интернет.');
    }

    const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.error?.code ?? 'http_error',
        payload?.error?.message ?? 'Не удалось загрузить данные',
      );
    }

    return payload as T;
  }

  return {
    async me() {
      const data = await request<{ user: User }>('/api/me');
      return data.user;
    },

    async items(filters) {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.limit !== undefined) params.set('limit', String(filters.limit));
      if (filters.offset !== undefined) params.set('offset', String(filters.offset));

      const query = params.toString();
      return request<ItemsPage>(`/api/items${query ? `?${query}` : ''}`, {
        signal: filters.signal,
      });
    },

    async tags() {
      const data = await request<{ tags: TagWithCount[] }>('/api/tags');
      return data.tags;
    },

    async remove(id) {
      await request<{ ok: true }>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

export type { Bookmark };
