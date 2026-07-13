import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRemoteGatherResult } from '../gatherers/mcp-remote.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that all declared remote endpoints use HTTPS.
 *
 * Scoring (0-1): fraction of remotes served over HTTPS.
 *   - no remotes declared: not applicable
 */
export class McpRemoteTlsAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-remote-tls',
    title: 'Remote endpoints use HTTPS',
    failureTitle: 'Remote endpoints are served without TLS',
    description:
      'MCP sessions routinely carry credentials and private data. Every remote ' +
      'endpoint must be served over HTTPS.',
    requiredGatherers: ['mcpRemote'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const remote = artifacts['mcpRemote'] as McpRemoteGatherResult | undefined;
    const probes = remote?.remotes ?? [];

    if (probes.length === 0) {
      return this.notApplicable('No remote endpoints declared (package-only server).');
    }

    const secure = probes.filter((p) => p.https);
    const score = secure.length / probes.length;
    const items = probes.map((p) => ({ url: p.url, https: p.https }));
    const summary = `${secure.length}/${probes.length} remote endpoints use HTTPS.`;

    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
