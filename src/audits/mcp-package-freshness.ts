import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpPackageGatherResult } from '../gatherers/mcp-package.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks how recently the declared packages were published.
 *
 * Scoring (0-1) based on the most recent publish across resolvable packages:
 *   <= 90 days: 1, <= 180: 0.75, <= 365: 0.5, <= 730: 0.25, older: 0.1
 */
export class McpPackageFreshnessAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-package-freshness',
    title: 'Packages were published recently',
    failureTitle: 'Packages have not been published in a long time',
    description:
      'MCP is a fast-moving protocol; packages that have not been published in over ' +
      'a year are likely to lag behind spec and SDK changes.',
    requiredGatherers: ['mcpPackage'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const pkg = artifacts['mcpPackage'] as McpPackageGatherResult | undefined;
    const probes = pkg?.packages ?? [];

    if (probes.length === 0) {
      return this.notApplicable('No packages declared (remote-only server).');
    }

    const dates = probes
      .filter((p) => p.checked && p.exists === true)
      .map((p) => this.daysSince(p.latestPublishedAt))
      .filter((d): d is number => d !== null);

    if (dates.length === 0) {
      const anyChecked = probes.some((p) => p.checked && p.exists === true);
      if (!anyChecked) {
        return this.indeterminate('No resolvable package to measure freshness on.');
      }
      return this.indeterminate('Package registries did not report publish dates.');
    }

    const newestDays = Math.min(...dates);
    const summary = `Most recent package publish was ${Math.round(newestDays)} days ago.`;

    let score: number;
    if (newestDays <= 90) score = 1;
    else if (newestDays <= 180) score = 0.75;
    else if (newestDays <= 365) score = 0.5;
    else if (newestDays <= 730) score = 0.25;
    else score = 0.1;

    if (score >= 1) return this.pass({ type: 'text', summary });
    return this.partial(score, { type: 'text', summary });
  }
}
