import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffMcpSweepReports, writeMcpReportFiles } from './mcp-files.js';
import type { McpReportArtifactManifest, McpSweepReport } from '../types.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

function makeContinuityFixture() {
  const previous = generateKeyPairSync('ed25519');
  const current = generateKeyPairSync('ed25519');
  const previousPublicKeyBase64 = createPublicKey(previous.privateKey)
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const currentPublicKeyBase64 = createPublicKey(current.privateKey)
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const payload = {
    previous: {
      agentId: '7',
      owner: '0xowner',
      publicKeyBase64: previousPublicKeyBase64,
      version: 1,
    },
    current: {
      agentId: '7',
      owner: '0xowner',
      publicKeyBase64: currentPublicKeyBase64,
      version: 2,
    },
  };
  return {
    previousPublicKeyBase64,
    currentPublicKeyBase64,
    receipt: {
      signatureAlgorithm: 'ed25519' as const,
      canonicalization: 'json-stable-v1' as const,
      kind: 'old-to-new-continuity' as const,
      payload,
      payloadSha256: createHash('sha256').update(stableJson(payload)).digest('hex'),
      signatureBase64: sign(null, Buffer.from(stableJson(payload)), previous.privateKey).toString(
        'base64'
      ),
      signedAt: '2026-08-14T00:00:00.000Z',
    },
  };
}

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
    const report = makeReport();

    try {
      const paths = writeMcpReportFiles(
        report,
        {
          json: join(dir, 'reports', 'mcp-report.json'),
          markdown: join(dir, 'reports', 'mcp-report.md'),
          manifest: join(dir, 'reports', 'mcp-report-manifest.json'),
        },
        {
          previousReport: makePreviousReport(),
          publishedBaseUrl: 'https://ax-score.example/reports',
          x402PaidReportOffer: {
            offerDescription: 'Paid AX Report for io.github.acme/todo-server',
            route: 'GET /reports/mcp-report.json',
            scheme: 'exact',
            network: 'base-sepolia',
            verificationTopology: {
              mode: 'named-facilitator',
              facilitatorId: 'coinbase-x402',
            },
            settlementTopology: {
              mode: 'named-facilitator',
              facilitatorId: 'coinbase-x402',
            },
            settlementReceipt: {
              facilitatorId: 'coinbase-x402',
              scheme: 'exact',
              network: 'base-sepolia',
              verify: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
                outcome: 'valid',
                timestamp: '2026-07-13T00:00:01.000Z',
              },
              settle: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
                outcome: 'settled',
                timestamp: '2026-07-13T00:00:05.000Z',
              },
              verificationTimestamp: '2026-07-13T00:00:01.000Z',
              settlementTimestamp: '2026-07-13T00:00:05.000Z',
              outcome: 'settled',
              txHash: '0xsettled',
              amount: '0.50',
              asset: 'USDC',
            },
          },
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
      expect(manifest.hostedUrls?.json).toBe('https://ax-score.example/reports/mcp-report.json');
      expect(manifest.hostedUrls?.manifest).toBe(
        'https://ax-score.example/reports/mcp-report-manifest.json'
      );
      expect(manifest.diff?.removedServers).toEqual(['io.github.acme/removed-server']);
      expect(manifest.diff?.scoreChanges[0]?.delta).toBe(5);
      expect(markdown).toContain('## x402 paid AX Report receipt');
      expect(markdown).toContain('GET /reports/mcp-report.json');
      expect(markdown).toContain('coinbase-x402');
      expect(markdown).toContain('scheme: exact');
      expect(markdown).toContain('base-sepolia');
      expect(markdown).toContain('/verify outcome: valid');
      expect(markdown).toContain('/settle outcome: settled');
      expect(markdown).toContain('settled');
      expect(manifest.x402PaidAxReportReceipt).toMatchObject({
        signatureAlgorithm: 'ed25519',
        canonicalization: 'json-stable-v1',
        payload: expect.objectContaining({
          offerDescription: 'Paid AX Report for io.github.acme/todo-server',
          route: 'GET /reports/mcp-report.json',
          contentDigestSha256: createHash('sha256')
            .update(JSON.stringify(report, null, 2))
            .digest('hex'),
          settlementProvenance: {
            facilitatorId: 'coinbase-x402',
            scheme: 'exact',
            network: 'base-sepolia',
            verificationTopology: {
              mode: 'named-facilitator',
              facilitatorId: 'coinbase-x402',
              outcome: 'valid',
            },
            settlementTopology: {
              mode: 'named-facilitator',
              facilitatorId: 'coinbase-x402',
              outcome: 'settled',
            },
            verificationTimestamp: '2026-07-13T00:00:01.000Z',
            settlementTimestamp: '2026-07-13T00:00:05.000Z',
            outcome: 'settled',
          },
          deliveryUrl: 'https://ax-score.example/reports/mcp-report.json',
        }),
      });
      expect(manifest.x402PaidAxReportReceipt?.payload.settlementReceiptSha256).toBe(
        createHash('sha256')
          .update(
            stableJson({
              facilitatorId: 'coinbase-x402',
              scheme: 'exact',
              network: 'base-sepolia',
              verify: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
                outcome: 'valid',
                timestamp: '2026-07-13T00:00:01.000Z',
              },
              settle: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
                outcome: 'settled',
                timestamp: '2026-07-13T00:00:05.000Z',
              },
              verificationTimestamp: '2026-07-13T00:00:01.000Z',
              settlementTimestamp: '2026-07-13T00:00:05.000Z',
              outcome: 'settled',
              txHash: '0xsettled',
              amount: '0.50',
              asset: 'USDC',
            })
          )
          .digest('hex')
      );
      expect(manifest.x402PaidAxReportReceipt?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.x402PaidAxReportReceipt?.publicKeyBase64).toMatch(/^MCowBQYDK2VwAyEA/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects x402 receipt generation when settlement provenance is incomplete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      expect(() =>
        writeMcpReportFiles(
          makeReport(),
          {
            json: join(dir, 'report.json'),
            markdown: join(dir, 'report.md'),
            manifest: join(dir, 'manifest.json'),
          },
          {
            publishedBaseUrl: 'https://ax-score.example/reports',
            x402PaidReportOffer: {
              offerDescription: 'Paid AX Report',
              route: 'GET /reports/mcp-report.json',
              settlementReceipt: {
                facilitatorId: 'coinbase-x402',
                network: 'base-sepolia',
                outcome: 'settled',
              },
            },
          }
        )
      ).toThrow('settlement provenance');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects x402 receipt generation when settlement provenance changes across retries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      expect(() =>
        writeMcpReportFiles(
          makeReport(),
          {
            json: join(dir, 'report.json'),
            markdown: join(dir, 'report.md'),
            manifest: join(dir, 'manifest.json'),
          },
          {
            publishedBaseUrl: 'https://ax-score.example/reports',
            x402PaidReportOffer: {
              offerDescription: 'Paid AX Report',
              route: 'GET /reports/mcp-report.json',
              scheme: 'exact',
              network: 'base-sepolia',
              settlementReceipt: {
                facilitatorId: 'coinbase-x402',
                scheme: 'exact',
                network: 'base-sepolia',
                verificationTimestamp: '2026-07-13T00:00:01.000Z',
                settlementTimestamp: '2026-07-13T00:00:05.000Z',
                outcome: 'settled',
              },
              expectedSettlementProvenanceSha256: '0'.repeat(64),
            },
          }
        )
      ).toThrow('changed across retries');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects x402 receipt generation when verification and settlement topology drift', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      expect(() =>
        writeMcpReportFiles(
          makeReport(),
          {
            json: join(dir, 'report.json'),
            markdown: join(dir, 'report.md'),
            manifest: join(dir, 'manifest.json'),
          },
          {
            publishedBaseUrl: 'https://ax-score.example/reports',
            x402PaidReportOffer: {
              offerDescription: 'Paid AX Report',
              route: 'GET /reports/mcp-report.json',
              scheme: 'exact',
              network: 'base-sepolia',
              verificationTopology: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
              },
              settlementTopology: {
                mode: 'named-facilitator',
                facilitatorId: 'coinbase-x402',
              },
              settlementReceipt: {
                facilitatorId: 'coinbase-x402',
                scheme: 'exact',
                network: 'solana-devnet',
                verify: {
                  mode: 'named-facilitator',
                  facilitatorId: 'coinbase-x402',
                  outcome: 'valid',
                  timestamp: '2026-07-13T00:00:01.000Z',
                },
                settle: {
                  mode: 'local',
                  outcome: 'settled',
                  timestamp: '2026-07-13T00:00:05.000Z',
                },
                outcome: 'settled',
              },
            },
          }
        )
      ).toThrow('x402 topology drift');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects x402 receipt generation without a durable delivery URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ax-score-mcp-report-'));

    try {
      expect(() =>
        writeMcpReportFiles(
          makeReport(),
          {
            json: join(dir, 'report.json'),
            markdown: join(dir, 'report.md'),
            manifest: join(dir, 'manifest.json'),
          },
          {
            x402PaidReportOffer: {
              offerDescription: 'Paid AX Report',
              route: 'GET /reports/mcp-report.json',
              settlementReceipt: 'receipt-id',
            },
          }
        )
      ).toThrow('durable delivery URL');
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

  it('requires signed ERC-8004 old-to-new Ed25519 continuity before retaining reputation across key rotation', () => {
    const baseEntry = makeReport().entries[0]!;
    const continuity = makeContinuityFixture();
    const previousIdentity = {
      agentId: '7',
      owner: '0xowner',
      identityRegistry: '0xregistry',
      chainId: '8453',
      ed25519PublicKeys: [
        { version: 1, publicKeyBase64: continuity.previousPublicKeyBase64, revoked: false },
      ],
    };
    const currentIdentity = {
      ...previousIdentity,
      ed25519PublicKeys: [
        { version: 2, publicKeyBase64: continuity.currentPublicKeyBase64, revoked: false },
      ],
    };
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 91,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: previousIdentity,
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
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: currentIdentity,
          erc8004KeyContinuityReceipts: [continuity.receipt],
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage[0]).toMatchObject({
      servicesReattested: true,
      identityContinuity: {
        agentBindingChanged: false,
        ed25519KeyChanged: true,
        continuityVerified: true,
        decision: 'signed-continuity',
      },
      reputationWeightRetained: true,
    });
  });

  it('does not retain reputation when an ERC-8004 Ed25519 key changes without continuity or revocation evidence', () => {
    const baseEntry = makeReport().entries[0]!;
    const continuity = makeContinuityFixture();
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: {
            agentId: '7',
            owner: '0xowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [
              { version: 1, publicKeyBase64: continuity.previousPublicKeyBase64, revoked: false },
            ],
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
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: {
            agentId: '7',
            owner: '0xowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [
              { version: 2, publicKeyBase64: continuity.currentPublicKeyBase64, revoked: false },
            ],
          },
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage[0]).toMatchObject({
      servicesReattested: true,
      identityContinuity: {
        ed25519KeyChanged: true,
        continuityVerified: false,
        decision: 'missing-continuity',
      },
      reputationWeightRetained: false,
    });
  });

  it('isolates paid reputation evidence across ERC-721 ownership transfer until the new owner re-attests a payment wallet', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 91,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
          paidOutcomeReceiptCount: 3,
          erc8004Identity: {
            agentId: '7',
            owner: '0xoldowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [],
          },
        },
      ] as McpSweepReport['entries'],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-14T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 96,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: false,
          erc8004Identity: {
            agentId: '7',
            owner: '0xnewowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [],
          },
          erc8004OwnershipEvents: [
            {
              kind: 'transfer',
              agentId: '7',
              from: '0xoldowner',
              to: '0xnewowner',
              txHash: '0xtransfer',
              blockNumber: 100,
              logIndex: 0,
            },
          ],
        },
      ] as McpSweepReport['entries'],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage[0]).toMatchObject({
      reputationWeightRetained: false,
      ownershipContinuity: {
        ownershipTransferred: true,
        preTransferPaidEvidenceIsolated: true,
        currentEpochPaymentWalletReattested: false,
        fullWeightAllowed: false,
      },
    });
    expect(diff.agentUriLineage[0]?.ownershipEpochs).toEqual([
      expect.objectContaining({
        owner: '0xoldowner',
        agentWallet: null,
        paidOutcomeReceiptCount: 3,
        reputationWeight: 'pre-transfer-isolated',
      }),
      expect.objectContaining({
        owner: '0xnewowner',
        agentWallet: null,
        paidOutcomeReceiptCount: 0,
        reputationWeight: 'reduced-until-reattestation',
      }),
    ]);
  });

  it('retains full AX Score weight after transfer only when the new owner sets a payment wallet and services are re-attested', () => {
    const baseEntry = makeReport().entries[0]!;
    const previous: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-13T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 91,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
          paidOutcomeReceiptCount: 3,
          erc8004Identity: {
            agentId: '7',
            owner: '0xoldowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [],
          },
        },
      ] as McpSweepReport['entries'],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      timestamp: '2026-08-14T00:00:00.000Z',
      entries: [
        {
          ...baseEntry,
          score: 96,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: {
            agentId: '7',
            owner: '0xnewowner',
            identityRegistry: '0xregistry',
            chainId: '8453',
            ed25519PublicKeys: [],
          },
          erc8004OwnershipEvents: [
            {
              kind: 'transfer',
              agentId: '7',
              from: '0xoldowner',
              to: '0xnewowner',
              txHash: '0xtransfer',
              blockNumber: 100,
              logIndex: 0,
            },
            {
              kind: 'setAgentWallet',
              agentId: '7',
              owner: '0xnewowner',
              agentWallet: '0xwallet',
              txHash: '0xwallet',
              blockNumber: 101,
              logIndex: 0,
            },
          ],
        },
      ] as McpSweepReport['entries'],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage[0]).toMatchObject({
      reputationWeightRetained: true,
      ownershipContinuity: {
        ownershipTransferred: true,
        preTransferPaidEvidenceIsolated: true,
        currentEpochPaymentWalletReattested: true,
        fullWeightAllowed: true,
      },
    });
    expect(diff.agentUriLineage[0]?.ownershipEpochs?.at(-1)).toMatchObject({
      owner: '0xnewowner',
      agentWallet: '0xwallet',
      reputationWeight: 'full-after-reattestation',
    });
  });

  it('allows explicit signed revocation receipts to retain continuity through an ERC-8004 Ed25519 key rotation', () => {
    const baseEntry = makeReport().entries[0]!;
    const continuity = makeContinuityFixture();
    const previousIdentity = {
      agentId: '7',
      owner: '0xowner',
      identityRegistry: '0xregistry',
      chainId: '8453',
      ed25519PublicKeys: [
        { version: 1, publicKeyBase64: continuity.previousPublicKeyBase64, revoked: false },
      ],
    };
    const currentIdentity = {
      ...previousIdentity,
      ed25519PublicKeys: [
        { version: 2, publicKeyBase64: continuity.currentPublicKeyBase64, revoked: false },
      ],
    };
    const previous: McpSweepReport = {
      ...makeReport(),
      entries: [
        {
          ...baseEntry,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'old-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: previousIdentity,
        },
      ],
    };
    const current: McpSweepReport = {
      ...makeReport(),
      entries: [
        {
          ...baseEntry,
          agentURI: 'https://agent.acme.dev/agent.json',
          registrationSha256: 'new-registration-hash',
          a2aMcpServiceReattested: true,
          erc8004Identity: currentIdentity,
          erc8004KeyContinuityReceipts: [{ ...continuity.receipt, kind: 'explicit-revocation' }],
        },
      ],
    };

    const diff = diffMcpSweepReports(current, previous);

    expect(diff.agentUriLineage[0]).toMatchObject({
      identityContinuity: {
        continuityVerified: true,
        decision: 'explicit-revocation',
      },
      reputationWeightRetained: true,
    });
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
