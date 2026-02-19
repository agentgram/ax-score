import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the OpenAPI specification contains example responses.
 *
 * Example responses in the OpenAPI spec help AI agents understand the
 * expected data shapes, enabling better code generation and integration.
 */
export class ResponseExamplesAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'response-examples',
    title: 'OpenAPI spec contains response examples',
    failureTitle: 'OpenAPI spec does not contain response examples',
    description:
      'Response examples in the OpenAPI specification help AI agents understand ' +
      'expected data shapes, improving automated code generation and integration accuracy.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (!api.hasOpenApi) {
      return this.fail({
        type: 'text',
        summary:
          'No OpenAPI specification was found, so response examples cannot be evaluated.',
      });
    }

    if (api.hasExamples) {
      return this.pass({
        type: 'text',
        summary: 'The OpenAPI specification includes response examples.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'The OpenAPI specification does not include response examples. ' +
        'Adding "example" or "examples" fields helps AI agents understand expected data shapes.',
    });
  }
}
