import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks if the page contains valid JSON-LD structured data.
 * JSON-LD helps AI agents understand page content and entity relationships.
 */
export class JsonLdAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'json-ld',
    title: 'Page has JSON-LD structured data',
    failureTitle: 'Page is missing JSON-LD structured data',
    description:
      'JSON-LD provides machine-readable structured data that helps AI agents ' +
      'understand page content, entities, and relationships without parsing HTML.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const jsonLdBlocks = html.jsonLd;

    if (jsonLdBlocks.length > 0) {
      const types = jsonLdBlocks
        .filter(
          (block): block is Record<string, unknown> =>
            typeof block === 'object' && block !== null
        )
        .map((block) => block['@type'] as string | undefined)
        .filter(Boolean);

      const details: AuditDetails = {
        type: 'table',
        items: [
          {
            blockCount: jsonLdBlocks.length,
            types: types.join(', ') || 'unknown',
          },
        ],
        summary: `Found ${jsonLdBlocks.length} JSON-LD block(s)`,
      };

      return this.pass(details);
    }

    return this.fail({
      type: 'text',
      summary:
        'No JSON-LD structured data found. Add <script type="application/ld+json"> ' +
        'blocks to help AI agents parse your content.',
    });
  }
}
