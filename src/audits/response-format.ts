import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the API uses a JSON content type in its responses.
 *
 * AI agents work best with structured data formats. JSON content types
 * indicate the API is designed for programmatic consumption.
 */
export class ResponseFormatAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'response-format',
    title: 'API responses use JSON content type',
    failureTitle: 'API responses do not use JSON content type',
    description:
      'APIs that respond with a JSON content type (application/json) are easier ' +
      'for AI agents to parse and consume programmatically.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasJsonContentType) {
      return this.pass({
        type: 'text',
        summary: 'The API returns responses with a JSON-compatible content type.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'The API does not return a JSON content type header. ' +
        'AI agents rely on structured JSON responses for reliable parsing.',
    });
  }
}
