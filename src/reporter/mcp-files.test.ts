import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildX402PaidReportDeliveryEvidence,
  buildX402PaidReportDeliveryReceipt,
  diffMcpSweepReports,
  writeMcpReportFiles,
} from './mcp-files.js';
import type {
  McpReportArtifactManifest,
  McpSweepReport,
  X402PaidReportDeliveryEvidenceExport,
} from '../types.js';

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

  it('exports partner evidence that binds x402 purchase receipts to durable report delivery outcomes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      const receipt = buildX402PaidReportDeliveryReceipt({
        reportId: 'mcp-report-2026-08-20',
        buyer: '0xbuyer',
        seller: '0xseller',
        offer: {
          resource: 'https://ax-score.example/reports/mcp-report.json',
          amount: '0.25',
          currency: 'USDC',
          network: 'base',
        },
        settlementReceipt: {
          transactionHash: '0xsettlement',
          facilitator: 'https://facilitator.example',
          settledAt: '2026-08-20T00:00:00.000Z',
        },
        deliveryUrl: 'https://ax-score.example/reports/mcp-report.json',
        accessOutcome: {
          status: 'delivered',
          httpStatus: 200,
          accessedAt: '2026-08-20T00:00:05.000Z',
          contentSha256: 'a'.repeat(64),
        },
        observedAt: '2026-08-20T00:00:06.000Z',
      });

      const paths = writeMcpReportFiles(
        makeReport(),
        {
          json: join(dir, 'reports', 'mcp-report.json'),
          markdown: join(dir, 'reports', 'mcp-report.md'),
          manifest: join(dir, 'reports', 'mcp-report-manifest.json'),
        },
        {
          x402PaidDeliveryReceipts: [receipt],
        }
      );

      const manifest = JSON.parse(
        readFileSync(paths.manifest!, 'utf8')
      ) as McpReportArtifactManifest;
      const evidence = manifest.x402PaidDeliveryEvidence as X402PaidReportDeliveryEvidenceExport;

      expect(receipt.offerSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.settlementReceiptSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt.deliveryUrl).toBe('https://ax-score.example/reports/mcp-report.json');
      expect(evidence.summary).toEqual({
        totalPurchases: 1,
        delivered: 1,
        blocked: 0,
        failed: 0,
        deliveryRate: 1,
      });
      expect(evidence.receipts[0]).toMatchObject({
        reportId: 'mcp-report-2026-08-20',
        buyer: '0xbuyer',
        settlementReceiptSha256: receipt.settlementReceiptSha256,
        accessOutcome: { status: 'delivered', httpStatus: 200 },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildX402PaidReportDeliveryEvidence', () => {
  it('aggregates delivered, blocked, and failed access outcomes for external partners', () => {
    const receipts = [
      buildX402PaidReportDeliveryReceipt({
        reportId: 'delivered-report',
        offer: { resource: 'https://ax.example/delivered.json', amount: '1', currency: 'USDC' },
        settlementReceipt: { transactionHash: '0x1' },
        deliveryUrl: 'https://ax.example/delivered.json',
        accessOutcome: { status: 'delivered', httpStatus: 200, accessedAt: '2026-08-20T00:00:00.000Z' },
      }),
      buildX402PaidReportDeliveryReceipt({
        reportId: 'blocked-report',
        offer: { resource: 'https://ax.example/blocked.json', amount: '1', currency: 'USDC' },
        settlementReceipt: { transactionHash: '0x2' },
        deliveryUrl: 'https://ax.example/blocked.json',
        accessOutcome: { status: 'blocked', httpStatus: 403, error: 'signature required' },
      }),
      buildX402PaidReportDeliveryReceipt({
        reportId: 'failed-report',
        offer: { resource: 'https://ax.example/failed.json', amount: '1', currency: 'USDC' },
        settlementReceipt: { transactionHash: '0x3' },
        deliveryUrl: 'https://ax.example/failed.json',
        accessOutcome: { status: 'failed', httpStatus: 500, error: 'origin unavailable' },
      }),
    ];

    const evidence = buildX402PaidReportDeliveryEvidence(receipts, '2026-08-20T00:00:10.000Z');

    expect(evidence.generatedAt).toBe('2026-08-20T00:00:10.000Z');
    expect(evidence.summary).toEqual({
      totalPurchases: 3,
      delivered: 1,
      blocked: 1,
      failed: 1,
      deliveryRate: 1 / 3,
    });
    expect(evidence.receipts.map((receipt) => receipt.reportId)).toEqual([
      'blocked-report',
      'delivered-report',
      'failed-report',
    ]);
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

  it('records ERC-8004 agent URI lineage and limits reputation retention until services are re-attested', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 91,
          agentURI: 'https://agent.acme.dev/old-agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
        },
      ],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-14T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 96,
          agentURI: 'https://agent.acme.dev/new-agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: false,
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage).toEqual([
      {
        server: 'io.github.acme/todo-server',
        previousAgentURI: 'https://agent.acme.dev/old-agent.json',
        currentAgentURI: 'https://agent.acme.dev/new-agent.json',
        previousRegistrationSha256: 'old-registration-hash',
        currentRegistrationSha256: 'new-registration-hash',
        servicesReattested: false,
        reputationWeightRetained: false,
        transition: 'agent-uri-changed',
      },
    ]);
  });

  it('flags adjacent Registry version-only increments with a signed semantic receipt', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          serverVersion: '1.2.3',
          semanticVersionFingerprint: {
            canonicalization: 'mcp-registry-semantic-v1',
            fields: ['title', 'description', 'schema', 'remotes'],
            canonicalSha256: 'same-semantic-hash',
          },
        },
      ],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-14T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          serverVersion: '1.2.4',
          semanticVersionFingerprint: {
            canonicalization: 'mcp-registry-semantic-v1',
            fields: ['title', 'description', 'schema', 'remotes'],
            canonicalSha256: 'same-semantic-hash',
          },
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.semanticVersionReceipts).toHaveLength(1);
    expect(diff.semanticVersionReceipts[0]).toMatchObject({
      server: 'io.github.acme/todo-server',
      previousVersion: '1.2.3',
      currentVersion: '1.2.4',
      classification: 'version-only-increment',
      previousCanonicalSha256: 'same-semantic-hash',
      currentCanonicalSha256: 'same-semantic-hash',
    });
    expect(diff.semanticVersionReceipts[0]?.rationale).toContain(
      'title/description/schema/remotes are unchanged'
    );
    expect(diff.semanticVersionReceipts[0]?.signature.signatureAlgorithm).toBe('ed25519');
    expect(diff.semanticVersionReceipts[0]?.signature.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(diff.scoreChanges[0]?.semanticVersionReceipt?.classification).toBe(
      'version-only-increment'
    );
  });

  it('signs a semantic-change receipt when adjacent Registry versions change canonical fields', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          serverVersion: '1.2.3',
          semanticVersionFingerprint: {
            canonicalization: 'mcp-registry-semantic-v1',
            fields: ['title', 'description', 'schema', 'remotes'],
            canonicalSha256: 'old-semantic-hash',
          },
        },
      ],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-14T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          serverVersion: '1.3.0',
          semanticVersionFingerprint: {
            canonicalization: 'mcp-registry-semantic-v1',
            fields: ['title', 'description', 'schema', 'remotes'],
            canonicalSha256: 'new-semantic-hash',
          },
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.semanticVersionReceipts[0]).toMatchObject({
      classification: 'semantic-change',
      rationale:
        'Registry version changed from 1.2.3 to 1.3.0 and canonical title/description/schema/remotes changed.',
    });
  });


  it('omits unchanged null scores while preserving transitions into and out of scored state', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      requested: 3,
      scored: 1,
      failed: 2,
      entries: [
        {
          ...baseEntry,
          server: 'io.github.acme/still-unscored',
          score: null,
          categoryScores: {},
        },
        {
          ...baseEntry,
          server: 'io.github.acme/recovered',
          score: null,
          categoryScores: {},
        },
        {
          ...baseEntry,
          server: 'io.github.acme/regressed',
          score: 42,
        },
      ],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      requested: 3,
      scored: 1,
      failed: 2,
      entries: [
        {
          ...baseEntry,
          server: 'io.github.acme/still-unscored',
          score: null,
          categoryScores: {},
        },
        {
          ...baseEntry,
          server: 'io.github.acme/recovered',
          score: 77,
        },
        {
          ...baseEntry,
          server: 'io.github.acme/regressed',
          score: null,
          categoryScores: {},
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.scoreChanges).toEqual([
      {
        server: 'io.github.acme/recovered',
        previousScore: null,
        currentScore: 77,
        delta: null,
      },
      {
        server: 'io.github.acme/regressed',
        previousScore: 42,
        currentScore: null,
        delta: null,
      },
    ]);
  });
});