import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpGatherer } from '../http-gatherer.js';

describe('HttpGatherer', () => {
  const gatherer = new HttpGatherer();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the name "http"', () => {
    expect(gatherer.name).toBe('http');
  });

  it('should gather data from a URL by fetching main page and well-known files', async () => {
    const mockResponse = (body: string, status = 200, headers: Record<string, string> = {}) => {
      const headerMap = new Map(Object.entries(headers));
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(body),
        headers: {
          forEach: (cb: (value: string, key: string) => void) => {
            headerMap.forEach((v, k) => cb(v, k));
          },
        },
      } as unknown as Response);
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

      if (url.endsWith('/robots.txt')) {
        return mockResponse('User-agent: *\nAllow: /');
      }
      if (url.endsWith('/llms.txt')) {
        return mockResponse('# My Site');
      }
      if (url.endsWith('/openapi.json')) {
        return mockResponse('', 404);
      }
      if (url.includes('ai-plugin.json')) {
        return mockResponse('', 404);
      }
      if (url.endsWith('/sitemap.xml')) {
        return mockResponse('', 404);
      }
      if (url.includes('security.txt')) {
        return mockResponse('', 404);
      }
      // Main page or HEAD request
      return mockResponse('<html><body>Hello</body></html>', 200, {
        'content-type': 'text/html; charset=utf-8',
      });
    });

    const result = await gatherer.gather({ url: 'https://example.com' });

    expect(result.url).toBe('https://example.com');
    expect(result.robotsTxt.found).toBe(true);
    expect(result.robotsTxt.content).toContain('User-agent');
    expect(result.llmsTxt.found).toBe(true);
    expect(result.llmsTxt.content).toContain('# My Site');
    expect(result.openapiSpec.found).toBe(false);

    // Verify fetch was called (main page + 6 well-known files + 1 HEAD request)
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should handle network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await gatherer.gather({ url: 'https://unreachable.example.com' });

    expect(result.url).toBe('https://unreachable.example.com');
    expect(result.statusCode).toBe(0);
    expect(result.robotsTxt.found).toBe(false);
    expect(result.llmsTxt.found).toBe(false);
  });
});
