import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Erc8004RegistrationBindingAudit } from '../erc8004-registration-service-binding.js';
import { buildAgentServiceBindings, buildProgressiveValidationLineage } from '../../gatherers/erc8004-registration.js';
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
    registrationSha256: overrides.registrationSha256 ?? null,
    identity: overrides.identity ?? null,
    keyContinuityReceipts: overrides.keyContinuityReceipts ?? [],
    bindings: buildAgentServiceBindings({
      agentURI: 'https://agent.acme.dev/agent.json',
      registrationSha256: overrides.registrationSha256 ?? undefined,
      server: structuredClone(HEALTHY_SERVER),
      services: [{ name: 'MCP', endpoint: 'https://mcp.acme.dev/mcp' }],
      remotes: [makeRemoteProbe({ url: 'https://mcp.acme.dev/mcp' })],
    }),
    validationLineage: [],
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

describe('buildProgressiveValidationLineage', () => {
  it('binds every progressive response to its request hash and original validator while marking latest tag state', async () => {
    const firstPayload = 'soft validation evidence';
    const finalPayload = 'final validation evidence';
    const lineage = await buildProgressiveValidationLineage({
      validationRequests: [
        {
          requestHash: '0xrequest',
          validator: '0xvalidator',
          validationResponses: [
            {
              score: 60,
              responseURI: `data:text/plain,${encodeURIComponent(firstPayload)}`,
              responseHash: createHash('sha256').update(firstPayload).digest('hex'),
              tag: 'soft',
            },
            {
              requestHash: '0xrequest',
              validator: '0xvalidator',
              score: 94,
              responseURI: `data:text/plain,${encodeURIComponent(finalPayload)}`,
              responseHash: createHash('sha256').update(finalPayload).digest('hex'),
              tag: 'final',
            },
          ],
        },
      ],
      timeout: 100,
    });

    expect(lineage).toEqual([
      expect.objectContaining({
        requestHash: '0xrequest',
        validator: '0xvalidator',
        responseCount: 2,
        orderedTags: ['soft', 'final'],
        latestTag: 'final',
        latestScore: 94,
        allResponsesBound: true,
        allResponseHashesVerified: true,
      }),
    ]);
    expect(lineage[0]!.responses.map((response) => response.isLatest)).toEqual([false, true]);
    expect(lineage[0]!.responses.every((response) => response.requestHash === '0xrequest' && response.validator === '0xvalidator')).toBe(true);
  });

  it('flags validator/request mismatches and responseURI hash mismatches without treating them as bound evidence', async () => {
    const lineage = await buildProgressiveValidationLineage({
      validationRequests: [
        {
          requestHash: '0xrequest',
          validator: '0xvalidator',
          responses: [
            {
              requestHash: '0xother',
              validator: '0xattacker',
              score: 100,
              responseURI: 'data:text/plain,tampered',
              responseHash: createHash('sha256').update('expected').digest('hex'),
              tag: 'final',
            },
          ],
        },
      ],
      timeout: 100,
    });

    expect(lineage[0]).toMatchObject({
      requestHash: '0xrequest',
      validator: '0xvalidator',
      allResponsesBound: false,
      allResponseHashesVerified: false,
      latestTag: 'final',
      latestScore: 100,
    });
    expect(lineage[0]!.responses[0]).toMatchObject({
      requestHash: '0xother',
      validator: '0xattacker',
      requestHashMatches: false,
      validatorMatchesRequest: false,
      responseHashVerified: false,
    });
  });

  it('requires feedbackURI fetch receipts and feedbackHash integrity before scoring validation lineage', async () => {
    const payload = 'signed ERC-8004 feedback evidence';
    const lineage = await buildProgressiveValidationLineage({
      validationRequests: [
        {
          requestHash: '0xrequest',
          validator: '0xvalidator',
          validationResponses: [
            {
              score: 88,
              feedbackURI: `data:text/plain,${encodeURIComponent(payload)}`,
              feedbackHash: createHash('sha256').update(payload).digest('hex'),
              tag: 'final',
            },
          ],
        },
      ],
      timeout: 100,
    });

    expect(lineage[0]).toMatchObject({
      allResponsesBound: true,
      allResponseHashesVerified: true,
    });
    expect(lineage[0]!.responses[0]).toMatchObject({
      responseURI: `data:text/plain,${encodeURIComponent(payload)}`,
      responseHash: createHash('sha256').update(payload).digest('hex'),
      responseHashVerified: true,
      feedbackFetchDecisionReceipt: {
        signatureAlgorithm: 'ed25519',
        canonicalization: 'json-stable-v1',
        decisionPayload: expect.objectContaining({
          allowed: true,
          integritySha256: createHash('sha256').update(payload).digest('hex'),
          integrityVerified: true,
        }),
      },
    });
  });

  it('blocks private feedbackURI targets with a signed receipt before fetching or scoring them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const lineage = await buildProgressiveValidationLineage({
      validationRequests: [
        {
          requestHash: '0xrequest',
          validator: '0xvalidator',
          validationResponses: [
            {
              score: 99,
              feedbackURI: 'https://127.0.0.1/internal-feedback',
              feedbackHash: createHash('sha256').update('internal').digest('hex'),
              tag: 'final',
            },
          ],
        },
      ],
      timeout: 100,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(lineage[0]).toMatchObject({
      allResponsesBound: true,
      allResponseHashesVerified: false,
    });
    expect(lineage[0]!.responses[0]).toMatchObject({
      responseHashVerified: false,
      feedbackFetchDecisionReceipt: {
        signatureAlgorithm: 'ed25519',
        decisionPayload: expect.objectContaining({
          allowed: false,
          integritySha256: null,
          integrityVerified: false,
        }),
      },
    });
  });
});

describe('Erc8004RegistrationBindingAudit', () => {
  const audit = new Erc8004RegistrationBindingAudit();

  it('should pass when declared A2A/MCP services have TLS and domain-bound Ed25519 evidence', async () => {
    const result = await audit.audit({
      ...makeMcpArtifacts(),
      erc8004Registration: makeRegistrationArtifact({ registrationSha256: 'fixture-current-hash' }),
    });

    expect(result.score).toBe(1);
    expect(result.details?.summary).toContain('1/1');
    expect(result.details?.items?.[0]).toMatchObject({
      registrationSha256: 'fixture-current-hash',
      reattested: true,
    });
  });

  it('should export progressive validation lineage as audit evidence', async () => {
    const payload = 'final response evidence';
    const validationLineage = await buildProgressiveValidationLineage({
      validationRequests: [{
        requestHash: '0xrequest',
        validator: '0xvalidator',
        validationResponses: [{
          score: 91,
          responseURI: `data:text/plain,${encodeURIComponent(payload)}`,
          responseHash: createHash('sha256').update(payload).digest('hex'),
          tag: 'final',
        }],
      }],
      timeout: 100,
    });
    const result = await audit.audit({
      ...makeMcpArtifacts(),
      erc8004Registration: makeRegistrationArtifact({ validationLineage }),
    });

    expect(result.score).toBe(1);
    expect(result.details?.summary).toContain('1/1 validation request lineage receipts');
    expect(result.details?.items).toContainEqual(expect.objectContaining({
      kind: 'erc8004-validation-lineage',
      requestHash: '0xrequest',
      validator: '0xvalidator',
      orderedTags: ['final'],
      latestTag: 'final',
      latestScore: 91,
      allResponsesBound: true,
      allResponseHashesVerified: true,
    }));
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
