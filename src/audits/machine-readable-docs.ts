import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks if the site provides machine-readable documentation.
 * Machine-readable docs (OpenAPI, llms.txt, ai-plugin.json) let AI agents
 * discover and use APIs without parsing human-readable pages.
 */
export class MachineReadableDocsAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'machine-readable-docs',
    title: 'Site provides machine-readable documentation',
    failureTitle: 'Site lacks machine-readable documentation',
    description:
      'Machine-readable documentation (OpenAPI/Swagger spec, llms.txt, or ai-plugin.json) ' +
      'enables AI agents to automatically discover API endpoints, understand request/response ' +
      'schemas, and integrate without manual interpretation of human-written docs.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    if (api.hasMachineReadableDocs) {
      return this.pass({
        type: 'text',
        summary:
          'Machine-readable documentation found (OpenAPI spec, llms.txt, ' +
          'and/or ai-plugin.json). AI agents can auto-discover API capabilities.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'No machine-readable documentation found. Provide at least one of: ' +
        'OpenAPI spec at /openapi.json, llms.txt at /llms.txt, or ' +
        'ai-plugin.json at /.well-known/ai-plugin.json.',
    });
  }
}
