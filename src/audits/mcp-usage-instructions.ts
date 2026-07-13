import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRepoGatherResult } from '../gatherers/mcp-repo.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

const CONFIG_SNIPPET_PATTERN = /mcpservers|claude_desktop_config|"command"\s*:/i;
const INSTALL_COMMAND_PATTERN =
  /\bnpx\s+|\buvx\s+|\bdocker\s+(run|pull)\b|\bpip\s+install\b|\bnpm\s+install\b|\bpnpm\s+add\b|\buv\s+tool\s+install\b/i;
const SECTION_HEADING_PATTERN =
  /^#{1,6}\s*.*\b(usage|installation|install|getting started|quick\s?start|setup|configuration)\b/im;

/**
 * Looks for actionable setup instructions inside the README.
 *
 * Scoring (0-1):
 *   - MCP client config snippet (mcpServers / claude_desktop_config): +0.5
 *   - install/run command (npx, uvx, docker run, pip install, ...): +0.3
 *   - usage/installation section heading: +0.2
 */
export class McpUsageInstructionsAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-usage-instructions',
    title: 'README contains actionable setup instructions',
    failureTitle: 'README lacks setup instructions',
    description:
      'A copy-pasteable client configuration block and an install command are what turn ' +
      'a listing into a working server. Document both in the README.',
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
        summary: 'No repository declared; no setup instructions are discoverable.',
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

    const content = repo.readme.content ?? '';
    if (repo.readme.exists === false || content.length === 0) {
      return this.fail({ type: 'text', summary: 'No README content to inspect.' });
    }

    let score = 0;
    const signals: string[] = [];

    if (CONFIG_SNIPPET_PATTERN.test(content)) {
      score += 0.5;
      signals.push('MCP client config snippet');
    }
    if (INSTALL_COMMAND_PATTERN.test(content)) {
      score += 0.3;
      signals.push('install/run command');
    }
    if (SECTION_HEADING_PATTERN.test(content)) {
      score += 0.2;
      signals.push('usage/installation section');
    }

    score = Math.min(1, score);

    const details: AuditDetails = {
      type: 'list',
      items: signals.map((s) => ({ signal: s })),
      summary:
        signals.length > 0
          ? `Detected: ${signals.join(', ')}.`
          : 'No setup instructions detected in the README.',
    };

    if (score >= 1) return this.pass(details);
    if (score <= 0) return this.fail(details);
    return this.partial(score, details);
  }
}
