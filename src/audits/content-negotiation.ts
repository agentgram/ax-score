import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the site returns proper content-type headers and
 * supports JSON-based content negotiation.
 *
 * Proper content-type headers and accept-header support enable AI agents
 * to negotiate the most suitable response format.
 */
export class ContentNegotiationAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'content-negotiation',
    title: 'Site supports proper content negotiation',
    failureTitle: 'Site does not support proper content negotiation',
    description:
      'Proper content-type headers and support for JSON content negotiation ' +
      'enable AI agents to request and receive data in the most suitable format.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const headers = http.headers;

    const contentType = headers['content-type'] ?? '';

    // Check that a content-type header is present at all
    if (!contentType) {
      return this.fail({
        type: 'text',
        summary:
          'The site does not return a content-type header. ' +
          'AI agents need content-type headers to correctly parse responses.',
      });
    }

    // Check for JSON support indicators
    const hasJsonSupport =
      contentType.includes('application/json') ||
      headers['accept']?.includes('application/json') ||
      // Vary: Accept header indicates the server performs content negotiation
      (headers['vary'] ?? '').toLowerCase().includes('accept');

    if (hasJsonSupport) {
      return this.pass({
        type: 'table',
        summary: 'The site returns proper content-type headers and supports JSON.',
        items: [
          { header: 'content-type', value: contentType },
          ...(headers['vary'] ? [{ header: 'vary', value: headers['vary'] }] : []),
        ],
      });
    }

    // The site has a content-type header but no JSON support signals
    return this.fail({
      type: 'table',
      summary:
        'The site returns a content-type header but does not indicate JSON support. ' +
        'Consider supporting application/json for AI agent consumption.',
      items: [{ header: 'content-type', value: contentType }],
    });
  }
}
