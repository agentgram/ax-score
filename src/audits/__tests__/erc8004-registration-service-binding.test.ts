import { describe, it, expect } from 'vitest';
import { Erc8004RegistrationBindingAudit } from '../erc8004-registration-service-binding.js';
import { buildAgentServiceBindings } from '../../gatherers/erc8004-registration.js';
import { makeMcpArtifacts, makeRemoteProbe, HEALTHY_SERVER } from './mcp-fixtures.js';
import type { Erc8004RegistrationGatherResult } from '../../gatherers/erc8004-registration.js';

function makeRegistrationArtifact(
  overrides: Partial<Erc8004RegistrationGatherResult> = {}
): Erc8004RegistrationGatherResult {
  return {
    agentURI: 'https://agent.acme.dev/agent.json',
    fetched: true,
    error: null,
    registration: { services: [{ name: 'MCP', endpoint: 'https://mcp.acme.dev/mcp' }] },
    bindings: buildAgentServiceBindings({
      agentURI: 'https://agent.acme.dev/agent.json',
      server: structuredClone(HEALTHY_SERVER),
      services: [{ name: 'MCP', endpoint: 'https://mcp.acme.dev/mcp' }],
      remotes: [makeRemoteProbe({ url: 'https://mcp.acme.dev/mcp' })],
    }),
    ...overrides,
  };
}

describe('buildAgentServiceBindings', () => {
  it('should bind A2A and MCP registration services to matching remote evidence', () => {
    const bindings = buildAgentServiceBindings({
      agentURI: 'https://agent.acme.dev/agent.json',
      server: { ...structuredClone(HEALTHY_SERVER), erc8004: { agentURI: 'https://agent.acme.dev/agent.json', agentId: 7 } },
      services: [
        { name: 'web', endpoint: 'https://www.acme.dev/' },
        { name: 'A2A', endpoint: 'https://a2a.acme.dev/.well-known/agent-card.json' },
        { name: 'MCP', endpoint: 'https://mcp.acme.dev/mcp' },
      ],
      remotes: [
        makeRemoteProbe({ url: 'https://a2a.acme.dev/.well-known/agent-card.json' }),
        makeRemoteProbe({ url: 'https://mcp.acme.dev/mcp' }),
      ],
    });

    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toMatchObject({ agentId: '7', serviceName: 'A2A', domainControl: 'same-registrable-domain', tls: true });
    expect(bindings[0]!.signatureAlgorithm).toBe('ed25519');
  });

  it('should mark cross-domain service endpoints as mismatched', () => {
    const bindings = buildAgentServiceBindings({
      agentURI: 'https://agent.acme.dev/agent.json',
      server: structuredClone(HEALTHY_SERVER),
      services: [{ name: 'MCP', endpoint: 'https://mcp.evil.example/mcp' }],
      remotes: [makeRemoteProbe({ url: 'https://mcp.evil.example/mcp' })],
    });

    expect(bindings[0]!.domainControl).toBe('mismatch');
  });
});

describe('Erc8004RegistrationBindingAudit', () => {
  const audit = new Erc8004RegistrationBindingAudit();

  it('should pass when declared A2A/MCP services have TLS and domain-bound Ed25519 evidence', async () => {
    const result = await audit.audit({ ...makeMcpArtifacts(), erc8004Registration: makeRegistrationArtifact() });

    expect(result.score).toBe(1);
    expect(result.details?.summary).toContain('1/1');
  });

  it('should fail when service endpoints are not domain-bound to the agent URI', async () => {
    const result = await audit.audit({
      ...makeMcpArtifacts(),
      erc8004Registration: makeRegistrationArtifact({
        bindings: buildAgentServiceBindings({
          agentURI: 'https://agent.acme.dev/agent.json',
          server: structuredClone(HEALTHY_SERVER),
          services: [{ name: 'MCP', endpoint: 'https://mcp.evil.example/mcp' }],
          remotes: [makeRemoteProbe({ url: 'https://mcp.evil.example/mcp' })],
        }),
      }),
    });

    expect(result.score).toBe(0);
  });

  it('should be not applicable when no ERC-8004 agentURI is declared', async () => {
    const result = await audit.audit({ ...makeMcpArtifacts(), erc8004Registration: makeRegistrationArtifact({ agentURI: null, bindings: [] }) });

    expect(result.applicability).toBe('not-applicable');
  });

  it('should be indeterminate when the registration file cannot be dereferenced', async () => {
    const result = await audit.audit({
      ...makeMcpArtifacts(),
      erc8004Registration: makeRegistrationArtifact({ fetched: false, error: 'agentURI responded with HTTP 404.', registration: null, bindings: [] }),
    });

    expect(result.applicability).toBe('indeterminate');
  });
});
