import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

const AI_USER_AGENTS = ['GPTBot', 'anthropic', 'Google-Extended', 'CCBot'];

/**
 * Checks whether robots.txt contains AI-friendly directives.
 *
 * Sites that explicitly allow (or at least do not block) common AI user agents
 * are more discoverable and accessible to AI-powered tools and agents.
 */
export class RobotsAiAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'robots-ai',
    title: 'robots.txt is AI-friendly',
    failureTitle: 'robots.txt blocks AI agents',
    description:
      'A robots.txt file that does not block common AI user agents ' +
      '(GPTBot, Anthropic, Google-Extended, CCBot) allows AI agents to crawl and index the site.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const robotsTxt = http.robotsTxt;

    if (!robotsTxt.found || !robotsTxt.content) {
      return this.fail({
        type: 'text',
        summary: 'No robots.txt file was found. AI agents cannot determine crawl permissions.',
      });
    }

    const content = robotsTxt.content.toLowerCase();
    const lines = content.split('\n').map((line) => line.trim());

    const blockedAgents: string[] = [];
    const allowedAgents: string[] = [];

    for (const agent of AI_USER_AGENTS) {
      if (this.isAgentBlocked(lines, agent.toLowerCase())) {
        blockedAgents.push(agent);
      } else {
        allowedAgents.push(agent);
      }
    }

    const totalAgents = AI_USER_AGENTS.length;
    const allowedCount = allowedAgents.length;

    if (allowedCount === totalAgents) {
      return this.pass({
        type: 'table',
        summary: 'robots.txt does not block any common AI user agents.',
        items: allowedAgents.map((agent) => ({ agent, status: 'allowed' })),
      });
    }

    if (allowedCount === 0) {
      return this.fail({
        type: 'table',
        summary: 'robots.txt blocks all common AI user agents.',
        items: blockedAgents.map((agent) => ({ agent, status: 'blocked' })),
      });
    }

    const score = allowedCount / totalAgents;
    return this.partial(score, {
      type: 'table',
      summary: `robots.txt blocks ${blockedAgents.length} of ${totalAgents} common AI user agents.`,
      items: [
        ...blockedAgents.map((agent) => ({ agent, status: 'blocked' })),
        ...allowedAgents.map((agent) => ({ agent, status: 'allowed' })),
      ],
    });
  }

  /**
   * Determines if a specific user agent is blocked by the robots.txt rules.
   *
   * Checks for agent-specific disallow directives as well as wildcard blocks.
   */
  private isAgentBlocked(lines: string[], agent: string): boolean {
    let inAgentBlock = false;
    let inWildcardBlock = false;
    let agentHasDisallow = false;
    let wildcardDisallowAll = false;

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.length === 0) {
        continue;
      }

      if (line.startsWith('user-agent:')) {
        const ua = line.replace('user-agent:', '').trim();
        inAgentBlock = ua === agent;
        inWildcardBlock = ua === '*';
        continue;
      }

      if (inAgentBlock && line.startsWith('disallow:')) {
        const path = line.replace('disallow:', '').trim();
        if (path === '/' || path === '/*') {
          agentHasDisallow = true;
        }
      }

      if (inWildcardBlock && line.startsWith('disallow:')) {
        const path = line.replace('disallow:', '').trim();
        if (path === '/' || path === '/*') {
          wildcardDisallowAll = true;
        }
      }
    }

    // Agent is blocked if it has a specific disallow or is caught by the wildcard block
    // (but only if no agent-specific block exists to override)
    return agentHasDisallow || wildcardDisallowAll;
  }
}
