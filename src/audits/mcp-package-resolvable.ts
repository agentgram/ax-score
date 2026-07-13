import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpPackageGatherResult } from '../gatherers/mcp-package.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the packages declared in the registry actually exist on their
 * package registries (npm / PyPI).
 *
 * Scoring (0-1): fraction of verifiable packages that resolve.
 *   - no packages declared: not applicable (remote-only server)
 *   - only unverifiable registries (oci, mcpb, ...): indeterminate
 *   - registries unreachable: indeterminate
 */
export class McpPackageResolvableAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-package-resolvable',
    title: 'Declared packages resolve on their registries',
    failureTitle: 'Declared packages do not resolve on their registries',
    description:
      'Every npm/PyPI package listed in the registry record must actually exist, ' +
      'otherwise the server cannot be installed as documented.',
    requiredGatherers: ['mcpPackage'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const pkg = artifacts['mcpPackage'] as McpPackageGatherResult | undefined;
    const probes = pkg?.packages ?? [];

    if (probes.length === 0) {
      return this.notApplicable('No packages declared (remote-only server).');
    }

    const supported = probes.filter((p) => p.supported);
    if (supported.length === 0) {
      const types = [...new Set(probes.map((p) => p.registryType))].join(', ');
      return this.indeterminate(
        `Only unverifiable package registries declared (${types}).`
      );
    }

    const checked = supported.filter((p) => p.checked);
    if (checked.length === 0) {
      return this.indeterminate('Package registries were unreachable.');
    }

    const resolvable = checked.filter((p) => p.exists === true);
    const score = resolvable.length / checked.length;
    const items = checked.map((p) => ({
      registry: p.registryType,
      identifier: p.identifier,
      exists: p.exists === true,
    }));
    const summary = `${resolvable.length}/${checked.length} verifiable packages resolve.`;

    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
