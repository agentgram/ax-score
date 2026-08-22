import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpAudit, runMcpSweep } from './mcp-runner.js';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Promise<Response> {
  const headerMap = new Map(Object.entries(headers));
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    body: null,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function dataResponse(url: string): Promise<Response> {
  const body = Buffer.from(decodeURIComponent(url.slice(url.indexOf(',') + 1)));
  return Promise.resolve({
    ok: true,
    status: 200,
    body: null,
    headers: { get: () => null },
    json: () => Promise.resolve(JSON.parse(body.toString('utf8'))),
    arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
  } as unknown as Response);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const REGISTRY_RECORD = {
  server: {
    name: 'io.github.acme/todo-server',
    title: 'Todo Server',
    description:
      'Read and write access to Acme Todo lists, projects, and reminders through a typed MCP tool surface.',
    version: '1.2.3',
    websiteUrl: 'https://github.com/acme/todo-server#readme',
    repository: { url: 'https://github.com/acme/todo-server', source: 'github' },
    packages: [{ registryType: 'npm', identifier: 'todo-mcp-server', version: '1.2.3' }],
    remotes: [{ type: 'streamable-http', url: 'https://mcp.acme.dev/mcp' }],
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      publishedAt: daysAgoIso(40),
      updatedAt: daysAgoIso(10),
      isLatest: true,
    },
  },
};

const NPM_BODY = {
  'dist-tags': { latest: '1.2.3' },
  time: { modified: daysAgoIso(15), '1.2.3': daysAgoIso(15) },
  versions: { '1.2.3': {} },
};

const REPO_BODY = {
  archived: false,
  stargazers_count: 800,
  pushed_at: daysAgoIso(7),
  license: { spdx_id: 'MIT' },
};

const README_BODY = {
  size: 4200,
  content: Buffer.from(
    '# Todo Server\n\n## Installation\n\n`npm install todo-mcp-server`\n\n## Usage\n\n' +
      '```json\n{"mcpServers": {"todo": {"command": "npx", "args": ["todo-mcp-server"]}}}\n```\n'
  ).toString('base64'),
};

type FetchHandler = (url: string) => Promise<Response> | null;

function mockFetchRoutes(overrides: FetchHandler = () => null): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    const overridden = overrides(url);
    if (overridden) return overridden;

    if (url.startsWith('data:')) return dataResponse(url);

    if (url.includes('registry.modelcontextprotocol.io')) return jsonResponse(REGISTRY_RECORD);
    if (url.includes('registry.npmjs.org')) return jsonResponse(NPM_BODY);
    if (url.includes('api.github.com') && url.endsWith('/readme')) return jsonResponse(README_BODY);
    if (url.includes('api.github.com')) return jsonResponse(REPO_BODY);
    if (url.includes('mcp.acme.dev')) return jsonResponse(null, 405);
    return jsonResponse({}, 404);
  });
}

describe('runMcpAudit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should score a healthy server highly across all categories', async () => {
    mockFetchRoutes();

    const report = await runMcpAudit({ server: 'io.github.acme/todo-server' });

    expect(report.server).toBe('io.github.acme/todo-server');
    expect(report.serverVersion).toBe('1.2.3');
    expect(report.categories).toHaveLength(5);
    expect(Object.keys(report.audits)).toHaveLength(20);
    expect(report.score).toBeGreaterThanOrEqual(90);

    for (const category of report.categories) {
      expect(category.weight).toBeGreaterThan(0);
    }
  });

  it('should exclude GitHub-based audits from weighting when GitHub is rate limited', async () => {
    mockFetchRoutes((url) => {
      if (url.includes('api.github.com')) {
        return jsonResponse({ message: 'API rate limit exceeded' }, 403);
      }
      return null;
    });

    const report = await runMcpAudit({ server: 'io.github.acme/todo-server' });

    // Repo-dependent audits become indeterminate, not failures
    expect(report.audits['mcp-repo-exists']?.applicability).toBe('indeterminate');
    expect(report.audits['mcp-readme-exists']?.applicability).toBe('indeterminate');

    // Their weights are zeroed so the overall score is not dragged to zero
    const provenance = report.categories.find((c) => c.id === 'mcp-provenance');
    const repoExistsRef = provenance?.auditRefs.find((r) => r.id === 'mcp-repo-exists');
    expect(repoExistsRef?.weight).toBe(0);
    expect(report.score).toBeGreaterThanOrEqual(80);
  });

  it('should zero out a category when none of its audits are evaluable', async () => {
    const remoteOnlyRecord = structuredClone(REGISTRY_RECORD);
    remoteOnlyRecord.server.packages = [];

    mockFetchRoutes((url) => {
      if (url.includes('registry.modelcontextprotocol.io')) {
        return jsonResponse(remoteOnlyRecord);
      }
      return null;
    });

    const report = await runMcpAudit({ server: 'io.github.acme/todo-server' });

    const distribution = report.categories.find((c) => c.id === 'mcp-distribution');
    // registry-freshness stays evaluable, so the category survives
    expect(distribution?.auditRefs.find((r) => r.id === 'mcp-package-resolvable')?.weight).toBe(0);
    expect(report.audits['mcp-package-resolvable']?.applicability).toBe('not-applicable');
  });

  it('should throw a clear error for unknown servers', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 404));

    await expect(runMcpAudit({ server: 'io.github.acme/missing' })).rejects.toThrow('not found');
  });
});

