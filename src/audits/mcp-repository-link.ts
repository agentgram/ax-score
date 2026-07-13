import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the registry record links to a source repository.
 *
 * Scoring (0-1):
 *   - no repository URL: 0
 *   - URL present but not a valid https URL: 0.4
 *   - valid https repository URL: 1
 */
export class McpRepositoryLinkAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-repository-link',
    title: 'Registry record links to a source repository',
    failureTitle: 'Registry record has no source repository link',
    description:
      'A repository link lets consumers inspect the code behind the server before ' +
      'granting it tool access. Records without one are much harder to trust.',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const url = (registry.server.repository?.url ?? '').trim();
    if (url.length === 0) {
      return this.fail({ type: 'text', summary: 'No repository URL in the registry record.' });
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return this.partial(0.4, {
          type: 'text',
          summary: `Repository URL uses ${parsed.protocol.replace(':', '')} instead of https.`,
        });
      }
    } catch {
      return this.partial(0.4, {
        type: 'text',
        summary: `Repository URL is not a valid URL: ${url}`,
      });
    }

    return this.pass({ type: 'text', summary: `Repository: ${url}` });
  }
}
