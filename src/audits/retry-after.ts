import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks for Retry-After header support.
 * The Retry-After header tells AI agents exactly when to retry after being
 * rate-limited, enabling graceful backoff without guesswork.
 */
export class RetryAfterAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'retry-after',
    title: 'API supports Retry-After header',
    failureTitle: 'API does not support Retry-After header',
    description:
      'The Retry-After header (RFC 7231) tells AI agents when to retry after receiving ' +
      'a 429 or 503 response. Without it, agents must guess retry timing, leading to ' +
      'either excessive retries or unnecessary delays.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasRetryAfter) {
      return this.pass({
        type: 'text',
        summary:
          'Retry-After header support detected. AI agents can implement precise ' +
          'backoff timing when rate-limited.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'No Retry-After header support found. Include a Retry-After header in 429 ' +
        'and 503 responses so AI agents know exactly when to retry.',
    });
  }
}
