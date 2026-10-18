import { AppError } from '../lib/errors.js';

const URL_PATTERN = /(?<![\p{L}\p{N}_@])(?:https?:\/\/|www\.)[^\s<>"'`]+/giu;
const HASHTAG_PATTERN = /(?<![\p{L}\p{N}_#])#([\p{L}\p{N}_]{1,50})/gu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}»"']+$/u;

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref_src',
]);

export function extractFirstUrl(text: string): string | null {
  URL_PATTERN.lastIndex = 0;
  const match = URL_PATTERN.exec(text);
  if (!match) return null;

  let candidate = match[0].replace(TRAILING_PUNCTUATION, '');
  if (!candidate) return null;
  if (candidate.startsWith('www.')) {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function extractHashtags(text: string): string[] {
  const withoutUrls = text.replace(URL_PATTERN, ' ');
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of withoutUrls.matchAll(HASHTAG_PATTERN)) {
    const name = match[1];
    if (!name) continue;
    const slug = normalizeTag(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(name.trim());
    if (result.length >= 10) break;
  }

  return result;
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function tagName(raw: string): string {
  const cleaned = raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 50);
  return cleaned || normalizeTag(raw);
}

export function stripUrlsAndHashtags(text: string): string {
  return text
    .replace(URL_PATTERN, ' ')
    .replace(HASHTAG_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
}

export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
  } catch {
    throw new AppError(400, 'invalid_url', 'Некорректная ссылка');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(400, 'invalid_url', 'Поддерживаются только http(s)-ссылки');
  }
  if (url.username || url.password) {
    throw new AppError(400, 'invalid_url', 'Ссылки с логином и паролем не поддерживаются');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
    }
  }

  let normalized = url.toString();
  if (url.pathname === '/' && !url.search) {
    normalized = normalized.replace(/\/$/, '');
  }

  return normalized.slice(0, 2048);
}

/**
 * Turns user input into a safe prefix tsquery: "диз посты" -> "диз:* & посты:*".
 * Only unicode letters, digits and underscores survive, so the result can be
 * cast to tsquery without syntax errors.
 */
export function buildTsQuery(query: string): string | null {
  const tokens = query
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/u)
    .map((token) =>
      token
        .replace(/^#+/u, '')
        .replace(/[^\p{L}\p{N}_]/gu, ''),
    )
    .filter((token) => token.length > 0)
    .slice(0, 8)
    .map((token) => token.slice(0, 64));

  if (tokens.length === 0) return null;
  return [...new Set(tokens)].map((token) => `${token}:*`).join(' & ');
}
