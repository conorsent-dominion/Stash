export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface UserRow {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedItemRow {
  id: string;
  user_id: string;
  url: string;
  normalized_url: string;
  title: string;
  preview: string | null;
  description: string | null;
  user_note: string;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface SavedItemTagRow {
  saved_item_id: string;
  tag_id: string;
}

export interface ListSavedItemRow {
  id: string;
  url: string;
  title: string;
  preview: string | null;
  description: string | null;
  user_note: string;
  created_at: string;
  tags: Array<{ id: string; name: string; slug: string }>;
  total_count: number;
}

export interface ListTagRow {
  id: string;
  name: string;
  slug: string;
  item_count: number;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: {
          id?: string;
          telegram_id: number;
          username?: string | null;
          first_name?: string;
          last_name?: string | null;
          language_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          telegram_id?: number;
          username?: string | null;
          first_name?: string;
          last_name?: string | null;
          language_code?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_items: {
        Row: SavedItemRow;
        Insert: {
          id?: string;
          user_id: string;
          url: string;
          normalized_url: string;
          title?: string;
          preview?: string | null;
          description?: string | null;
          user_note?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          preview?: string | null;
          description?: string | null;
          user_note?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: TagRow;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      saved_item_tags: {
        Row: SavedItemTagRow;
        Insert: {
          saved_item_id: string;
          tag_id: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_bookmark: {
        Args: {
          p_user_id: string;
          p_url: string;
          p_normalized_url: string;
          p_title: string;
          p_preview: string | null;
          p_description: string | null;
          p_user_note: string;
          p_tags: Json;
        };
        Returns: SavedItemRow;
      };
      list_saved_items: {
        Args: {
          p_user_id: string;
          p_tag_slug: string | null;
          p_tsquery: string | null;
          p_limit: number;
          p_offset: number;
        };
        Returns: ListSavedItemRow[];
      };
      list_tags: {
        Args: { p_user_id: string };
        Returns: ListTagRow[];
      };
      delete_saved_item: {
        Args: { p_user_id: string; p_item_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// ---------------------------------------------------------------------------
// Application-level (camelCase) types
// ---------------------------------------------------------------------------

export interface TelegramProfile {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
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

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface TagWithCount extends Tag {
  itemCount: number;
}

export interface TagInput {
  name: string;
  slug: string;
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

export interface SaveBookmarkInput {
  url: string;
  normalizedUrl: string;
  title: string;
  preview: string | null;
  description: string | null;
  userNote: string;
  tags: TagInput[];
}

export interface ListFilters {
  tag?: string;
  q?: string;
  limit: number;
  offset: number;
}

export interface ItemsPage {
  items: Bookmark[];
  total: number;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    telegramId: Number(row.telegram_id),
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    languageCode: row.language_code,
    createdAt: row.created_at,
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
