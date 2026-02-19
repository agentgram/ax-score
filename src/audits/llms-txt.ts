import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the site exposes a `/llms.txt` file with meaningful content.
 *
 * llms.txt is a convention that helps LLM-based agents understand a site's
 * purpose, API surface, and intended use, improving discoverability.
 */
export class LlmsTxtAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'llms-txt',
    title: 'Site provides an llms.txt file',
    failureTitle: 'Site does not provide an llms.txt file',
    description:
      'An llms.txt file helps AI agents understand the site purpose and available resources. ' +
      'Providing one improves discoverability by LLM-based tools.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const llmsTxt = http.llmsTxt;

    if (!llmsTxt.found) {
      return this.fail({
        type: 'text',
        summary: 'No /llms.txt file was found at the target URL.',
      });
    }

    const content = (llmsTxt.content ?? '').trim();

    if (content.length === 0) {
      return this.partial(0.5, {
        type: 'text',
        summary: 'An /llms.txt file was found but it is empty.',
      });
    }

    return this.pass({
      type: 'text',
      summary: `Found /llms.txt with ${content.length} characters of content.`,
    });
  }
}
