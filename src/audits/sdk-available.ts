import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks if the site mentions SDK availability.
 * SDKs (npm packages, pip packages, GitHub libraries) reduce integration friction
 * for AI agents and their developers.
 */
export class SdkAvailableAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'sdk-available',
    title: 'SDK or client library is available',
    failureTitle: 'No SDK or client library detected',
    description:
      'SDKs and client libraries (npm, pip, GitHub repos) simplify API integration ' +
      'for AI agents and developers. They provide type-safe interfaces, handle auth, ' +
      'and reduce the amount of boilerplate code needed to interact with the service.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasSdkLinks) {
      return this.pass({
        type: 'text',
        summary:
          'SDK or client library references detected (e.g., npm install, pip install, ' +
          'GitHub links, or developer portal references).',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'No SDK or client library references found. Providing SDKs (npm, pip, etc.) ' +
        'or linking to a GitHub repository lowers the barrier for AI agent integration.',
    });
  }
}
