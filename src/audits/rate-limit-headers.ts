import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks for rate limiting headers (X-RateLimit-*, RateLimit-*).
 * Rate limit headers help AI agents self-regulate request frequency
 * and avoid being blocked.
 */
export class RateLimitHeadersAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'rate-limit-headers',
    title: 'API provides rate limit headers',
    failureTitle: 'API does not provide rate limit headers',
    description:
      'Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, RateLimit-*) ' +
      'inform AI agents about request quotas so they can throttle themselves and ' +
      'avoid being blocked by the server.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasRateLimitHeaders) {
      const headerNames = Object.keys(api.rateLimitHeaders);

      const details: AuditDetails = {
        type: 'table',
        items: headerNames.map((name) => ({
          header: name,
          value: api.rateLimitHeaders[name],
        })),
        summary: `Found ${headerNames.length} rate limit header(s): ${headerNames.join(', ')}`,
      };

      return this.pass(details);
    }

    return this.fail({
      type: 'text',
      summary:
        'No rate limit headers found. Add X-RateLimit-Limit, X-RateLimit-Remaining, ' +
        'and X-RateLimit-Reset headers to help AI agents manage request frequency.',
    });
  }
}
