import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { Erc8004RegistrationGatherResult } from '../gatherers/erc8004-registration.js';
import { McpBaseAudit } from './mcp-base-audit.js';
import type { AuditMeta } from './base-audit.js';

export class Erc8004RegistrationBindingAudit extends McpBaseAudit {
  meta: AuditMeta = {
    id: 'erc8004-registration-service-binding',
    title: 'ERC-8004 services are bound to the agent identity',
    failureTitle: 'ERC-8004 service binding is not verified',
    description: 'ERC-8004 agentURI files can advertise A2A/MCP service endpoints. AX Score dereferences the registration file and exports TLS, redirect, domain-control, and Ed25519 fetch-decision evidence for those bindings.',
    requiredGatherers: ['erc8004Registration'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const registration = artifacts['erc8004Registration'] as Erc8004RegistrationGatherResult | undefined;
    if (!registration?.agentURI) return this.notApplicable('No ERC-8004 agentURI declared in the registry record.');
    if (!registration.fetched) return this.indeterminate(registration.error ?? 'Could not dereference the ERC-8004 agent registration file.');
    const bindings = registration.bindings;
    const validationLineage = registration.validationLineage;
    if (bindings.length === 0 && validationLineage.length === 0) return this.notApplicable('The ERC-8004 registration file declares no A2A/MCP services that match probed endpoints and no progressive validation lineage.');
    const items = bindings.map((binding) => ({
      kind: 'erc8004-service-binding',
      service: binding.serviceName,
      endpoint: binding.endpoint,
      tls: binding.tls,
      domainControl: binding.domainControl,
      redirects: binding.redirectCount,
      receipt: binding.signatureAlgorithm,
      registrationSha256: binding.registrationSha256 ?? registration.registrationSha256,
      reattested: binding.tls && binding.signatureAlgorithm === 'ed25519' && (binding.domainControl === 'same-host' || binding.domainControl === 'same-registrable-domain'),
    }));
    const validationLineageItems = validationLineage.map((lineage) => ({
      kind: 'erc8004-validation-lineage',
      requestHash: lineage.requestHash,
      validator: lineage.validator,
      responseCount: lineage.responseCount,
      orderedTags: lineage.orderedTags,
      latestTag: lineage.latestTag,
      latestScore: lineage.latestScore,
      allResponsesBound: lineage.allResponsesBound,
      allResponseHashesVerified: lineage.allResponseHashesVerified,
      responses: lineage.responses,
    }));
    const verified = bindings.filter((binding) => binding.tls && binding.signatureAlgorithm === 'ed25519' && (binding.domainControl === 'same-host' || binding.domainControl === 'same-registrable-domain'));
    const verifiedLineage = validationLineage.filter((lineage) => lineage.allResponsesBound && lineage.allResponseHashesVerified);
    const evaluableGroups = (bindings.length > 0 ? 1 : 0) + (validationLineage.length > 0 ? 1 : 0);
    const score = ((bindings.length > 0 ? verified.length / bindings.length : 0) + (validationLineage.length > 0 ? verifiedLineage.length / validationLineage.length : 0)) / evaluableGroups;
    const summary = `${verified.length}/${bindings.length} ERC-8004 A2A/MCP service bindings carry TLS, domain-control, redirect, and Ed25519 evidence. ${verifiedLineage.length}/${validationLineage.length} validation request lineage receipts bind every response to requestHash/original validator, verify responseURI content against responseHash, and export response order, tags, and latest state.`;
    const allItems = [...items, ...validationLineageItems];
    if (score >= 1) return this.pass({ type: 'table', items: allItems, summary });
    if (score <= 0) return this.fail({ type: 'table', items: allItems, summary });
    return this.partial(score, { type: 'table', items: allItems, summary });
  }
}
