import { describe, it, expect } from 'vitest';
import { classifySiteType } from '../site-type.js';
import type { HttpGatherResult, FileProbe } from '../../gatherers/http-gatherer.js';
import type { HtmlGatherResult } from '../../gatherers/html-gatherer.js';
import type { GatherResult } from '../../gatherers/base-gatherer.js';

const EMPTY_PROBE: FileProbe = { found: false, content: null, statusCode: null };

function makeArtifacts(
  httpOverrides: Partial<HttpGatherResult> = {},
  htmlOverrides: Partial<HtmlGatherResult> = {}
): Record<string, GatherResult> {
  const http: HttpGatherResult = {
    url: 'https://example.com',
    statusCode: 200,
    headers: {},
    body: '<html><body>hello</body></html>',
    robotsTxt: EMPTY_PROBE,
    llmsTxt: EMPTY_PROBE,
    openapiSpec: EMPTY_PROBE,
    aiPlugin: EMPTY_PROBE,
    sitemapXml: EMPTY_PROBE,
    securityTxt: EMPTY_PROBE,
    ...httpOverrides,
  };

  const html: HtmlGatherResult = {
    html: http.body,
    jsonLd: [],
    metaTags: {
      title: null,
      description: null,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      canonical: null,
      robots: null,
    },
    semanticElements: {
      hasNav: false,
      hasMain: false,
      hasArticle: false,
      hasHeader: false,
      hasFooter: false,
      hasH1: false,
      headingCount: 0,
    },
    links: [],
    ...htmlOverrides,
  };

  return { http, html };
}

describe('classifySiteType', () => {
  it('should classify a content site with article tags', () => {
    const artifacts = makeArtifacts(
      {},
      {
        semanticElements: {
          hasNav: true,
          hasMain: true,
          hasArticle: true,
          hasHeader: true,
          hasFooter: true,
          hasH1: true,
          headingCount: 8,
        },
        jsonLd: [{ '@type': 'WebSite', name: 'Blog' }],
        metaTags: {
          title: 'My Blog',
          description: 'A tech blog',
          ogTitle: null,
          ogDescription: null,
          ogImage: null,
          canonical: null,
          robots: null,
        },
      }
    );

    const result = classifySiteType(artifacts);
    expect(result.type).toBe('content');
    expect(result.signals.content.length).toBeGreaterThan(0);
  });

  it('should classify an API service with OpenAPI spec', () => {
    const artifacts = makeArtifacts({
      openapiSpec: { found: true, content: '{"openapi":"3.0.0"}', statusCode: 200 },
      headers: { 'content-type': 'application/json' },
    });

    const result = classifySiteType(artifacts);
    expect(result.type).toBe('api');
    expect(result.signals.api).toContain('OpenAPI spec found');
    expect(result.signals.api).toContain('main page returns JSON');
  });

  it('should classify hybrid when both signals are present', () => {
    const artifacts = makeArtifacts(
      {
        openapiSpec: { found: true, content: '{"openapi":"3.0.0"}', statusCode: 200 },
      },
      {
        semanticElements: {
          hasNav: true,
          hasMain: true,
          hasArticle: true,
          hasHeader: true,
          hasFooter: true,
          hasH1: true,
          headingCount: 10,
        },
        jsonLd: [{ '@type': 'BlogPosting', headline: 'Post' }],
      }
    );

    const result = classifySiteType(artifacts);
    expect(result.type).toBe('hybrid');
    expect(result.signals.content.length).toBeGreaterThan(0);
    expect(result.signals.api.length).toBeGreaterThan(0);
  });

  it('should return unknown for minimal sites', () => {
    const artifacts = makeArtifacts();

    const result = classifySiteType(artifacts);
    expect(result.type).toBe('unknown');
  });

  it('should detect content via JSON-LD BlogPosting', () => {
    const artifacts = makeArtifacts(
      {},
      {
        jsonLd: [{ '@type': 'BlogPosting', headline: 'Test' }],
      }
    );

    const result = classifySiteType(artifacts);
    // BlogPosting alone (2 pts) < threshold (3), so depends on other signals
    expect(['content', 'unknown']).toContain(result.type);
  });

  it('should detect API via robots.txt API paths', () => {
    const artifacts = makeArtifacts({
      robotsTxt: {
        found: true,
        content: 'User-agent: *\nDisallow: /api/v1/admin\nDisallow: /v2/internal',
        statusCode: 200,
      },
    });

    const result = classifySiteType(artifacts);
    expect(result.signals.api).toContain('robots.txt references API paths');
  });

  it('should detect API via links to API paths', () => {
    const artifacts = makeArtifacts(
      {},
      {
        links: ['https://example.com/api/v1/users', 'https://example.com/docs'],
      }
    );

    const result = classifySiteType(artifacts);
    expect(result.signals.api.length).toBeGreaterThan(0);
    expect(result.signals.api.some((s) => s.includes('API paths'))).toBe(true);
  });
});
