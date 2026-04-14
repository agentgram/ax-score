import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * High-value schema types for AI agent understanding.
 * Each entry awards points when present on the page.
 */
const SCHEMA_BONUS: Record<string, { label: string; points: number }> = {
  WebSite: { label: 'WebSite', points: 0.15 },
  BlogPosting: { label: 'BlogPosting', points: 0.15 },
  Article: { label: 'Article', points: 0.15 },
  Person: { label: 'Person', points: 0.1 },
  Organization: { label: 'Organization', points: 0.1 },
  BreadcrumbList: { label: 'BreadcrumbList', points: 0.1 },
  FAQPage: { label: 'FAQPage', points: 0.1 },
  HowTo: { label: 'HowTo', points: 0.05 },
  WebPage: { label: 'WebPage', points: 0.05 },
};

/**
 * Checks for JSON-LD structured data and analyses schema types.
 * Now produces a numeric score based on the richness and variety of schema types.
 */
export class JsonLdAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'json-ld',
    title: 'Page has rich JSON-LD structured data',
    failureTitle: 'Page is missing JSON-LD structured data',
    description:
      'JSON-LD provides machine-readable structured data that helps AI agents ' +
      'understand page content, entities, and relationships without parsing HTML. ' +
      'Rich schema types (WebSite, Article, Person, BreadcrumbList, FAQPage) ' +
      'significantly improve AI discoverability.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const jsonLdBlocks = html.jsonLd;

    if (jsonLdBlocks.length === 0) {
      return this.fail({
        type: 'text',
        summary:
          'No JSON-LD structured data found. Add <script type="application/ld+json"> ' +
          'blocks to help AI agents parse your content.',
      });
    }

    // Extract all @type values, handling @graph arrays and type arrays
    const allTypes = new Set<string>();
    for (const block of jsonLdBlocks) {
      if (typeof block !== 'object' || block === null) continue;
      this.extractTypes(block as Record<string, unknown>, allTypes);
    }

    // Calculate score: base for having any JSON-LD, bonus for valuable types
    let score = 0.15; // base for having any JSON-LD at all
    const foundTypes: { type: string; points: number }[] = [];

    for (const type of allTypes) {
      const bonus = SCHEMA_BONUS[type];
      if (bonus) {
        score += bonus.points;
        foundTypes.push({ type: bonus.label, points: bonus.points });
      }
    }

    // Bonus for having multiple blocks
    if (jsonLdBlocks.length >= 3) {
      score += 0.05;
    }

    score = Math.min(1, score);

    const typesList = [...allTypes].join(', ') || 'unknown';

    const details: AuditDetails = {
      type: 'table',
      items: [
        {
          blockCount: jsonLdBlocks.length,
          types: typesList,
          valuableTypes: foundTypes.map((t) => t.type).join(', ') || 'none',
        },
      ],
      summary: `Found ${jsonLdBlocks.length} JSON-LD block(s) with ${allTypes.size} type(s): ${typesList}`,
    };

    if (score >= 1) {
      return this.pass(details);
    }

    if (score <= 0) {
      return this.fail(details);
    }

    return this.partial(score, details);
  }

  /**
   * Recursively extract @type values from JSON-LD, handling @graph arrays.
   */
  private extractTypes(obj: Record<string, unknown>, out: Set<string>): void {
    const type = obj['@type'];
    if (typeof type === 'string') {
      out.add(type);
    } else if (Array.isArray(type)) {
      for (const t of type) {
        if (typeof t === 'string') out.add(t);
      }
    }

    // Recurse into @graph
    const graph = obj['@graph'];
    if (Array.isArray(graph)) {
      for (const item of graph) {
        if (typeof item === 'object' && item !== null) {
          this.extractTypes(item as Record<string, unknown>, out);
        }
      }
    }
  }
}