describe('runMcpSweep', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should rank swept servers by score without re-fetching records', async () => {
    const listBody = {
      servers: [REGISTRY_RECORD, { server: { name: 'io.github.bare/empty', version: '0.0.1' } }],
      metadata: { count: 2 },
    };

    mockFetchRoutes((url) => {
      if (url.includes('/v0/servers?')) return jsonResponse(listBody);
      return null;
    });

    const progress: number[] = [];
    const report = await runMcpSweep({ limit: 2, concurrency: 2 }, (p) =>
      progress.push(p.completed)
    );

    expect(report.requested).toBe(2);
    expect(report.scored).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.entries).toHaveLength(2);
    expect(report.entries[0]!.server).toBe('io.github.acme/todo-server');
    expect(report.entries[0]!.score).toBeGreaterThan(report.entries[1]!.score ?? 0);
    expect(report.entries[0]!.categoryScores['mcp-metadata']).toBeGreaterThan(0);
    expect(report.entries[0]!.rateLimited).toBe(false);
    expect(report.entries[0]!.publisherAuthProvenance).toMatchObject({
      registryNamespace: 'io.github.acme',
      publisherAuthMethod: 'github-oauth-oidc',
      verifiedAt: expect.any(String),
      policyVersion: 'mcp-registry-publisher-auth-v1',
    });
    expect(report.entries[0]!.publisherAuthProvenance?.scanReceipt).toMatchObject({
      signatureAlgorithm: 'ed25519',
      canonicalization: 'json-stable-v1',
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      signatureBase64: expect.any(String),
      publicKeyBase64: expect.any(String),
    });
    expect(report.entries[0]!.publisherAuthProvenance?.scanReceipt.payload).toMatchObject({
      server: 'io.github.acme/todo-server',
      registryNamespace: 'io.github.acme',
      publisherAuthMethod: 'github-oauth-oidc',
      score: report.entries[0]!.score,
    });
    expect(report.entries[0]!.publisherAuthProvenance?.canonicalEvidenceSha256).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(report.entries[0]!.remoteSemanticConsistency).toMatchObject({
      status: 'insufficient-evidence',
      declaredRemoteCount: 1,
      exportConfidence: 1,
    });
    expect(progress).toHaveLength(2);
  });

  it('should report fully excluded categories as null, distinct from a genuine 0', async () => {
    // Bare server: no packages, no remotes, no repo, no official metadata —
    // every Distribution audit is not-applicable or indeterminate.
    const listBody = {
      servers: [{ server: { name: 'io.github.bare/empty', version: '0.0.1' } }],
      metadata: { count: 1 },
    };

    mockFetchRoutes((url) => {
      if (url.includes('/v0/servers?')) return jsonResponse(listBody);
      return null;
    });

    const report = await runMcpSweep({ limit: 1 });
    const entry = report.entries[0]!;

    expect(entry.categoryScores['mcp-distribution']).toBeNull();
    // Documentation genuinely fails (no repo => no docs): a real 0, not null.
    expect(entry.categoryScores['mcp-documentation']).toBe(0);
    expect(entry.notApplicableAudits).toBeGreaterThan(0);
    expect(entry.indeterminateAudits).toBeGreaterThan(0);
  });

  it('should export ERC-8004 progressive validation lineage on sweep entries', async () => {
    const record = structuredClone(REGISTRY_RECORD);
    const responseBody = 'final validation evidence';
    const registration = {
      services: [{ name: 'MCP', endpoint: 'https://mcp.acme.dev/mcp' }],
      validationRequests: [{
        requestHash: '0xrequest',
        validator: '0xvalidator',
        validationResponses: [{
          score: 93,
          endpoint: 'https://mcp.acme.dev/mcp',
          responseURI: `data:text/plain,${encodeURIComponent(responseBody)}`,
          responseHash: createHash('sha256').update(responseBody).digest('hex'),
          transactionHash: '0xfeedbacktx',
          blockNumber: 123,
          logIndex: 4,
          feedbackIndex: 7,
          clientAddress: '0xclient',
          value: 93,
          valueDecimals: 0,
          tag: 'final',
          tag2: 'quality',
          isRevoked: false,
        }],
      }],
    };
    (record.server as typeof record.server & { erc8004: { agentURI: string } }).erc8004 = {
      agentURI: `data:application/json,${encodeURIComponent(JSON.stringify(registration))}`,
    };
    const listBody = { servers: [record], metadata: { count: 1 } };

    mockFetchRoutes((url) => {
      if (url.includes('/v0/servers?')) return jsonResponse(listBody);
      return null;
    });

    const report = await runMcpSweep({ limit: 1 });
    const entry = report.entries[0]!;

    expect(entry.validationLineage).toEqual([
      expect.objectContaining({
        requestHash: '0xrequest',
        validator: '0xvalidator',
        orderedTags: ['final'],
        latestTag: 'final',
        latestScore: 93,
        allResponsesBound: true,
        allResponseHashesVerified: true,
        allFeedbackEventStorageComplete: true,
      }),
    ]);
    expect(entry.validationLineage?.[0]?.responses[0]).toMatchObject({
      order: 1,
      requestHashMatches: true,
      validatorMatchesRequest: true,
      responseHashVerified: true,
      endpoint: 'https://mcp.acme.dev/mcp',
      canonicalEventPointer: expect.objectContaining({ eventName: 'NewFeedback', transactionHash: '0xfeedbacktx' }),
      eventStorageCompletenessVerdict: expect.objectContaining({ signatureAlgorithm: 'ed25519' }),
      isLatest: true,
    });
  });

  it('should stamp rateLimited and stop hitting GitHub once the quota is exhausted', async () => {
    const secondRecord = structuredClone(REGISTRY_RECORD);
    secondRecord.server.name = 'io.github.acme/second-server';
    secondRecord.server.repository = {
      url: 'https://github.com/acme/second-server',
      source: 'github',
    };
    const listBody = { servers: [REGISTRY_RECORD, secondRecord], metadata: { count: 2 } };
    const farReset = String(Math.floor(Date.now() / 1000) + 3600);

    let githubCalls = 0;
    mockFetchRoutes((url) => {
      if (url.includes('/v0/servers?')) return jsonResponse(listBody);
      if (url.includes('api.github.com')) {
        githubCalls += 1;
        return jsonResponse({ message: 'API rate limit exceeded' }, 403, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': farReset,
        });
      }
      return null;
    });

    const report = await runMcpSweep({ limit: 2, concurrency: 1 });

    // The first exhausted response short-circuits every later GitHub lookup.
    expect(githubCalls).toBe(1);
    expect(report.entries).toHaveLength(2);
    for (const entry of report.entries) {
      expect(entry.rateLimited).toBe(true);
      expect(entry.indeterminateAudits).toBeGreaterThan(0);
      expect(entry.score).not.toBeNull();
    }
  });

  it('should surface the registry error when the sweep cannot start', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(runMcpSweep({ limit: 5 })).rejects.toThrow('unreachable');
  });
});
