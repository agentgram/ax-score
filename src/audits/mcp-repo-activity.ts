import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks how recently the repository received commits (GitHub `pushed_at`).
 *
 * Scoring (0-1):
 *   <= 30 days: 1, <= 90: 0.85, <= 180: 0.6, <= 365: 0.35, older: 0.1
 *   - no repository declared: not applicable (penalized by mcp-repo-exists)
 */
export class McpRepoActivityAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-repo-activity',
    title: 'Repository shows recent commit activity',
    failureTitle: 'Repository has been inactive for a long time',
    description:
      'Recent pushes indicate the server is maintained and will keep up with MCP ' +
      'protocol and dependency changes.',
    requiredGatherers: ['mcpRepo'],
    scoreDisplayMode: 'numeric',
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
      return this.indeterminate('Repository is not hosted on GitHub; activity not verified.');
    }
    if (!repo.checked) {
      return this.indeterminate('GitHub API unavailable (network error or rate limit).');
    }
    if (repo.exists === false) {
      return this.fail({ type: 'text', summary: 'Declared repository does not exist.' });
    }

    const days = this.daysSince(repo.pushedAt);
    if (days === null) {
      return this.indeterminate('GitHub did not report a last-push timestamp.');
    }

    const summary = `Last push was ${Math.round(days)} days ago.`;
    let score: number;
    if (days <= 30) score = 1;
    else if (days <= 90) score = 0.85;
    else if (days <= 180) score = 0.6;
    else if (days <= 365) score = 0.35;
    else score = 0.1;

    if (score >= 1) return this.pass({ type: 'text', summary });
    return this.partial(score, { type: 'text', summary });
  }
}
