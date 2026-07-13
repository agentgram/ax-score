import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

const NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z0-9.-]+\/[A-Za-z0-9._-]+$/i;

/**
 * Structural sanity checks on the server record itself.
 *
 * Checks (score = passed / total):
 *   1. name follows the `dns.namespace/server-name` convention
 *   2. record declares at least one installation path (packages or remotes)
 *   3. every package has a registryType and identifier
 *   4. every remote has a URL
 */
export class McpServerRecordValidAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-server-record-valid',
    title: 'Server record is well-formed',
    failureTitle: 'Server record is malformed',
    description:
      'Clients rely on the structure of the registry record to install the server. ' +
      'Missing identifiers or empty installation paths break tooling.',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const server = registry.server;
    const packages = server.packages ?? [];
    const remotes = server.remotes ?? [];

    const checks: Array<{ check: string; passed: boolean }> = [
      {
        check: 'name follows dns.namespace/server-name',
        passed: NAME_PATTERN.test(server.name ?? ''),
      },
      {
        check: 'declares at least one package or remote',
        passed: packages.length > 0 || remotes.length > 0,
      },
      {
        check: 'every package has registryType and identifier',
        passed: packages.every(
          (p) => (p.registryType ?? '').length > 0 && (p.identifier ?? '').length > 0
        ),
      },
      {
        check: 'every remote has a URL',
        passed: remotes.every((r) => (r.url ?? '').length > 0),
      },
    ];

    const passed = checks.filter((c) => c.passed).length;
    const score = passed / checks.length;
    const items = checks.map((c) => ({ check: c.check, passed: c.passed }));
    const summary = `${passed}/${checks.length} structural checks passed.`;

    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
