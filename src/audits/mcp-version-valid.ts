import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:[-+].*)?$/;

/**
 * Checks that the registry record declares a semantic version.
 *
 * Scoring (0-1):
 *   - missing version: 0
 *   - version present but not semver-shaped: 0.5
 *   - semver version: 1
 */
export class McpVersionValidAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-version-valid',
    title: 'Server declares a semantic version',
    failureTitle: 'Server version is missing or not semver',
    description:
      'A semantic version (MAJOR.MINOR.PATCH) lets clients and registries reason ' +
      'about upgrades and compatibility.',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const version = (registry.server.version ?? '').trim();
    if (version.length === 0) {
      return this.fail({ type: 'text', summary: 'No version in the registry record.' });
    }

    if (!SEMVER_PATTERN.test(version)) {
      return this.partial(0.5, {
        type: 'text',
        summary: `Version "${version}" is not semver-shaped (MAJOR.MINOR.PATCH).`,
      });
    }

    return this.pass({ type: 'text', summary: `Version: ${version}` });
  }
}
