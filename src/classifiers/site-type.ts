import type { SiteType } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';

export interface SiteTypeResult {
  type: SiteType;
  confidence: number; // 0-1
  signals: {
    content: string[];
    api: string[];
  };
}

/**
 * Classifies a site as 'api', 'content', 'hybrid', or 'unknown' based on
 * signals from gathered artifacts.
 *
 * Signals are weighted and tallied independently for content and API.
 * If both scores are significant → hybrid.
 * If one dominates → that type.
 * If neither → unknown.
 */
export function classifySiteType(
  artifacts: Record<string, GatherResult>
): SiteTypeResult {
  const http = artifacts['http'] as HttpGatherResult | undefined;
  const html = artifacts['html'] as HtmlGatherResult | undefined;

  const contentSignals: string[] = [];
  const apiSignals: string[] = [];

  let contentScore = 0;
  let apiScore = 0;

  // --- Content signals ---
  if (html) {
    // <article> is a strong content indicator
    if (html.semanticElements.hasArticle) {
      contentSignals.push('has <article> elements');
      contentScore += 3;
    }

    // Many headings suggest rich content
    if (html.semanticElements.headingCount >= 5) {
      contentSignals.push(`many headings (${html.semanticElements.headingCount})`);
      contentScore += 1;
    }

    // JSON-LD with content-related types
    const jsonLd = html.jsonLd;
    if (Array.isArray(jsonLd)) {
      const contentTypes = new Set([
        'WebSite', 'WebPage', 'Article', 'BlogPosting',
        'NewsArticle', 'TechArticle', 'ScholarlyArticle',
        'Recipe', 'HowTo', 'FAQPage', 'BreadcrumbList',
      ]);
      for (const block of jsonLd) {
        const blockType = getBlockType(block);
        if (contentTypes.has(blockType)) {
          contentSignals.push(`JSON-LD type: ${blockType}`);
          contentScore += 2;
          break; // one match is enough
        }
      }
    }

    // Large HTML body (content-rich pages tend to be larger)
    if (html.html.length > 10_000) {
      contentSignals.push('large HTML body (>10KB)');
      contentScore += 1;
    }

    // Meta description present (content sites usually have these)
    if (html.metaTags.description) {
      contentSignals.push('has meta description');
      contentScore += 1;
    }

    // Semantic structure (nav, main, header, footer)
    const semCount = [
      html.semanticElements.hasNav,
      html.semanticElements.hasMain,
      html.semanticElements.hasHeader,
      html.semanticElements.hasFooter,
    ].filter(Boolean).length;

    if (semCount >= 3) {
      contentSignals.push(`strong semantic structure (${semCount}/4)`);
      contentScore += 1;
    }
  }

  // --- API signals ---
  if (http) {
    // OpenAPI spec found → strong API indicator
    if (http.openapiSpec.found) {
      apiSignals.push('OpenAPI spec found');
      apiScore += 4;
    }

    // robots.txt references API paths
    if (http.robotsTxt.content) {
      const robots = http.robotsTxt.content.toLowerCase();
      if (robots.includes('/api/') || robots.includes('/v1/') || robots.includes('/v2/')) {
        apiSignals.push('robots.txt references API paths');
        apiScore += 1;
      }
    }

    // Response content-type is JSON
    const contentType = http.headers['content-type'] ?? '';
    if (contentType.includes('application/json')) {
      apiSignals.push('main page returns JSON');
      apiScore += 3;
    }
  }

  if (html) {
    // Links containing /api/ paths
    const apiLinks = html.links.filter(
      (l) => /\/api\/|\/v[0-9]+\/|\/graphql/i.test(l)
    );
    if (apiLinks.length > 0) {
      apiSignals.push(`links to API paths (${apiLinks.length})`);
      apiScore += 2;
    }
  }

  // --- Classification ---
  const threshold = 3; // minimum score to consider a type
  const isContent = contentScore >= threshold;
  const isApi = apiScore >= threshold;

  let type: SiteType;
  if (isContent && isApi) {
    type = 'hybrid';
  } else if (isContent) {
    type = 'content';
  } else if (isApi) {
    type = 'api';
  } else {
    type = 'unknown';
  }

  // Confidence: ratio of winning score to total possible
  const maxScore = Math.max(contentScore + apiScore, 1);
  const confidence = Math.min(
    Math.max(contentScore, apiScore) / maxScore,
    1
  );

  return {
    type,
    confidence: Math.round(confidence * 100) / 100,
    signals: {
      content: contentSignals,
      api: apiSignals,
    },
  };
}

function getBlockType(block: unknown): string {
  if (typeof block !== 'object' || block === null) return '';
  const obj = block as Record<string, unknown>;
  const t = obj['@type'];
  if (typeof t === 'string') return t;
  if (Array.isArray(t) && t.length > 0) return String(t[0]);
  return '';
}
