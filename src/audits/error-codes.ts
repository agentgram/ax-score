import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks if the API uses structured error codes.
 * Structured error responses (with code, message, and error fields) help AI agents
 * programmatically handle failures and implement retry/recovery logic.
 */
export class ErrorCodesAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'error-codes',
    title: 'API uses structured error codes',
    failureTitle: 'API lacks structured error codes',
    description:
      'Structured error codes (e.g., {"error": "...", "code": "...", "message": "..."}) ' +
      'allow AI agents to programmatically interpret failures and take corrective action ' +
      'rather than attempting to parse free-text error messages.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.errorCodeStructured) {
      return this.pass({
        type: 'text',
        summary:
          'Structured error codes detected in API specification. ' +
          'Error responses include machine-readable code and message fields.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'No structured error codes found. Define error response schemas with ' +
        '"error", "code", and "message" fields in your API specification.',
    });
  }
}
