import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpAudit, runMcpSweep } from './mcp-runner.js';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    body: null,
    json: () => Promise.resolve(body),
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
    expect(Object.keys(report.audits)).toHaveLength(18);
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
    expect(progress).toHaveLength(2);
  });

  it('should surface the registry error when the sweep cannot start', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(runMcpSweep({ limit: 5 })).rejects.toThrow('unreachable');
  });
});
