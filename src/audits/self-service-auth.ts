import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks if the site offers self-service authentication endpoints.
 * AI agents need programmatic auth (OAuth, API keys, tokens) to access services
 * without human intervention.
 */
export class SelfServiceAuthAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'self-service-auth',
    title: 'Site provides self-service authentication',
    failureTitle: 'Site lacks self-service authentication endpoints',
    description:
      'Self-service authentication (OAuth, API keys, token endpoints) allows AI agents ' +
      'to programmatically authenticate without requiring human-in-the-loop setup.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasAuthEndpoint) {
      return this.pass({
        type: 'text',
        summary:
          'Self-service authentication endpoints detected (e.g., /auth, /oauth, ' +
          '/api/token, or securitySchemes in OpenAPI spec).',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'No self-service authentication endpoints found. Provide OAuth, API key, ' +
        'or token-based auth so AI agents can authenticate programmatically.',
    });
  }
}
