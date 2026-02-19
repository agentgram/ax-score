import { describe, it, expect } from 'vitest';
import { HtmlGatherer } from '../html-gatherer.js';
import type { HttpGatherResult } from '../http-gatherer.js';

function makeHttpResult(body: string): Record<string, HttpGatherResult> {
  return {
    http: {
      url: 'https://example.com',
      statusCode: 200,
      headers: {},
      body,
      robotsTxt: { found: false, content: null, statusCode: null },
      llmsTxt: { found: false, content: null, statusCode: null },
      openapiSpec: { found: false, content: null, statusCode: null },
      aiPlugin: { found: false, content: null, statusCode: null },
      sitemapXml: { found: false, content: null, statusCode: null },
      securityTxt: { found: false, content: null, statusCode: null },
    },
  };
}

describe('HtmlGatherer', () => {
  const gatherer = new HtmlGatherer();

  it('should have the name "html"', () => {
    expect(gatherer.name).toBe('html');
  });

  it('should extract title from HTML', async () => {
    const html = '<html><head><title>Test Site</title></head><body></body></html>';
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.metaTags.title).toBe('Test Site');
  });

  it('should extract meta description', async () => {
    const html = '<html><head><meta name="description" content="A test page"></head></html>';
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.metaTags.description).toBe('A test page');
  });

  it('should extract og:title', async () => {
    const html = '<html><head><meta property="og:title" content="OG Title"></head></html>';
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.metaTags.ogTitle).toBe('OG Title');
  });

  it('should extract JSON-LD blocks', async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type": "WebSite", "name": "Example"}</script>
    </head></html>`;
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.jsonLd).toHaveLength(1);
    expect(result.jsonLd[0]).toEqual({ '@type': 'WebSite', name: 'Example' });
  });

  it('should skip malformed JSON-LD', async () => {
    const html = `<html><head>
      <script type="application/ld+json">not-json</script>
    </head></html>`;
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.jsonLd).toHaveLength(0);
  });

  it('should detect semantic HTML elements', async () => {
    const html = '<html><body><nav></nav><main><header></header><h1>Title</h1><footer></footer></main></body></html>';
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.semanticElements.hasNav).toBe(true);
    expect(result.semanticElements.hasMain).toBe(true);
    expect(result.semanticElements.hasHeader).toBe(true);
    expect(result.semanticElements.hasFooter).toBe(true);
    expect(result.semanticElements.hasH1).toBe(true);
  });

  it('should extract links from anchor tags', async () => {
    const html = '<html><body><a href="https://example.com/about">About</a><a href="/contact">Contact</a></body></html>';
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(html));

    expect(result.links).toContain('https://example.com/about');
    expect(result.links).toContain('/contact');
  });

  it('should handle empty HTML gracefully', async () => {
    const result = await gatherer.gather({ url: 'https://example.com' }, makeHttpResult(''));

    expect(result.html).toBe('');
    expect(result.jsonLd).toHaveLength(0);
    expect(result.metaTags.title).toBeNull();
    expect(result.links).toHaveLength(0);
  });

  it('should handle missing artifacts gracefully', async () => {
    const result = await gatherer.gather({ url: 'https://example.com' });

    expect(result.html).toBe('');
    expect(result.jsonLd).toHaveLength(0);
  });
});
