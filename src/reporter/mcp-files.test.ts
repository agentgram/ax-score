import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeMcpReportFiles } from './mcp-files.js';
import type { McpSweepReport } from '../types.js';

function makeReport(): McpSweepReport {
  return {
    registryUrl: 'https://registry.modelcontextprotocol.io',
    timestamp: '2026-07-13T00:00:00.000Z',
    version: '0.3.0',
    requested: 1,
    scored: 1,
    failed: 0,
    entries: [
      {
        server: 'io.github.acme/todo-server',
        serverVersion: '1.2.3',
        score: 93,
        categoryScores: {
          'mcp-metadata': 95,
          'mcp-distribution': 90,
          'mcp-provenance': 100,
          'mcp-operational': 88,
          'mcp-documentation': 92,
        },
        notApplicableAudits: 0,
        indeterminateAudits: 0,
        rateLimited: false,
      },
    ],
  };
}

describe('writeMcpReportFiles', () => {
  it('writes JSON and markdown reports to nested paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      const paths = writeMcpReportFiles(makeReport(), {
        json: join(dir, 'nested', 'report.json'),
        markdown: join(dir, 'nested', 'report.md'),
      });

      const json = JSON.parse(readFileSync(paths.json, 'utf8')) as McpSweepReport;
      const markdown = readFileSync(paths.markdown, 'utf8');

      expect(json.entries[0]?.server).toBe('io.github.acme/todo-server');
      expect(markdown).toContain('# MCP Server Leaderboard');
      expect(markdown).toContain('| 1 | io.github.acme/todo-server | **93** |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
