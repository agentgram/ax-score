import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the declared repository exists and is not archived.
 *
 * Scoring (0-1):
 *   - exists and active: 1
 *   - exists but archived: 0.25
 *   - declared but does not exist: 0
 *   - no repository declared: 0 (unverifiable provenance)
 *   - non-GitHub host or GitHub unreachable: indeterminate
 */
export class McpRepoExistsAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-repo-exists',
    title: 'Source repository exists and is active',
    failureTitle: 'Source repository is missing, dead, or archived',
    description:
      'A live source repository is the primary provenance signal for an MCP server. ' +
      'Dead links and archived repositories indicate abandoned or untrustworthy listings.',
    requiredGatherers: ['mcpRepo'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const repo = artifacts['mcpRepo'] as McpRepoGatherResult | undefined;
    if (!repo) {
      return this.indeterminate('Repository evidence unavailable.');
    }

    if (repo.provider === 'none') {
      return this.fail({
        type: 'text',
        summary: 'No repository declared; provenance cannot be verified.',
      });
    }
    if (repo.provider === 'other') {
      return this.indeterminate('Repository is not hosted on GitHub; existence not verified.');
    }
    if (!repo.checked) {
      return this.indeterminate('GitHub API unavailable (network error or rate limit).');
    }
    if (repo.exists === false) {
      return this.fail({
        type: 'text',
        summary: `Declared repository ${repo.owner}/${repo.repo} does not exist.`,
      });
    }
    if (repo.archived === true) {
      return this.partial(0.25, {
        type: 'text',
        summary: `Repository ${repo.owner}/${repo.repo} is archived.`,
      });
    }

    return this.pass({
      type: 'text',
      summary: `Repository ${repo.owner}/${repo.repo} exists and is active.`,
    });
  }
}
