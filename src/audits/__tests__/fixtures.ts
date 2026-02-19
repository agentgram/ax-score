/**
 * Shared test fixtures for audit tests.
 *
 * These provide pre-built artifact objects that simulate gatherer output
 * so individual audit tests can focus on their scoring logic.
 */
import type { HttpGatherResult, FileProbe } from '../../gatherers/http-gatherer.js';
import type { HtmlGatherResult, MetaTags, SemanticElements } from '../../gatherers/html-gatherer.js';
import type { ApiGatherResult } from '../../gatherers/api-gatherer.js';

const EMPTY_FILE_PROBE: FileProbe = {
  found: false,
  content: null,
  statusCode: null,
};

export function makeHttpArtifact(
  overrides: Partial<HttpGatherResult> = {}
): Record<string, HttpGatherResult> {
  return {
    http: {
      url: 'https://example.com',
      statusCode: 200,
      headers: {},
      body: '',
      robotsTxt: { ...EMPTY_FILE_PROBE },
      llmsTxt: { ...EMPTY_FILE_PROBE },
      openapiSpec: { ...EMPTY_FILE_PROBE },
      aiPlugin: { ...EMPTY_FILE_PROBE },
      sitemapXml: { ...EMPTY_FILE_PROBE },
      securityTxt: { ...EMPTY_FILE_PROBE },
      ...overrides,
    },
  };
}

const EMPTY_META_TAGS: MetaTags = {
  title: null,
  description: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  canonical: null,
  robots: null,
};

const EMPTY_SEMANTIC_ELEMENTS: SemanticElements = {
  hasNav: false,
  hasMain: false,
  hasArticle: false,
  hasHeader: false,
  hasFooter: false,
  hasH1: false,
  headingCount: 0,
};

export function makeHtmlArtifact(
  overrides: Partial<HtmlGatherResult> = {}
): Record<string, HtmlGatherResult> {
  return {
    html: {
      html: '',
      jsonLd: [],
      metaTags: { ...EMPTY_META_TAGS },
      semanticElements: { ...EMPTY_SEMANTIC_ELEMENTS },
      links: [],
      ...overrides,
    },
  };
}

export function makeApiArtifact(
  overrides: Partial<ApiGatherResult> = {}
): Record<string, ApiGatherResult> {
  return {
    api: {
      hasOpenApi: false,
      openapiVersion: null,
      endpointCount: 0,
      hasJsonContentType: false,
      hasAuthEndpoint: false,
      hasCaptcha: false,
      errorCodeStructured: false,
      hasRateLimitHeaders: false,
      rateLimitHeaders: {},
      hasRetryAfter: false,
      hasExamples: false,
      hasSdkLinks: false,
      hasMachineReadableDocs: false,
      ...overrides,
    },
  };
}
