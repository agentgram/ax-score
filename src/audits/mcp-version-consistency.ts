import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpPackageGatherResult } from '../gatherers/mcp-package.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the package versions declared in the registry record were
 * actually published on the package registries.
 *
 * Scoring (0-1): fraction of verifiable declared versions that exist.
 */
export class McpVersionConsistencyAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-version-consistency',
    title: 'Registry versions match published package versions',
    failureTitle: 'Registry versions were never published to the package registry',
    description:
      'The version pinned in the registry record must exist on the package registry, ' +
      'otherwise installs resolve to a different artifact than the one that was reviewed.',
    requiredGatherers: ['mcpPackage'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const pkg = artifacts['mcpPackage'] as McpPackageGatherResult | undefined;
    const probes = pkg?.packages ?? [];

    if (probes.length === 0) {
      return this.notApplicable('No packages declared (remote-only server).');
    }

    const comparable = probes.filter(
      (p) => p.checked && p.exists === true && p.declaredVersionPublished !== null
    );

    if (comparable.length === 0) {
      const declaresVersions = probes.some((p) => p.declaredVersion !== null && p.supported);
      if (!declaresVersions) {
        return this.notApplicable('No verifiable package declares a pinned version.');
      }
      return this.indeterminate('Could not verify declared versions against package registries.');
    }

    const matching = comparable.filter((p) => p.declaredVersionPublished === true);
    const score = matching.length / comparable.length;
    const items = comparable.map((p) => ({
      registry: p.registryType,
      identifier: p.identifier,
      declaredVersion: p.declaredVersion,
      published: p.declaredVersionPublished === true,
    }));
    const summary = `${matching.length}/${comparable.length} declared versions are published.`;

    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
