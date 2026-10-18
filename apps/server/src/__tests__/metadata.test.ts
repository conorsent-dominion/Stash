import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeUrl,
  fetchLinkPreview,
  isPublicAddress,
  parseOpenGraph,
  SafeUrlError,
  type FetchLike,
  type Lookup,
} from '../bookmarks/metadata.js';

const publicLookup: Lookup = async () => [{ address: '8.8.8.8', family: 4 }];

describe('isPublicAddress', () => {
  it('allows public addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true);
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(isPublicAddress('::ffff:808:808')).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::7f00:1',
    '2002:7f00:1::',
    '2001::1',
  ])('blocks %s', (address: string) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  it('rejects loopback literals before any request', async () => {
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(SafeUrlError);
    await expect(assertSafeUrl('http://[::1]/')).rejects.toBeInstanceOf(SafeUrlError);
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    const lookup: Lookup = async () => [{ address: '192.168.0.10', family: 4 }];
    await expect(assertSafeUrl('https://evil.example/', lookup)).rejects.toThrow(/приватный/);
  });

  it('rejects local hostnames', async () => {
    await expect(assertSafeUrl('http://localhost:3000/')).rejects.toThrow(/Локальные/);
  });

  it('accepts a public hostname', async () => {
    const url = await assertSafeUrl('https://example.com/post', publicLookup);
    expect(url.hostname).toBe('example.com');
  });
});

describe('parseOpenGraph', () => {
  it('reads meta tags regardless of attribute order and resolves relative images', () => {
    const html = `
      <html><head>
        <meta content="Большой гайд &amp; шпаргалка" property="og:title">
        <meta property="og:image" content="/images/cover.png">
        <meta name="description" content="Короткое описание">
        <title>HTML fallback</title>
      </head></html>`;

    const result = parseOpenGraph(html, 'https://example.com/posts/1');

    expect(result.title).toBe('Большой гайд & шпаргалка');
    expect(result.image).toBe('https://example.com/images/cover.png');
    expect(result.description).toBe('Короткое описание');
  });

  it('falls back to <title> and decodes numeric entities', () => {
    const result = parseOpenGraph('<title>Hello &#x27;world&#x27;</title>', 'https://example.com');
    expect(result.title).toBe("Hello 'world'");
    expect(result.image).toBeNull();
  });
});

describe('fetchLinkPreview', () => {
  it('returns metadata from an HTML page', async () => {
    const fetchMock: FetchLike = async () =>
      new Response(
        `<html><head><meta property="og:title" content="Telegram"><meta property="og:image" content="https://cdn.example.com/a.jpg"></head></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );

    const preview = await fetchLinkPreview('https://example.com/post?utm_source=tg', {
      lookup: publicLookup,
      fetch: fetchMock,
    });

    expect(preview.title).toBe('Telegram');
    expect(preview.preview).toBe('https://cdn.example.com/a.jpg');
    expect(preview.normalizedUrl).toBe('https://example.com/post');
  });

  it('falls back to the hostname for non-HTML responses', async () => {
    const fetchMock: FetchLike = async () =>
      new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } });

    const preview = await fetchLinkPreview('https://example.com/file.pdf', {
      lookup: publicLookup,
      fetch: fetchMock,
    });

    expect(preview.title).toBe('example.com');
    expect(preview.preview).toBeNull();
  });

  it('falls back when the network request fails', async () => {
    const fetchMock: FetchLike = async () => {
      throw new Error('network down');
    };

    const preview = await fetchLinkPreview('https://example.com/post', {
      lookup: publicLookup,
      fetch: fetchMock,
    });

    expect(preview.title).toBe('example.com');
  });

  it('rejects a redirect to a private address', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      }),
    ) as unknown as FetchLike;

    await expect(
      fetchLinkPreview('https://example.com/redirect', {
        lookup: publicLookup,
        fetch: fetchMock,
      }),
    ).rejects.toBeInstanceOf(SafeUrlError);
  });

  it('does not call fetch for a private URL', async () => {
    const fetchMock = vi.fn();
    await expect(
      fetchLinkPreview('http://169.254.169.254/latest/meta-data', {
        fetch: fetchMock as unknown as FetchLike,
      }),
    ).rejects.toBeInstanceOf(SafeUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
