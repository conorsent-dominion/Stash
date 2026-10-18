import { AppError } from '../lib/errors.js';
import type { Bookmark, TagInput } from '../types.js';
import {
  fetchLinkPreview,
  fallbackTitle,
  type LinkPreview,
} from './metadata.js';
import type { BookmarkRepository } from './repository.js';
import {
  extractFirstUrl,
  extractHashtags,
  normalizeTag,
  normalizeUrl,
  stripUrlsAndHashtags,
  tagName,
} from './url.js';

export interface SaveBookmarkResult {
  bookmark: Bookmark;
  tags: TagInput[];
  duplicate: boolean;
}

export type FetchPreview = (url: string) => Promise<LinkPreview>;

export async function saveBookmarkFromText(
  repo: BookmarkRepository,
  userId: string,
  text: string,
  fetchPreview: FetchPreview = fetchLinkPreview,
): Promise<SaveBookmarkResult> {
  const rawUrl = extractFirstUrl(text);
  if (!rawUrl) {
    throw new AppError(400, 'no_url', 'В сообщении нет ссылки');
  }

  const normalizedUrl = normalizeUrl(rawUrl);
  const note = stripUrlsAndHashtags(text);
  const tags = buildTags(text);

  let preview: LinkPreview;
  try {
    preview = await fetchPreview(normalizedUrl);
  } catch {
    preview = {
      url: normalizedUrl,
      normalizedUrl,
      title: fallbackTitle(new URL(normalizedUrl)),
      preview: null,
      description: null,
    };
  }

  const existing = await repo.findByNormalizedUrl(userId, preview.normalizedUrl);
  const fallback = fallbackTitle(new URL(preview.normalizedUrl));
  const hasRealTitle = preview.title.trim().length > 0 && preview.title.trim() !== fallback;

  // A failed preview fetch falls back to the hostname. Do not overwrite a good
  // existing OG title with that fallback when the same URL is sent again.
  const title = existing && !hasRealTitle ? '' : preview.title.trim() || fallback;

  const bookmark = await repo.save(userId, {
    url: preview.normalizedUrl,
    normalizedUrl: preview.normalizedUrl,
    title,
    preview: preview.preview,
    description: preview.description,
    userNote: note,
    tags,
  });

  return { bookmark, tags, duplicate: existing !== null };
}

function buildTags(text: string): TagInput[] {
  const bySlug = new Map<string, TagInput>();

  for (const raw of extractHashtags(text)) {
    const slug = normalizeTag(raw);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { name: tagName(raw), slug });
  }

  return [...bySlug.values()];
}
