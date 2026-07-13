import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

const SUBSTANTIAL_README_BYTES = 500;

/**
 * Checks that the repository ships a README of meaningful size.
 *
 * Scoring (0-1):
 *   - README >= 500 bytes: 1
 *   - README exists but is tiny: 0.5
 *   - no README, or no repository/dead repository (nowhere to document): 0
 *   - GitHub unreachable or non-GitHub host: indeterminate
 */
export class McpReadmeExistsAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-readme-exists',
    title: 'Repository has a substantial README',
    failureTitle: 'Repository has no usable README',
    description:
      'The README is where agents and humans learn what the server does and how to ' +
      'run it. A server without one is effectively undocumented.',
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
        summary: 'No repository declared; no documentation is discoverable.',
      });
    }
    if (repo.provider === 'other') {
      return this.indeterminate('Repository is not hosted on GitHub; README not verified.');
    }
    if (!repo.checked) {
      return this.indeterminate('GitHub API unavailable (network error or rate limit).');
    }
    if (repo.exists === false) {
      return this.fail({ type: 'text', summary: 'Declared repository does not exist.' });
    }
    if (!repo.readme.checked) {
      return this.indeterminate('README lookup failed (network error or rate limit).');
    }
    if (repo.readme.exists === false) {
      return this.fail({ type: 'text', summary: 'Repository has no README.' });
    }

    const size = repo.readme.size ?? 0;
    if (size >= SUBSTANTIAL_README_BYTES) {
      return this.pass({ type: 'text', summary: `README present (${size} bytes).` });
    }

    return this.partial(0.5, {
      type: 'text',
      summary: `README present but tiny (${size} bytes).`,
    });
  }
}
