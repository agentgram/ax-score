import { describe, it, expect } from 'vitest';
import { ApiGatherer } from '../api-gatherer.js';
import type { HttpGatherResult } from '../http-gatherer.js';

function makeHttpResult(overrides: Partial<HttpGatherResult> = {}): Record<string, HttpGatherResult> {
  return {
    http: {
      url: 'https://example.com',
      statusCode: 200,
      headers: {},
      body: '',
      robotsTxt: { found: false, content: null, statusCode: null },
      llmsTxt: { found: false, content: null, statusCode: null },
      openapiSpec: { found: false, content: null, statusCode: null },
      aiPlugin: { found: false, content: null, statusCode: null },
      sitemapXml: { found: false, content: null, statusCode: null },
      securityTxt: { found: false, content: null, statusCode: null },
      ...overrides,
    },
  };
}

describe('ApiGatherer', () => {
  const gatherer = new ApiGatherer();

  it('should have the name "api"', () => {
    expect(gatherer.name).toBe('api');
  });

  it('should detect valid OpenAPI spec', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test' },
      paths: { '/users': {}, '/posts': {} },
    });
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        openapiSpec: { found: true, content: spec, statusCode: 200 },
      })
    );

    expect(result.hasOpenApi).toBe(true);
    expect(result.openapiVersion).toBe('3.0.0');
    expect(result.endpointCount).toBe(2);
  });

  it('should handle invalid OpenAPI JSON', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        openapiSpec: { found: true, content: 'not-json', statusCode: 200 },
      })
    );

    expect(result.hasOpenApi).toBe(false);
  });

  it('should detect JSON content type', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        headers: { 'content-type': 'application/json' },
      })
    );

    expect(result.hasJsonContentType).toBe(true);
  });

  it('should detect auth endpoints in body', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({ body: '<a href="/auth/login">Login</a>' })
    );

    expect(result.hasAuthEndpoint).toBe(true);
  });

  it('should detect CAPTCHA', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({ body: '<div class="g-recaptcha"></div>' })
    );

    expect(result.hasCaptcha).toBe(true);
  });

  it('should detect rate limit headers', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '99',
        },
      })
    );

    expect(result.hasRateLimitHeaders).toBe(true);
    expect(result.rateLimitHeaders['x-ratelimit-limit']).toBe('100');
  });

  it('should detect retry-after header', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        headers: { 'retry-after': '60' },
      })
    );

    expect(result.hasRetryAfter).toBe(true);
  });

  it('should detect SDK links', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({ body: '<p>Install with npm install @example/sdk</p>' })
    );

    expect(result.hasSdkLinks).toBe(true);
  });

  it('should detect machine-readable docs when OpenAPI is present', async () => {
    const spec = JSON.stringify({ openapi: '3.0.0', paths: {} });
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        openapiSpec: { found: true, content: spec, statusCode: 200 },
      })
    );

    expect(result.hasMachineReadableDocs).toBe(true);
  });

  it('should detect machine-readable docs when llms.txt is present', async () => {
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        llmsTxt: { found: true, content: '# Site info', statusCode: 200 },
      })
    );

    expect(result.hasMachineReadableDocs).toBe(true);
  });

  it('should handle missing artifacts gracefully', async () => {
    const result = await gatherer.gather({ url: 'https://example.com' });

    expect(result.hasOpenApi).toBe(false);
    expect(result.hasJsonContentType).toBe(false);
  });

  it('should detect examples in OpenAPI spec', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    example: { id: 1, name: 'John' },
                  },
                },
              },
            },
          },
        },
      },
    });
    const result = await gatherer.gather(
      { url: 'https://example.com' },
      makeHttpResult({
        openapiSpec: { found: true, content: spec, statusCode: 200 },
      })
    );

    expect(result.hasExamples).toBe(true);
  });
});
