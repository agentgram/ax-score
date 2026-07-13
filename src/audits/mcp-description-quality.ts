import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the registry record carries a meaningful description.
 *
 * Scoring (0-1):
 *   - missing/empty: 0
 *   - shorter than 30 chars: 0.3
 *   - shorter than 80 chars: 0.7
 *   - 80+ chars: 1
 */
export class McpDescriptionQualityAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-description-quality',
    title: 'Server has a meaningful description',
    failureTitle: 'Server description is missing or too thin',
    description:
      'A clear registry description is the first signal agents and humans use to decide ' +
      'whether a server fits their task. Aim for at least one full sentence (80+ characters).',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const description = (registry.server.description ?? '').trim();

    if (description.length === 0) {
      return this.fail({ type: 'text', summary: 'No description in the registry record.' });
    }
    if (description.length < 30) {
      return this.partial(0.3, {
        type: 'text',
        summary: `Description is only ${description.length} characters long.`,
      });
    }
    if (description.length < 80) {
      return this.partial(0.7, {
        type: 'text',
        summary: `Description is ${description.length} characters long; consider a fuller sentence.`,
      });
    }

    return this.pass({
      type: 'text',
      summary: `Description present (${description.length} characters).`,
    });
  }
}
