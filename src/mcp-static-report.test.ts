import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpStaticReport } from './mcp-runner.js';
import type { McpSweepReport } from './types.js';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    body: null,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function registryRecord(server: string): unknown {
  return {
    server: {
      name: server,
      title: `Static report fixture for ${server}`,
      description:
        'A documented MCP server used by the bounded AX Score report fixture for agent tooling evaluation.',
      version: '1.0.0',
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        publishedAt: daysAgoIso(20),
        updatedAt: daysAgoIso(3),
        isLatest: true,
      },
    },
  };
}

describe('runMcpStaticReport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the report from official registry pagination instead of a curated server set', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/v0/servers?')) {
        if (url.includes('cursor=next-page')) {
          return jsonResponse({ servers: [registryRecord('io.github.b/two')], metadata: {} });
        }
        return jsonResponse({
          servers: [registryRecord('io.github.a/one')],
          metadata: { nextCursor: 'next-page' },
        });
      }

      const match = url.match(/\/v0\/servers\/(.+)\/versions\/latest$/);
      if (match?.[1]) {
        return jsonResponse({ error: 'per-server registry fetch should not be used' }, 500);
      }

      return jsonResponse({}, 404);
    });

    const progress: string[] = [];
    const report = await runMcpStaticReport({ limit: 2, pageSize: 1, concurrency: 2 }, (p) =>
      progress.push(p.server)
    );

    expect(report.requested).toBe(2);
    expect(report.scored).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.entries.map((entry) => entry.server).sort()).toEqual(
      ['io.github.a/one', 'io.github.b/two']
    );
    expect(progress).toHaveLength(2);
    expect(requestedUrls.some((url) => url.includes('/v0/servers?'))).toBe(true);
    expect(requestedUrls.some((url) => url.includes('/versions/latest'))).toBe(false);
  });

  it('resumes from an existing report and only audits missing registry records', async () => {
    const resumeFrom: McpSweepReport = {
      registryUrl: 'https://registry.modelcontextprotocol.io',
      timestamp: '2026-07-13T00:00:00.000Z',
      version: '0.3.0',
      requested: 2,
      scored: 1,
      failed: 0,
      entries: [
        {
          server: 'io.github.a/one',
          serverVersion: '1.0.0',
          score: 99,
          categoryScores: {},
          notApplicableAudits: 0,
          indeterminateAudits: 0,
          rateLimited: false,
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/v0/servers?')) {
        return jsonResponse({
          servers: [registryRecord('io.github.a/one'), registryRecord('io.github.b/two')],
          metadata: {},
        });
      }
      return jsonResponse({}, 404);
    });

    const progress: string[] = [];
    const report = await runMcpStaticReport(
      { limit: 2, concurrency: 1, resumeFrom },
      (p) => progress.push(p.server)
    );

    expect(report.entries.map((entry) => entry.server).sort()).toEqual([
      'io.github.a/one',
      'io.github.b/two',
    ]);
    expect(report.entries.find((entry) => entry.server === 'io.github.a/one')?.score).toBe(99);
    expect(progress).toEqual(['io.github.b/two']);
  });
});
