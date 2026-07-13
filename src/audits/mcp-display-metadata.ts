import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../gatherers/mcp-registry.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Checks optional display metadata that improves listings: a human-readable
 * title and a website URL.
 *
 * Scoring (0-1): title present +0.5, valid websiteUrl +0.5.
 */
export class McpDisplayMetadataAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-display-metadata',
    title: 'Server provides display metadata (title, website)',
    failureTitle: 'Server lacks display metadata (title, website)',
    description:
      'A human-readable title and a website URL make the server presentable in ' +
      'registry UIs and easier to evaluate.',
    requiredGatherers: ['mcpRegistry'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    if (!registry?.server) {
      return this.indeterminate('Registry record unavailable.');
    }

    const title = (registry.server.title ?? '').trim();
    const websiteUrl = (registry.server.websiteUrl ?? '').trim();

    let score = 0;
    const signals: string[] = [];

    if (title.length > 0) {
      score += 0.5;
      signals.push('title');
    }
    if (websiteUrl.length > 0 && isHttpUrl(websiteUrl)) {
      score += 0.5;
      signals.push('websiteUrl');
    }

    const summary =
      signals.length > 0 ? `Present: ${signals.join(', ')}.` : 'No title or website URL declared.';

    if (score >= 1) return this.pass({ type: 'text', summary });
    if (score <= 0) return this.fail({ type: 'text', summary });
    return this.partial(score, { type: 'text', summary });
  }
}
