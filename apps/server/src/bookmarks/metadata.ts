import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { normalizeUrl } from './url.js';

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; TelegramBookmarksBot/1.0; +https://core.telegram.org/bots)';

export class SafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeUrlError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type Lookup = (hostname: string) => Promise<ResolvedAddress[]>;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface LinkPreview {
  url: string;
  normalizedUrl: string;
  title: string;
  preview: string | null;
  description: string | null;
}

export interface FetchPreviewDeps {
  lookup?: Lookup;
  fetch?: FetchLike;
}

const blocked = new BlockList();
// IPv4: this network, private, CGNAT, loopback, link-local/metadata,
// documentation, benchmarking, multicast and reserved space.
blocked.addSubnet('0.0.0.0', 8, 'ipv4');
blocked.addSubnet('10.0.0.0', 8, 'ipv4');
blocked.addSubnet('100.64.0.0', 10, 'ipv4');
blocked.addSubnet('127.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addSubnet('172.16.0.0', 12, 'ipv4');
blocked.addSubnet('192.0.0.0', 24, 'ipv4');
blocked.addSubnet('192.0.2.0', 24, 'ipv4');
blocked.addSubnet('192.168.0.0', 16, 'ipv4');
blocked.addSubnet('198.18.0.0', 15, 'ipv4');
blocked.addSubnet('198.51.100.0', 24, 'ipv4');
blocked.addSubnet('203.0.113.0', 24, 'ipv4');
blocked.addSubnet('224.0.0.0', 4, 'ipv4');
blocked.addSubnet('240.0.0.0', 4, 'ipv4');
// IPv6: IPv4-compatible/unspecified/loopback, ULA, link-local, multicast,
// documentation, discard and NAT64. IPv4-mapped addresses are handled below:
// adding ::ffff:0:0/96 to BlockList would also match every plain IPv4 address.
blocked.addSubnet('::', 96, 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('100::', 64, 'ipv6');
blocked.addSubnet('64:ff9b::', 96, 'ipv6');
// 6to4 and Teredo can tunnel arbitrary (including private) IPv4 targets.
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');

  if (family === 6) {
    const normalized = address.toLowerCase();
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (dotted?.[1]) return isPublicAddress(dotted[1]);

    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (hex?.[1] && hex[2]) {
      const high = Number.parseInt(hex[1], 16);
      const low = Number.parseInt(hex[2], 16);
      return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }

    return !blocked.check(normalized, 'ipv6');
  }

  return false;
}

const defaultLookup: Lookup = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({ address: entry.address, family: entry.family }));
};

export async function assertSafeUrl(raw: string, lookup: Lookup = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeUrlError('Некорректный URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeUrlError('Разрешены только http(s)-ссылки');
  }
  if (url.username || url.password) {
    throw new SafeUrlError('Ссылки с учётными данными запрещены');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();

  if (!hostname) throw new SafeUrlError('Пустой hostname');
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new SafeUrlError('Локальные адреса запрещены');
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new SafeUrlError('Приватные адреса запрещены');
    return url;
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new SafeUrlError('Не удалось разрешить hostname');
  }

  if (addresses.length === 0) throw new SafeUrlError('Hostname не разрешается');
  if (addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new SafeUrlError('Hostname указывает на приватный адрес');
  }

  return url;
}

export function parseOpenGraph(
  html: string,
  baseUrl: string,
): { title: string | null; image: string | null; description: string | null } {
  const meta = extractMetaTags(html);

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta.get(key);
      const cleaned = cleanText(value, 1000);
      if (cleaned) return cleaned;
    }
    return null;
  };

  const htmlTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = pick('og:title', 'twitter:title') ?? cleanText(htmlTitle, 500);
  const description = pick('og:description', 'twitter:description', 'description');
  const rawImage =
    pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src') ??
    extractImageSrc(html);

  return {
    title: title ? title.slice(0, 500) : null,
    image: resolveHttpUrl(rawImage, baseUrl),
    description: description ? description.slice(0, 1000) : null,
  };
}

function extractMetaTags(html: string): Map<string, string> {
  const result = new Map<string, string>();

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    const content = attrs.content;
    if (key && content && !result.has(key)) {
      result.set(key, content);
    }
  }

  return result;
}

function extractImageSrc(html: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.rel ?? '').toLowerCase().split(/\s+/).includes('image_src') && attrs.href) {
      return attrs.href;
    }
  }
  return null;
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const match of tag.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name || name in attrs) continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[name] = decodeEntities(value);
  }

  return attrs;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return isCodePoint(code) ? String.fromCodePoint(code) : whole;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return isCodePoint(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function isCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff;
}

export async function fetchLinkPreview(
  rawUrl: string,
  deps: FetchPreviewDeps = {},
): Promise<LinkPreview> {
  const fetchImpl = deps.fetch ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const safeUrl = await assertSafeUrl(current, lookup);

    let response: Response;
    try {
      response = await fetchImpl(safeUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'ru,en;q=0.8',
        },
      });
    } catch (error) {
      if (error instanceof SafeUrlError) throw error;
      return fallbackPreview(safeUrl);
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) return fallbackPreview(safeUrl);
      current = new URL(location, safeUrl).toString();
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return fallbackPreview(safeUrl);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined);
      return fallbackPreview(safeUrl);
    }

    let html: string;
    try {
      html = await readLimited(response);
    } catch {
      return fallbackPreview(safeUrl);
    }

    const meta = parseOpenGraph(html, safeUrl.toString());
    const normalized = normalizeUrl(safeUrl.toString());

    return {
      url: normalized,
      normalizedUrl: normalized,
      title: meta.title ?? fallbackTitle(safeUrl),
      preview: meta.image,
      description: meta.description,
    };
  }

  return fallbackPreview(new URL(rawUrl));
}

export function fallbackTitle(url: URL): string {
  return url.hostname.replace(/^www\./i, '') || url.toString();
}

function fallbackPreview(url: URL): LinkPreview {
  let normalized: string;
  try {
    normalized = normalizeUrl(url.toString());
  } catch {
    normalized = url.toString();
  }

  return {
    url: normalized,
    normalizedUrl: normalized,
    title: fallbackTitle(url),
    preview: null,
    description: null,
  };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function cleanText(value: string | undefined, maxLength: number): string | null {
  if (!value) return null;
  const cleaned = decodeEntities(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function resolveHttpUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = MAX_BYTES - total;
      if (remaining <= 0) {
        await reader.cancel().catch(() => undefined);
        break;
      }

      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;

      if (total >= MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}
