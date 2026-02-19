import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Validates the structural completeness of the OpenAPI specification.
 *
 * A structurally valid OpenAPI spec must contain a version field
 * (`openapi` or `swagger`), an `info` object, and a `paths` object.
 */
export class OpenapiValidAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'openapi-valid',
    title: 'OpenAPI specification is structurally valid',
    failureTitle: 'OpenAPI specification is missing or structurally invalid',
    description:
      'A structurally valid OpenAPI specification should contain a version field ' +
      '(openapi or swagger), an info object, and a paths object with at least one endpoint.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const openapiSpec = http.openapiSpec;

    if (!openapiSpec.found || !openapiSpec.content) {
      return this.fail({
        type: 'text',
        summary: 'No OpenAPI specification was found to validate.',
      });
    }

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(openapiSpec.content) as Record<string, unknown>;
    } catch {
      return this.fail({
        type: 'text',
        summary: 'The OpenAPI specification contains invalid JSON and cannot be parsed.',
      });
    }

    // Check three structural requirements
    const checks = {
      hasVersion: typeof spec.openapi === 'string' || typeof spec.swagger === 'string',
      hasInfo: spec.info !== null && typeof spec.info === 'object',
      hasPaths: spec.paths !== null && typeof spec.paths === 'object',
    };

    const passed = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;

    if (passed === total) {
      const version = (spec.openapi ?? spec.swagger) as string;
      const pathCount = Object.keys(spec.paths as Record<string, unknown>).length;
      return this.pass({
        type: 'table',
        summary: `OpenAPI spec is structurally valid (version: ${version}, ${pathCount} path(s)).`,
        items: [
          { check: 'Version field', result: 'present', value: version },
          { check: 'Info object', result: 'present' },
          { check: 'Paths object', result: 'present', value: `${pathCount} path(s)` },
        ],
      });
    }

    const score = passed / total;
    const missing: string[] = [];
    if (!checks.hasVersion) missing.push('version (openapi/swagger)');
    if (!checks.hasInfo) missing.push('info');
    if (!checks.hasPaths) missing.push('paths');

    return this.partial(score, {
      type: 'table',
      summary: `OpenAPI spec is missing ${missing.join(', ')}. Passed ${passed}/${total} checks.`,
      items: [
        { check: 'Version field', result: checks.hasVersion ? 'present' : 'missing' },
        { check: 'Info object', result: checks.hasInfo ? 'present' : 'missing' },
        { check: 'Paths object', result: checks.hasPaths ? 'present' : 'missing' },
      ],
    });
  }
}
