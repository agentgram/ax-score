import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { McpRemoteGatherResult } from '../gatherers/mcp-remote.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

/**
 * Checks that every attested Registry-declared remote advertises the same MCP
 * identity, protocol version, and capability digest for the same initialize
 * request. Missing semantic responses are not scored as divergence; only
 * conflicting successful initialize responses lower operational trust.
 */
export class McpRemoteSemanticConsistencyAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'mcp-remote-semantic-consistency',
    title: 'Remote endpoints expose consistent MCP semantics',
    failureTitle: 'Remote endpoints expose divergent MCP semantics',
    description:
      'Multiple hosted endpoints for one Registry server must attest the same server identity, ' +
      'protocol version, and capability digest before exported reputation is trusted.',
    requiredGatherers: ['mcpRemote'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const remote = artifacts['mcpRemote'] as McpRemoteGatherResult | undefined;
    const probes = remote?.remotes ?? [];
    const attestation = remote?.semanticConsistency;

    if (probes.length === 0 || !attestation || attestation.status === 'not-applicable') {
      return this.notApplicable('No remote endpoints declared (package-only server).');
    }

    const items = [{
      status: attestation.status,
      declaredRemoteCount: attestation.declaredRemoteCount,
      attestedRemoteCount: attestation.attestedRemoteCount,
      exportConfidence: attestation.exportConfidence,
      receipt: attestation.receipt,
    }];
    const summary =
      attestation.status === 'divergence'
        ? 'Registry-declared remotes returned mismatched MCP initialize semantics.'
        : `${attestation.attestedRemoteCount}/${attestation.declaredRemoteCount} remotes provided comparable MCP initialize semantics.`;

    if (attestation.status === 'divergence') {
      return this.fail({ type: 'table', items, summary });
    }
    if (attestation.status === 'insufficient-evidence') {
      return this.pass({ type: 'table', items, summary });
    }
    return this.pass({ type: 'table', items, summary });
  }
}
