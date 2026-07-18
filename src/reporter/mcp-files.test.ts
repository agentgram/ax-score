import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffMcpSweepReports, writeMcpReportFiles } from './mcp-files.js';
import type { McpReportArtifactManifest, McpSweepReport } from '../types.js';

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

function makePreviousReport(): McpSweepReport {
  const report = makeReport();
  return {
    ...report,
    timestamp: '2026-07-12T00:00:00.000Z',
    requested: 2,
    scored: 2,
    failed: 0,
    entries: [
      {
        ...report.entries[0]!,
        score: 88,
      },
      {
        server: 'io.github.acme/removed-server',
        serverVersion: '1.0.0',
        score: 70,
        categoryScores: {},
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

  it('writes scheduled artifact manifests with hosted links and historical diffs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      const paths = writeMcpReportFiles(
        makeReport(),
        {
          json: join(dir, 'reports', 'mcp-report.json'),
          markdown: join(dir, 'reports', 'mcp-report.md'),
          manifest: join(dir, 'reports', 'mcp-report-manifest.json'),
        },
        {
          previousReport: makePreviousReport(),
          publishedBaseUrl: 'https://ax-score.example/reports',
        }
      );

      const markdown = readFileSync(paths.markdown, 'utf8');
      const manifest = JSON.parse(
        readFileSync(paths.manifest!, 'utf8')
      ) as McpReportArtifactManifest;

      expect(markdown).toContain('## Hosted artifacts');
      expect(markdown).toContain('https://ax-score.example/reports/mcp-report.md');
      expect(markdown).toContain('## Historical diff');
      expect(markdown).toContain('io.github.acme/todo-server: 88 → 93 (+5)');
      expect(manifest.hostedUrls?.json).toBe(
        'https://ax-score.example/reports/mcp-report.json'
      );
      expect(manifest.hostedUrls?.manifest).toBe(
        'https://ax-score.example/reports/mcp-report-manifest.json'
      );
      expect(manifest.diff?.removedServers).toEqual(['io.github.acme/removed-server']);
      expect(manifest.diff?.scoreChanges[0]?.delta).toBe(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('diffMcpSweepReports', () => {
  it('summarizes added, removed, and score-changed servers', () => {
    const diff = diffMcpSweepReports(makeReport(), makePreviousReport());

    expect(diff.scoredDelta).toBe(-1);
    expect(diff.addedServers).toEqual([]);
    expect(diff.removedServers).toEqual(['io.github.acme/removed-server']);
    expect(diff.scoreChanges).toEqual([
      {
        server: 'io.github.acme/todo-server',
        previousScore: 88,
        currentScore: 93,
        delta: 5,
      },
    ]);
  });
});
