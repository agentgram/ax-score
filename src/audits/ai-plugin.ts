import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the site exposes an AI plugin manifest at
 * `/.well-known/ai-plugin.json`.
 *
 * The ai-plugin.json manifest is the OpenAI ChatGPT plugin standard
 * and enables AI platforms to discover and integrate with the site.
 */
export class AiPluginAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'ai-plugin',
    title: 'Site provides an ai-plugin.json manifest',
    failureTitle: 'Site does not provide an ai-plugin.json manifest',
    description:
      'An ai-plugin.json manifest at /.well-known/ai-plugin.json enables AI platforms ' +
      '(such as ChatGPT plugins) to discover and interact with the site.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const aiPlugin = http.aiPlugin;

    if (!aiPlugin.found) {
      return this.fail({
        type: 'text',
        summary: 'No /.well-known/ai-plugin.json file was found at the target URL.',
      });
    }

    const content = (aiPlugin.content ?? '').trim();

    if (content.length === 0) {
      return this.fail({
        type: 'text',
        summary: 'An ai-plugin.json file was found but it is empty.',
      });
    }

    // Validate that it is parseable JSON
    try {
      const manifest = JSON.parse(content) as Record<string, unknown>;

      // Basic structural validation: check for expected fields
      const hasRequiredFields =
        typeof manifest.schema_version === 'string' &&
        typeof manifest.name_for_human === 'string' &&
        typeof manifest.name_for_model === 'string';

      if (!hasRequiredFields) {
        return this.partial(0.5, {
          type: 'text',
          summary:
            'An ai-plugin.json file was found with valid JSON, but it is missing ' +
            'expected fields (schema_version, name_for_human, name_for_model).',
        });
      }

      return this.pass({
        type: 'text',
        summary: `Found a valid ai-plugin.json manifest for "${String(manifest.name_for_human)}".`,
      });
    } catch {
      return this.fail({
        type: 'text',
        summary: 'An ai-plugin.json file was found but it contains invalid JSON.',
      });
    }
  }
}
