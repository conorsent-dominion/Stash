import type { Db } from '../db.js';
import type {
  Bookmark,
  Json,
  ListFilters,
  ListSavedItemRow,
  ListTagRow,
  SaveBookmarkInput,
  SavedItemRow,
  Tag,
  TagRow,
  TagWithCount,
} from '../types.js';
import { buildTsQuery } from './url.js';

export interface BookmarkRepository {
  list(userId: string, filters: ListFilters): Promise<{ items: Bookmark[]; total: number }>;
  tags(userId: string): Promise<TagWithCount[]>;
  save(userId: string, input: SaveBookmarkInput): Promise<Bookmark>;
  remove(userId: string, id: string): Promise<boolean>;
  findByNormalizedUrl(userId: string, normalizedUrl: string): Promise<{ id: string; title: string } | null>;
}

export class SupabaseBookmarkRepository implements BookmarkRepository {
  constructor(private readonly db: Db) {}

  async list(userId: string, filters: ListFilters): Promise<{ items: Bookmark[]; total: number }> {
    const tsquery = filters.q ? buildTsQuery(filters.q) : null;
    if (filters.q?.trim() && !tsquery) {
      return { items: [], total: 0 };
    }

    const { data, error } = await this.db.rpc('list_saved_items', {
      p_user_id: userId,
      p_tag_slug: filters.tag?.trim() || null,
      p_tsquery: tsquery,
      p_limit: Math.min(Math.max(filters.limit, 1), 100),
      p_offset: Math.max(filters.offset, 0),
    });

    if (error) {
      throw new Error(`Failed to list bookmarks: ${error.message}`);
    }

    const rows = (data ?? []) as ListSavedItemRow[];
    return {
      items: rows.map((row) => mapListRow(row)),
      total: rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0,
    };
  }

  async tags(userId: string): Promise<TagWithCount[]> {
    const { data, error } = await this.db.rpc('list_tags', { p_user_id: userId });
    if (error) {
      throw new Error(`Failed to list tags: ${error.message}`);
    }

    return ((data ?? []) as ListTagRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      itemCount: Number(row.item_count),
    }));
  }

  async save(userId: string, input: SaveBookmarkInput): Promise<Bookmark> {
    const { data, error } = await this.db.rpc('save_bookmark', {
      p_user_id: userId,
      p_url: input.url,
      p_normalized_url: input.normalizedUrl,
      p_title: input.title,
      p_preview: input.preview,
      p_description: input.description,
      p_user_note: input.userNote,
      p_tags: input.tags as unknown as Json,
    });

    if (error || !data) {
      throw new Error(`Failed to save bookmark: ${error?.message ?? 'no data'}`);
    }

    const saved = data as SavedItemRow;
    const tags = await this.loadTagsForItem(userId, saved.id);
    return mapItemRow(saved, tags);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('delete_saved_item', {
      p_user_id: userId,
      p_item_id: id,
    });

    if (error) {
      throw new Error(`Failed to delete bookmark: ${error.message}`);
    }

    return data === true;
  }

  async findByNormalizedUrl(
    userId: string,
    normalizedUrl: string,
  ): Promise<{ id: string; title: string } | null> {
    const { data, error } = await this.db
      .from('saved_items')
      .select('id,title')
      .eq('user_id', userId)
      .eq('normalized_url', normalizedUrl)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find bookmark: ${error.message}`);
    }

    return (data as { id: string; title: string } | null) ?? null;
  }

  private async loadTagsForItem(userId: string, itemId: string): Promise<Tag[]> {
    const { data: linksData, error: linkError } = await this.db
      .from('saved_item_tags')
      .select('tag_id')
      .eq('saved_item_id', itemId);

    if (linkError) {
      throw new Error(`Failed to load item tags: ${linkError.message}`);
    }

    const links = (linksData ?? []) as Array<{ tag_id: string }>;
    const tagIds = [...new Set(links.map((link) => link.tag_id))];
    if (tagIds.length === 0) return [];

    const { data: tagsData, error: tagError } = await this.db
      .from('tags')
      .select('id,name,slug')
      .in('id', tagIds)
      .eq('user_id', userId);

    if (tagError) {
      throw new Error(`Failed to load tags: ${tagError.message}`);
    }

    return ((tagsData ?? []) as Array<Pick<TagRow, 'id' | 'name' | 'slug'>>).map((tag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
    }));
  }
}

function mapItemRow(row: SavedItemRow, tags: Tag[]): Bookmark {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    preview: row.preview,
    description: row.description,
    userNote: row.user_note,
    tags,
    createdAt: row.created_at,
  };
}

function mapListRow(row: ListSavedItemRow): Bookmark {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    preview: row.preview,
    description: row.description,
    userNote: row.user_note,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
  };
}

function parseTags(value: unknown): Tag[] {
  if (!Array.isArray(value)) return [];

  const tags: Tag[] = [];
  for (const entry of value) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Tag).id === 'string' &&
      typeof (entry as Tag).name === 'string' &&
      typeof (entry as Tag).slug === 'string'
    ) {
      tags.push({ id: (entry as Tag).id, name: (entry as Tag).name, slug: (entry as Tag).slug });
    }
  }
  return tags;
}
