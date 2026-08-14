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
    if (bindings.length === 0) return this.notApplicable('The ERC-8004 registration file declares no A2A/MCP services that match probed endpoints.');
    const items = bindings.map((binding) => ({
      service: binding.serviceName,
      endpoint: binding.endpoint,
      tls: binding.tls,
      domainControl: binding.domainControl,
      redirects: binding.redirectCount,
      receipt: binding.signatureAlgorithm,
      registrationSha256: binding.registrationSha256 ?? registration.registrationSha256,
      reattested: binding.tls && binding.signatureAlgorithm === 'ed25519' && (binding.domainControl === 'same-host' || binding.domainControl === 'same-registrable-domain'),
    }));
    const verified = bindings.filter((binding) => binding.tls && binding.signatureAlgorithm === 'ed25519' && (binding.domainControl === 'same-host' || binding.domainControl === 'same-registrable-domain'));
    const score = verified.length / bindings.length;
    const summary = `${verified.length}/${bindings.length} ERC-8004 A2A/MCP service bindings carry TLS, domain-control, redirect, and Ed25519 evidence.`;
    if (score >= 1) return this.pass({ type: 'table', items, summary });
    if (score <= 0) return this.fail({ type: 'table', items, summary });
    return this.partial(score, { type: 'table', items, summary });
  }
}
