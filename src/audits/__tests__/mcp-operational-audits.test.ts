import { describe, it, expect } from 'vitest';
import { McpRemoteReachableAudit } from '../mcp-remote-reachable.js';
import { McpRemoteSemanticConsistencyAudit } from '../mcp-remote-semantic-consistency.js';
import { McpRemoteTlsAudit } from '../mcp-remote-tls.js';
import { McpServerRecordValidAudit } from '../mcp-server-record-valid.js';
import { makeMcpArtifacts, makeRemoteProbe, HEALTHY_SERVER } from './mcp-fixtures.js';

describe('McpRemoteReachableAudit', () => {
  const audit = new McpRemoteReachableAudit();

  it('should pass when the remote responds (even with 405)', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
    expect(result.details?.items?.[0]).toMatchObject({
      resolutionDecision: 'probe',
      fetchDecisionReceipt: { signatureAlgorithm: 'ed25519' },
    });
  });

  it('should fail when the remote never responds', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ remotes: [makeRemoteProbe({ reachable: false, statusCode: null })] })
    );
    expect(result.score).toBe(0);
  });

  it('should partially score 5xx responses', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ remotes: [makeRemoteProbe({ statusCode: 503 })] })
    );
    expect(result.score).toBe(0.4);
  });

  it('should average across multiple remotes', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        remotes: [
          makeRemoteProbe(),
          makeRemoteProbe({ url: 'https://dead.acme.dev/mcp', reachable: false, statusCode: null }),
        ],
      })
    );
    expect(result.score).toBe(0.5);
  });

  it('should be not applicable for package-only servers', async () => {
    const result = await audit.audit(makeMcpArtifacts({ remotes: [] }));
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpRemoteSemanticConsistencyAudit', () => {
  const audit = new McpRemoteSemanticConsistencyAudit();

  it('should fail and surface export-confidence reduction when remotes diverge', async () => {
    const artifacts = makeMcpArtifacts({
      remotes: [
        makeRemoteProbe({ url: 'https://a.acme.dev/mcp' }),
        makeRemoteProbe({
          url: 'https://b.acme.dev/mcp',
          semanticProbe: {
            attempted: true,
            status: 'attested',
            statusCode: 200,
            protocolVersion: '2024-11-05',
            serverName: 'todo-shadow',
            serverVersion: '1.2.3',
            capabilitiesSha256: 'different-capabilities-sha256',
            canonicalSha256: 'different-canonical-sha256',
          },
        }),
      ],
    });
    artifacts['mcpRemote'] = {
      ...artifacts['mcpRemote'],
      semanticConsistency: {
        status: 'divergence',
        declaredRemoteCount: 2,
        attestedRemoteCount: 2,
        exportConfidence: 0.6,
        receipt: {
          signatureAlgorithm: 'ed25519',
          canonicalization: 'json-stable-v1',
          payload: {
            canonicalization: 'mcp-remote-semantic-v1',
            request: {} as never,
            status: 'divergence',
            declaredRemoteCount: 2,
            attestedRemoteCount: 2,
            baselineCanonicalSha256: 'fixture-canonical-sha256',
            remotes: [],
          },
          payloadSha256: 'fixture-payload-sha256',
          signatureBase64: 'fixture-signature',
          publicKeyBase64: 'fixture-public-key',
          signedAt: '2026-07-13T00:00:00.000Z',
        },
      },
    };

    const result = await audit.audit(artifacts);

    expect(result.score).toBe(0);
    expect(result.details?.items?.[0]).toMatchObject({
      status: 'divergence',
      exportConfidence: 0.6,
      receipt: { signatureAlgorithm: 'ed25519' },
    });
  });
});

describe('McpRemoteTlsAudit', () => {
  const audit = new McpRemoteTlsAudit();

  it('should pass when all remotes use HTTPS', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
    expect(result.details?.items?.[0]).toMatchObject({
      resolutionDecision: 'probe',
      fetchDecisionReceipt: { signatureAlgorithm: 'ed25519' },
    });
  });

  it('should fail plain-http remotes', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        remotes: [makeRemoteProbe({ url: 'http://mcp.acme.dev/mcp', https: false })],
      })
    );
    expect(result.score).toBe(0);
  });

  it('should be not applicable for package-only servers', async () => {
    const result = await audit.audit(makeMcpArtifacts({ remotes: [] }));
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpServerRecordValidAudit', () => {
  const audit = new McpServerRecordValidAudit();

  it('should pass a well-formed record', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should penalize a record without packages or remotes', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        registry: {
          server: { ...structuredClone(HEALTHY_SERVER), packages: [], remotes: [] },
        },
      })
    );
    expect(result.score).toBe(0.75);
  });

  it('should penalize a malformed name', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        registry: { server: { ...structuredClone(HEALTHY_SERVER), name: 'just-a-name' } },
      })
    );
    expect(result.score).toBe(0.75);
  });

  it('should penalize packages without identifiers', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        registry: {
          server: {
            ...structuredClone(HEALTHY_SERVER),
            packages: [{ registryType: 'npm' }],
          },
        },
      })
    );
    expect(result.score).toBe(0.75);
  });
});
