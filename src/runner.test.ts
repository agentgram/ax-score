import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAudit } from './runner.js';

describe('runAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a complete AXReport with all required fields', async () => {
    // Mock all fetch calls to return predictable data
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

      const headers = new Map<string, string>();
      headers.set('content-type', 'text/html; charset=utf-8');

      if (url.endsWith('/robots.txt')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('User-agent: *\nAllow: /'),
          headers: { forEach: (cb: (v: string, k: string) => void) => headers.forEach((v, k) => cb(v, k)) },
        } as unknown as Response);
      }
      if (url.endsWith('/llms.txt')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('# Example site info'),
          headers: { forEach: (cb: (v: string, k: string) => void) => headers.forEach((v, k) => cb(v, k)) },
        } as unknown as Response);
      }
      // All other probes return 404
      if (
        url.endsWith('/openapi.json') ||
        url.includes('ai-plugin.json') ||
        url.endsWith('/sitemap.xml') ||
        url.includes('security.txt')
      ) {
        return Promise.resolve({
          ok: false,
          status: 404,
          text: () => Promise.resolve(''),
          headers: { forEach: (cb: (v: string, k: string) => void) => headers.forEach((v, k) => cb(v, k)) },
        } as unknown as Response);
      }

      // Main page
      const body = `<html>
        <head>
          <title>Example</title>
          <meta name="description" content="An example site">
          <meta property="og:title" content="Example OG">
          <meta property="og:description" content="OG description">
        </head>
        <body>
          <nav></nav><header></header><main><h1>Welcome</h1></main><footer></footer>
        </body>
      </html>`;

      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(body),
        headers: { forEach: (cb: (v: string, k: string) => void) => headers.forEach((v, k) => cb(v, k)) },
      } as unknown as Response);
    });

    const report = await runAudit({ url: 'https://example.com', timeout: 5000 });

    // Verify report structure
    expect(report.url).toBe('https://example.com');
    expect(report.timestamp).toBeDefined();
    expect(typeof report.version).toBe('string');
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);

    // Verify categories
    expect(report.categories).toBeInstanceOf(Array);
    expect(report.categories.length).toBeGreaterThan(0);
    for (const cat of report.categories) {
      expect(cat.id).toBeDefined();
      expect(cat.title).toBeDefined();
      expect(typeof cat.score).toBe('number');
    }

    // Verify audits
    expect(typeof report.audits).toBe('object');
    expect(Object.keys(report.audits).length).toBe(19);

    // Verify recommendations
    expect(report.recommendations).toBeInstanceOf(Array);
  });

  it('should handle audits that throw errors gracefully', async () => {
    // Mock fetch to reject on all calls
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Simulated network failure'));

    const report = await runAudit({ url: 'https://unreachable.test', timeout: 1000 });

    // Even if all gathers fail, the report should still be produced
    expect(report.url).toBe('https://unreachable.test');
    expect(typeof report.score).toBe('number');
    expect(report.categories).toBeInstanceOf(Array);
    expect(typeof report.audits).toBe('object');
  });
});
