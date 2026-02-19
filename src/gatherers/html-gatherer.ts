import type { AXConfig } from '../types.js';
import { BaseGatherer, type GatherResult } from './base-gatherer.js';
import type { HttpGatherResult } from './http-gatherer.js';

export interface MetaTags {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonical: string | null;
  robots: string | null;
}

export interface SemanticElements {
  hasNav: boolean;
  hasMain: boolean;
  hasArticle: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  hasH1: boolean;
  headingCount: number;
}

export interface HtmlGatherResult extends GatherResult {
  html: string;
  jsonLd: unknown[];
  metaTags: MetaTags;
  semanticElements: SemanticElements;
  links: string[];
}

// Simple regex-based extraction (no external DOM parser dependency)
function extractMetaContent(html: string, nameOrProp: string): string | null {
  // Match name="..." or property="..."
  const pattern = new RegExp(
    `<meta[^>]*(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  const match = html.match(pattern);
  if (match?.[1] !== undefined) return match[1];

  // Reversed order: content before name
  const reversed = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${nameOrProp}["']`,
    'i'
  );
  const revMatch = html.match(reversed);
  return revMatch?.[1] !== undefined ? revMatch[1] : null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] !== undefined ? match[1].trim() : null;
}

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1] ?? ''));
    } catch {
      // Skip malformed JSON-LD
    }
  }
  return results;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /<a[^>]*href=["']([^"'#][^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1] ?? '');
  }
  return links;
}

function checkSemanticElements(html: string): SemanticElements {
  const lower = html.toLowerCase();
  return {
    hasNav: /<nav[\s>]/i.test(lower),
    hasMain: /<main[\s>]/i.test(lower),
    hasArticle: /<article[\s>]/i.test(lower),
    hasHeader: /<header[\s>]/i.test(lower),
    hasFooter: /<footer[\s>]/i.test(lower),
    hasH1: /<h1[\s>]/i.test(lower),
    headingCount: (lower.match(/<h[1-6][\s>]/gi) ?? []).length,
  };
}

/**
 * Parses HTML body from the HTTP gatherer to extract metadata,
 * JSON-LD, semantic structure, and links.
 */
export class HtmlGatherer extends BaseGatherer {
  name = 'html';

  async gather(
    _config: AXConfig,
    artifacts?: Record<string, GatherResult>
  ): Promise<HtmlGatherResult> {
    const httpResult = artifacts?.['http'] as HttpGatherResult | undefined;
    const html = httpResult?.body ?? '';

    return {
      html,
      jsonLd: extractJsonLd(html),
      metaTags: {
        title: extractTitle(html),
        description: extractMetaContent(html, 'description'),
        ogTitle: extractMetaContent(html, 'og:title'),
        ogDescription: extractMetaContent(html, 'og:description'),
        ogImage: extractMetaContent(html, 'og:image'),
        canonical: extractMetaContent(html, 'canonical'),
        robots: extractMetaContent(html, 'robots'),
      },
      semanticElements: checkSemanticElements(html),
      links: extractLinks(html),
    };
  }
}
