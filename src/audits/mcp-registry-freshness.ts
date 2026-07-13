import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks the registry record itself: active status and recent updates.
 *
 * Scoring (0-1):
 *   - status is not 'active' (deprecated/deleted): 0
 *   - active, updated <= 180 days ago: 1; <= 365: 0.7; <= 730: 0.4; older: 0.2
 *   - active but no timestamps: 0.5
 */
export class McpRegistryFreshnessAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-registry-freshness',
    title: 'Registry record is active and recently updated',
    failureTitle: 'Registry record is stale or inactive',
    description:
      'An active, recently updated registry record signals that the publisher still ' +
      'maintains the listing. Deprecated or abandoned records should not be installed.',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const meta = registry.meta;
    if (!meta) {
      return this.indeterminate('Registry record has no official metadata.');
    }

    if (meta.status && meta.status !== 'active') {
      return this.fail({
        type: 'text',
        summary: `Registry status is "${meta.status}".`,
      });
    }

    const days = this.daysSince(meta.updatedAt ?? meta.publishedAt ?? null);
    if (days === null) {
      return this.partial(0.5, {
        type: 'text',
        summary: 'Registry record is active but carries no update timestamp.',
      });
    }

    const summary = `Registry record last updated ${Math.round(days)} days ago.`;
    let score: number;
    if (days <= 180) score = 1;
    else if (days <= 365) score = 0.7;
    else if (days <= 730) score = 0.4;
    else score = 0.2;

    if (score >= 1) return this.pass({ type: 'text', summary });
    return this.partial(score, { type: 'text', summary });
  }
}
