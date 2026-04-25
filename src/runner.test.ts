import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAudit, runRepeatedAudit } from './runner.js';
import { renderJSON } from './reporter/json.js';

const RICH_HTML = `<html>
  <head>
    <title>Example</title>
    <meta name="description" content="An example site">
    <meta property="og:title" content="Example OG">
    <meta property="og:description" content="OG description">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example"}</script>
    <link rel="alternate" type="application/rss+xml" href="/feed.xml">
  </head>
  <body>
    <nav></nav><header></header><main><article><h1>Welcome</h1></article></main><footer></footer>
  </body>
</html>`;

const MINIMAL_HTML = `<html>
  <head><title>Example</title></head>
  <body><div>Plain page</div></body>
</html>`;

function createResponse(
  body: string,
  status = 200,
  contentType = 'text/html; charset=utf-8'
): Response {
  const headers = new Map<string, string>();
  headers.set('content-type', contentType);

  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: {
      forEach: (cb: (value: string, key: string) => void) => headers.forEach((value, key) => cb(value, key)),
    },
  } as unknown as Response;
}

function installFetchMock({
  mainPages = [RICH_HTML],
  llmsStatuses = [200],
}: {
  mainPages?: string[];
  llmsStatuses?: number[];
} = {}): void {
  let mainPageIndex = 0;
  let llmsIndex = 0;

  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (url.endsWith('/robots.txt')) {
      return Promise.resolve(createResponse('User-agent: *\nAllow: /', 200, 'text/plain; charset=utf-8'));
    }

    if (url.endsWith('/llms.txt')) {
      const status = llmsStatuses[Math.min(llmsIndex, llmsStatuses.length - 1)] ?? 200;
      llmsIndex += 1;
      return Promise.resolve(
        createResponse(
          status === 200 ? '# Example site info' : '',
          status,
          'text/plain; charset=utf-8'
        )
      );
    }

    if (
      url.endsWith('/llms-full.txt') ||
      url.endsWith('/openapi.json') ||
      url.endsWith('/sitemap.xml') ||
      url.includes('security.txt')
    ) {
      return Promise.resolve(createResponse('', 404));
    }

    const page = mainPages[Math.min(mainPageIndex, mainPages.length - 1)] ?? RICH_HTML;
    mainPageIndex += 1;
    return Promise.resolve(createResponse(page));
  });
}

describe('runAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a complete AXReport with all required fields', async () => {
    installFetchMock();

    const report = await runAudit({ url: 'https://example.com', timeout: 5000 });

    expect(report.url).toBe('https://example.com');
    expect(report.timestamp).toBeDefined();
    expect(typeof report.version).toBe('string');
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.stability).toBeUndefined();

    expect(['api', 'content', 'hybrid', 'unknown']).toContain(report.siteType);

    expect(report.categories).toBeInstanceOf(Array);
    expect(report.categories.length).toBeGreaterThan(0);
    for (const category of report.categories) {
      expect(category.id).toBeDefined();
      expect(category.title).toBeDefined();
      expect(typeof category.score).toBe('number');
    }

    expect(typeof report.audits).toBe('object');
    expect(Object.keys(report.audits).length).toBe(19);
    expect(report.recommendations).toBeInstanceOf(Array);
  });

  it('should handle audits that throw errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Simulated network failure'));

    const report = await runAudit({ url: 'https://unreachable.test', timeout: 1000 });

    expect(report.url).toBe('https://unreachable.test');
    expect(typeof report.score).toBe('number');
    expect(report.categories).toBeInstanceOf(Array);
    expect(typeof report.audits).toBe('object');
  });
});

describe('runRepeatedAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves single-run behavior when repeat is 1', async () => {
    installFetchMock();

    const report = await runRepeatedAudit({ url: 'https://example.com', timeout: 5000 }, 1);

    expect(report.stability).toBeUndefined();
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  it('adds stability metrics when repeat is greater than 1', async () => {
    installFetchMock({
      mainPages: [RICH_HTML, MINIMAL_HTML, RICH_HTML],
      llmsStatuses: [200, 404, 200],
    });

    const report = await runRepeatedAudit({ url: 'https://example.com', timeout: 5000 }, 3);

    expect(report.stability).toBeDefined();
    expect(report.stability?.runs).toBe(3);
    expect(report.stability?.scores).toHaveLength(3);
    expect(report.stability?.min).toBe(Math.min(...(report.stability?.scores ?? [])));
    expect(report.stability?.max).toBe(Math.max(...(report.stability?.scores ?? [])));
    expect(report.stability?.delta).toBe((report.stability?.max ?? 0) - (report.stability?.min ?? 0));
    expect(report.stability?.delta).toBeGreaterThan(0);
    expect(report.stability?.variance).toBeGreaterThan(0);
  });

  it('keeps the stability summary in JSON output for repeat runs', async () => {
    installFetchMock({
      mainPages: [RICH_HTML, MINIMAL_HTML],
      llmsStatuses: [200, 404],
    });

    const report = await runRepeatedAudit({ url: 'https://example.com', timeout: 5000 }, 2);
    const parsed = JSON.parse(renderJSON(report));

    expect(parsed.stability).toMatchObject({
      runs: 2,
      scores: expect.any(Array),
      min: expect.any(Number),
      max: expect.any(Number),
      mean: expect.any(Number),
      delta: expect.any(Number),
      variance: expect.any(Number),
    });
    expect(parsed.stability.scores).toHaveLength(2);
  });
});
