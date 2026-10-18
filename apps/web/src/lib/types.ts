export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface TagWithCount extends Tag {
  itemCount: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  preview: string | null;
  description: string | null;
  userNote: string;
  tags: Tag[];
  createdAt: string;
}

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
  createdAt: string;
}

export interface ItemsPage {
  items: Bookmark[];
  total: number;
  limit: number;
  offset: number;
}

export interface Filters {
  tag?: string;
  q?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}
