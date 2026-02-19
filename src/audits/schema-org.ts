import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the page contains JSON-LD Schema.org structured data.
 *
 * JSON-LD provides machine-readable metadata that helps AI agents
 * understand the type, purpose, and context of the page content.
 */
export class SchemaOrgAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'schema-org',
    title: 'Page contains JSON-LD Schema.org structured data',
    failureTitle: 'Page does not contain JSON-LD Schema.org structured data',
    description:
      'JSON-LD structured data (Schema.org) provides machine-readable context about ' +
      'the page, enabling AI agents to understand its content type and purpose.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const jsonLd = html.jsonLd;

    if (!Array.isArray(jsonLd) || jsonLd.length === 0) {
      return this.fail({
        type: 'text',
        summary: 'No JSON-LD structured data was found on the page.',
      });
    }

    // Extract @type values from each JSON-LD block for reporting
    const types: string[] = [];
    for (const block of jsonLd) {
      if (block && typeof block === 'object') {
        const record = block as Record<string, unknown>;
        const type = record['@type'];
        if (typeof type === 'string') {
          types.push(type);
        } else if (Array.isArray(type)) {
          for (const t of type) {
            if (typeof t === 'string') {
              types.push(t);
            }
          }
        }
      }
    }

    const typeSummary =
      types.length > 0
        ? ` Types found: ${types.join(', ')}.`
        : '';

    return this.pass({
      type: 'text',
      summary: `Found ${jsonLd.length} JSON-LD block(s) on the page.${typeSummary}`,
    });
  }
}
