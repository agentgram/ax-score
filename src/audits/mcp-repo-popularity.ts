import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Grades community adoption via GitHub stars.
 *
 * Scoring (0-1):
 *   >= 500: 1, >= 100: 0.8, >= 25: 0.6, >= 5: 0.4, >= 1: 0.25, 0: 0.1
 * New projects are not zeroed out — a starless repository still scores 0.1.
 */
export class McpRepoPopularityAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-repo-popularity',
    title: 'Repository has community adoption',
    failureTitle: 'Repository has little community adoption',
    description:
      'Stars are a weak but useful proxy for how many people have vetted the server. ' +
      'Low adoption is not a defect, only a caution signal.',
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
      return this.indeterminate('Repository is not hosted on GitHub; stars not available.');
    }
    if (!repo.checked) {
      return this.indeterminate('GitHub API unavailable (network error or rate limit).');
    }
    if (repo.exists === false) {
      return this.fail({ type: 'text', summary: 'Declared repository does not exist.' });
    }

    const stars = repo.stars ?? 0;
    const summary = `Repository has ${stars} stars.`;

    let score: number;
    if (stars >= 500) score = 1;
    else if (stars >= 100) score = 0.8;
    else if (stars >= 25) score = 0.6;
    else if (stars >= 5) score = 0.4;
    else if (stars >= 1) score = 0.25;
    else score = 0.1;

    if (score >= 1) return this.pass({ type: 'text', summary });
    return this.partial(score, { type: 'text', summary });
  }
}
