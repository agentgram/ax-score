import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

const GITHUB_NAMESPACE_PATTERN = /^(?:io|com)\.github\.([^/]+)\//i;

/**
 * Checks that a GitHub-namespaced server name (`io.github.owner/name`)
 * points at a repository owned by the same GitHub account.
 *
 * Scoring (0-1):
 *   - namespace owner matches repository owner: 1
 *   - mismatch: 0
 *   - GitHub namespace but no repository declared: 0
 *   - custom-domain namespace: not applicable (ownership is DNS-verified by the registry)
 */
export class McpNamespaceAlignmentAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-namespace-alignment',
    title: 'Registry namespace matches the repository owner',
    failureTitle: 'Registry namespace does not match the repository owner',
    description:
      'For io.github.* servers, the namespace owner and the repository owner should be ' +
      'the same account. A mismatch means the listing ships code from a different party.',
    requiredGatherers: ['mcpRegistry', 'mcpRepo'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const repo = artifacts['mcpRepo'] as McpRepoGatherResult | undefined;

    const name = registry?.server?.name ?? '';
    if (name.length === 0) {
      return this.indeterminate('Registry record has no server name.');
    }

    const match = GITHUB_NAMESPACE_PATTERN.exec(name);
    if (!match || !match[1]) {
      return this.notApplicable(
        'Custom-domain namespace; ownership was DNS-verified by the registry at publish time.'
      );
    }

    const namespaceOwner = match[1].toLowerCase();
    const repoOwner = repo?.owner?.toLowerCase() ?? null;

    if (!repoOwner) {
      return this.fail({
        type: 'text',
        summary: `Namespace claims github.com/${namespaceOwner} but no GitHub repository is declared.`,
      });
    }

    if (repoOwner === namespaceOwner) {
      return this.pass({
        type: 'text',
        summary: `Namespace owner "${namespaceOwner}" matches the repository owner.`,
      });
    }

    return this.fail({
      type: 'text',
      summary: `Namespace owner "${namespaceOwner}" does not match repository owner "${repoOwner}".`,
    });
  }
}
