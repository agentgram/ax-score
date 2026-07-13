import { describe, it, expect } from 'vitest';
import { renderMcpLeaderboard } from './mcp.js';
import type { McpSweepEntry, McpSweepReport } from '../types.js';

const BASE_ENTRY: Omit<McpSweepEntry, 'server' | 'score' | 'categoryScores'> = {
  serverVersion: '1.0.0',
  notApplicableAudits: 0,
  indeterminateAudits: 0,
  rateLimited: false,
};

function makeReport(entries: McpSweepEntry[]): McpSweepReport {
  return {
    registryUrl: 'https://registry.modelcontextprotocol.io',
    timestamp: '2026-07-13T00:00:00.000Z',
    version: '0.3.0',
    requested: entries.length,
    scored: entries.filter((e) => e.score !== null).length,
    failed: entries.filter((e) => e.score === null).length,
    entries,
  };
}

describe('renderMcpLeaderboard', () => {
  it('should render excluded categories as n/a, distinct from a genuine 0', () => {
    const markdown = renderMcpLeaderboard(
      makeReport([
        {
          ...BASE_ENTRY,
          server: 'io.github.a/bare',
          score: 40,
          indeterminateAudits: 4,
          categoryScores: {
            'mcp-metadata': 50,
            'mcp-distribution': null,
            'mcp-provenance': 0,
            'mcp-operational': 75,
            'mcp-documentation': 0,
          },
        },
      ])
    );

    const row = markdown.split('\n').find((line) => line.includes('io.github.a/bare'))!;
    expect(row).toContain('| n/a |');
    expect(row).toContain('| 0 |');
    // legend explains that n/a is not a zero
    expect(markdown).toContain('n/a = category excluded from scoring');
    expect(markdown).toContain('not a score of 0');
  });

  it('should mark rate-limited entries and explain the marker', () => {
    const markdown = renderMcpLeaderboard(
      makeReport([
        {
          ...BASE_ENTRY,
          server: 'io.github.a/limited',
          score: 70,
          rateLimited: true,
          indeterminateAudits: 6,
          categoryScores: {
            'mcp-metadata': 80,
            'mcp-distribution': 90,
            'mcp-provenance': null,
            'mcp-operational': 100,
            'mcp-documentation': null,
          },
        },
      ])
    );

    expect(markdown).toContain('io.github.a/limited \\*');
    expect(markdown).toContain('GitHub rate limiting');
    expect(markdown).toContain('GITHUB_TOKEN');
  });

  it('should render clean tables without legends when nothing was excluded', () => {
    const markdown = renderMcpLeaderboard(
      makeReport([
        {
          ...BASE_ENTRY,
          server: 'io.github.a/full',
          score: 95,
          categoryScores: {
            'mcp-metadata': 90,
            'mcp-distribution': 100,
            'mcp-provenance': 96,
            'mcp-operational': 100,
            'mcp-documentation': 88,
          },
        },
      ])
    );

    expect(markdown).not.toContain('n/a');
    expect(markdown).not.toContain('GITHUB_TOKEN');
    expect(markdown).toContain('| 1 | io.github.a/full | **95** |');
  });

  it('should list unscored servers with their errors', () => {
    const markdown = renderMcpLeaderboard(
      makeReport([
        {
          ...BASE_ENTRY,
          server: 'io.github.a/broken',
          score: null,
          categoryScores: {},
          error: 'MCP Registry was unreachable.',
        },
      ])
    );

    expect(markdown).toContain('## Not scored');
    expect(markdown).toContain('io.github.a/broken: MCP Registry was unreachable.');
  });
});
