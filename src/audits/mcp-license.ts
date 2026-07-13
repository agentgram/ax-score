import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that the linked repository declares a license (via the GitHub API).
 *
 * Scoring (0-1):
 *   - detectable SPDX license: 1
 *   - repository exists but no license detected: 0
 *   - no repository declared: not applicable (already penalized by
 *     mcp-repository-link / mcp-repo-exists)
 *   - non-GitHub repository or GitHub unreachable: indeterminate
 */
export class McpLicenseAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-license',
    title: 'Repository declares a license',
    failureTitle: 'Repository has no detectable license',
    description:
      'A license clarifies whether the server may be used commercially and ' +
      'redistributed. Repositories without one are legally ambiguous.',
    requiredGatherers: ['mcpRepo'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const repo = artifacts['mcpRepo'] as McpRepoGatherResult | undefined;
    if (!repo) {
      return this.indeterminate('Repository evidence unavailable.');
    }

    if (repo.provider === 'none') {
      return this.notApplicable('No repository declared in the registry record.');
    }
    if (repo.provider === 'other') {
      return this.indeterminate('Repository is not hosted on GitHub; license not verified.');
    }
    if (!repo.checked) {
      return this.indeterminate('GitHub API unavailable (network error or rate limit).');
    }
    if (repo.exists === false) {
      return this.fail({ type: 'text', summary: 'Declared repository does not exist.' });
    }

    const license = repo.license;
    if (license && license !== 'NOASSERTION') {
      return this.pass({ type: 'text', summary: `License: ${license}` });
    }

    return this.fail({ type: 'text', summary: 'No SPDX license detected on the repository.' });
  }
}
