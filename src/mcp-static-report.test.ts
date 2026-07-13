import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_MCP_REPORT_SERVERS } from './config/mcp.js';
import { runMcpStaticReport } from './mcp-runner.js';

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

  it('audits the curated hardcoded server set without using registry sweep pagination', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/v0/servers?')) {
        return jsonResponse({ error: 'sweep endpoint should not be used' }, 500);
      }

      const match = url.match(/\/v0\/servers\/(.+)\/versions\/latest$/);
      if (match?.[1]) {
        return jsonResponse(registryRecord(decodeURIComponent(match[1])));
      }

      return jsonResponse({}, 404);
    });

    const progress: string[] = [];
    const report = await runMcpStaticReport({ concurrency: 2 }, (p) => progress.push(p.server));

    expect(report.requested).toBe(DEFAULT_MCP_REPORT_SERVERS.length);
    expect(report.scored).toBe(DEFAULT_MCP_REPORT_SERVERS.length);
    expect(report.failed).toBe(0);
    expect(report.entries.map((entry) => entry.server).sort()).toEqual(
      [...DEFAULT_MCP_REPORT_SERVERS].sort()
    );
    expect(progress).toHaveLength(DEFAULT_MCP_REPORT_SERVERS.length);
    expect(requestedUrls.some((url) => url.includes('/v0/servers?'))).toBe(false);
  });
});
