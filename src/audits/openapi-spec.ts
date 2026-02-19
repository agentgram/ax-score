import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the site exposes an OpenAPI specification at `/openapi.json`.
 *
 * A valid OpenAPI spec enables AI agents to programmatically discover
 * and interact with the site's API endpoints.
 */
export class OpenapiSpecAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'openapi-spec',
    title: 'Site provides an OpenAPI specification',
    failureTitle: 'Site does not provide an OpenAPI specification',
    description:
      'An OpenAPI specification allows AI agents to discover and understand ' +
      'API endpoints programmatically, enabling automated integration.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const openapiSpec = http.openapiSpec;

    if (!openapiSpec.found) {
      return this.fail({
        type: 'text',
        summary: 'No /openapi.json file was found at the target URL.',
      });
    }

    const content = (openapiSpec.content ?? '').trim();

    if (content.length === 0) {
      return this.partial(0.5, {
        type: 'text',
        summary: 'An /openapi.json file was found but it is empty.',
      });
    }

    // Validate that it is parseable JSON
    try {
      JSON.parse(content);
    } catch {
      return this.partial(0.3, {
        type: 'text',
        summary: 'An /openapi.json file was found but it contains invalid JSON.',
      });
    }

    return this.pass({
      type: 'text',
      summary: 'Found a valid JSON file at /openapi.json.',
    });
  }
}
