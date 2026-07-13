import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRemoteGatherResult } from '../gatherers/mcp-remote.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that declared remote endpoints respond at all.
 *
 * Scoring (0-1): average per remote —
 *   - HTTP response with status < 500 (including 401/405/406 auth or method
 *     rejections, which prove the endpoint is alive): 1
 *   - HTTP 5xx: 0.4
 *   - no response (DNS failure, timeout, refused): 0
 *   - no remotes declared: not applicable (package-only server)
 */
export class McpRemoteReachableAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-remote-reachable',
    title: 'Remote endpoints are reachable',
    failureTitle: 'Remote endpoints are unreachable',
    description:
      'A hosted MCP server whose declared endpoint does not answer cannot be used at all. ' +
      'Auth challenges count as reachable; only dead endpoints fail.',
    requiredGatherers: ['mcpRemote'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const remote = artifacts['mcpRemote'] as McpRemoteGatherResult | undefined;
    const probes = remote?.remotes ?? [];

    if (probes.length === 0) {
      return this.notApplicable('No remote endpoints declared (package-only server).');
    }

    let total = 0;
    const items = probes.map((probe) => {
      let value = 0;
      if (probe.reachable && probe.statusCode !== null && probe.statusCode < 500) value = 1;
      else if (probe.reachable) value = 0.4;
      total += value;
      return {
        url: probe.url,
        reachable: probe.reachable,
        statusCode: probe.statusCode,
      };
    });

    const score = total / probes.length;
    const reachableCount = probes.filter((p) => p.reachable).length;
    const summary = `${reachableCount}/${probes.length} remote endpoints responded.`;

    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
