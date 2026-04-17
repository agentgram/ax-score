import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks for RSS/Atom content feed availability.
 * Content feeds help AI agents discover and syndicate site content.
 *
 * Detection methods:
 * 1. HTML <link rel="alternate" type="application/rss+xml|atom+xml"> tags
 * 2. Common feed URLs: /rss.xml, /feed.xml, /atom.xml, /feed/, /index.xml
 */
export class ContentFeedAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'content-feed',
    title: 'Site provides a content feed (RSS/Atom)',
    failureTitle: 'Site does not provide a content feed',
    description:
      'RSS and Atom feeds provide machine-readable content syndication that helps ' +
      'AI agents discover and track site updates. Feeds are especially important ' +
      'for content-focused sites (blogs, news, documentation).',
    requiredGatherers: ['http', 'html'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const http = artifacts['http'] as HttpGatherResult;

    // Check HTML <link> tags for feed references
    const feedLinks = html.feedLinks ?? [];

    // Also check body for feed URL patterns (common in auto-discovery)
    const body = http.body ?? '';
    const bodyFeeds = this.detectBodyFeedLinks(body);

    // Combine all detected feeds
    const allFeeds = [...feedLinks, ...bodyFeeds];
    const uniqueFeedUrls = new Set(allFeeds.map((f) => f.href));

    if (uniqueFeedUrls.size === 0) {
      return this.fail({
        type: 'text',
        summary:
          'No RSS or Atom feed detected. Add a feed (RSS or Atom) to help AI agents ' +
          'discover and track your content updates.',
      });
    }

    const score = Math.min(1, uniqueFeedUrls.size * 0.5 + 0.5);

    const details: AuditDetails = {
      type: 'table',
      items: allFeeds.map((f) => ({
        type: f.type || 'unknown',
        href: f.href,
        title: f.title || '-',
      })),
      summary: `Found ${uniqueFeedUrls.size} content feed(s): ${[...uniqueFeedUrls].join(', ')}`,
    };

    if (score >= 1) {
      return this.pass(details);
    }

    return this.partial(score, details);
  }

  /**
   * Detect feed URLs from the HTML body (auto-discovery patterns).
   */
  private detectBodyFeedLinks(body: string): { type: string; href: string; title: string | null }[] {
    const feeds: { type: string; href: string; title: string | null }[] = [];
    const seen = new Set<string>();

    // Check for common feed link patterns in the body
    const linkRegex = /<link[^>]*rel=["']alternate["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(body)) !== null) {
      const tag = match[0];
      const typeMatch = tag.match(/type=["']([^"']*)["']/i);
      if (typeMatch && (typeMatch[1]?.includes('rss') || typeMatch[1]?.includes('atom') || typeMatch[1]?.includes('feed'))) {
        const hrefMatch = tag.match(/href=["']([^"']*)["']/i);
        const titleMatch = tag.match(/title=["']([^"']*)["']/i);
        const href = hrefMatch?.[1] ?? '';
        if (href && !seen.has(href)) {
          seen.add(href);
          feeds.push({
            type: typeMatch[1] as string,
            href,
            title: titleMatch?.[1] ?? null,
          });
        }
      }
    }

    return feeds;
  }
}
