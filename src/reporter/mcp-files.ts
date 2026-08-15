import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { basename, dirname } from 'node:path';
import type {
  Erc8004AgentUriLineageEvidence,
  McpReportArtifactManifest,
  McpReportPublishedUrls,
  McpSemanticVersionReceipt,
  McpSweepDiff,
  McpSweepEntry,
  McpSweepReport,
} from '../types.js';
import { renderJSON } from './json.js';
import { renderMcpLeaderboard } from './mcp.js';

export interface McpReportFilePaths {
  json: string;
  markdown: string;
  manifest?: string;
}

export interface McpReportFileOptions {
  previousReport?: McpSweepReport;
  publishedBaseUrl?: string;
}

function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function normalizePublishedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function buildHostedUrls(
  paths: McpReportFilePaths,
  publishedBaseUrl?: string
): McpReportPublishedUrls | undefined {
  if (!publishedBaseUrl) return undefined;
  const baseUrl = normalizePublishedBaseUrl(publishedBaseUrl);
  return {
    json: new URL(basename(paths.json), baseUrl).toString(),
    markdown: new URL(basename(paths.markdown), baseUrl).toString(),
    ...(paths.manifest ? { manifest: new URL(basename(paths.manifest), baseUrl).toString() } : {}),
  };
}

function isScored(entry: McpSweepEntry): entry is McpSweepEntry & { score: number } {
  return entry.score !== null;
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function signSemanticVersionReceipt(
  payload: Omit<McpSemanticVersionReceipt, 'signature'>
): McpSemanticVersionReceipt {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const signedAt = new Date().toISOString();
  const signaturePayload = { ...payload, signedAt };
  const canonicalPayload = stableJson(signaturePayload);

  return {
    ...payload,
    signature: {
      signatureAlgorithm: 'ed25519',
      canonicalization: 'json-stable-v1',
      payloadSha256: sha256(signaturePayload),
      signatureBase64: sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64'),
      publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      signedAt,
    },
  };
}

function detectSemanticVersionReceipts(
  currentByServer: Map<string, McpSweepEntry>,
  previousByServer: Map<string, McpSweepEntry>
): McpSemanticVersionReceipt[] {
  return [...currentByServer.entries()]
    .filter(([server]) => previousByServer.has(server))
    .flatMap(([server, currentEntry]) => {
      const previousEntry = previousByServer.get(server)!;
      const previousVersion = previousEntry.serverVersion;
      const currentVersion = currentEntry.serverVersion;
      const previousFingerprint = previousEntry.semanticVersionFingerprint;
      const currentFingerprint = currentEntry.semanticVersionFingerprint;
      if (!previousVersion || !currentVersion || previousVersion === currentVersion) return [];
      if (!previousFingerprint || !currentFingerprint) return [];

      const previousCanonicalSha256 = previousFingerprint.canonicalSha256;
      const currentCanonicalSha256 = currentFingerprint.canonicalSha256;
      const classification: McpSemanticVersionReceipt['classification'] =
        previousCanonicalSha256 === currentCanonicalSha256
          ? 'version-only-increment'
          : 'semantic-change';
      const rationale =
        classification === 'version-only-increment'
          ? `Registry version changed from ${previousVersion} to ${currentVersion}, but canonical title/description/schema/remotes are unchanged.`
          : `Registry version changed from ${previousVersion} to ${currentVersion} and canonical title/description/schema/remotes changed.`;

      return [
        signSemanticVersionReceipt({
          server,
          previousVersion,
          currentVersion,
          previousCanonicalSha256,
          currentCanonicalSha256,
          classification,
          rationale,
        }),
      ];
    })
    .sort((a, b) => a.server.localeCompare(b.server));
}

function detectAgentUriLineage(
  currentByServer: Map<string, McpSweepEntry>,
  previousByServer: Map<string, McpSweepEntry>
): Erc8004AgentUriLineageEvidence[] {
  return [...currentByServer.entries()]
    .filter(([server]) => previousByServer.has(server))
    .flatMap(([server, currentEntry]) => {
      const previousEntry = previousByServer.get(server)!;
      const previousAgentURI = previousEntry.agentURI ?? null;
      const currentAgentURI = currentEntry.agentURI ?? null;
      const previousRegistrationSha256 = previousEntry.registrationSha256 ?? null;
      const currentRegistrationSha256 = currentEntry.registrationSha256 ?? null;
      if (!previousAgentURI && !currentAgentURI && !previousRegistrationSha256 && !currentRegistrationSha256) return [];
      const uriChanged = previousAgentURI !== currentAgentURI;
      const hashChanged = previousRegistrationSha256 !== currentRegistrationSha256;
      if (!uriChanged && !hashChanged) return [];
      const servicesReattested = currentEntry.a2aMcpServiceReattested === true;
      const transition: Erc8004AgentUriLineageEvidence['transition'] = uriChanged
        ? 'agent-uri-changed'
        : 'registration-hash-changed';
      return [{
        server,
        previousAgentURI,
        currentAgentURI,
        previousRegistrationSha256,
        currentRegistrationSha256,
        servicesReattested,
        reputationWeightRetained: servicesReattested,
        transition,
      }];
    })
    .sort((a, b) => a.server.localeCompare(b.server));
}

export function diffMcpSweepReports(
  current: McpSweepReport,
  previous: McpSweepReport
): McpSweepDiff {
  const currentByServer = new Map(current.entries.map((entry) => [entry.server, entry]));
  const previousByServer = new Map(previous.entries.map((entry) => [entry.server, entry]));
  const semanticVersionReceipts = detectSemanticVersionReceipts(currentByServer, previousByServer);
  const semanticVersionReceiptByServer = new Map(
    semanticVersionReceipts.map((receipt) => [receipt.server, receipt])
  );
  const addedServers = current.entries
    .filter((entry) => !previousByServer.has(entry.server))
    .map((entry) => entry.server)
    .sort();
  const removedServers = previous.entries
    .filter((entry) => !currentByServer.has(entry.server))
    .map((entry) => entry.server)
    .sort();
  const scoreChanges = current.entries
    .filter((entry) => previousByServer.has(entry.server))
    .map((entry) => {
      const previousEntry = previousByServer.get(entry.server)!;
      const delta = isScored(entry) && isScored(previousEntry) ? entry.score - previousEntry.score : null;
      const semanticVersionReceipt = semanticVersionReceiptByServer.get(entry.server);
      return {
        server: entry.server,
        previousScore: previousEntry.score,
        currentScore: entry.score,
        delta,
        ...(semanticVersionReceipt ? { semanticVersionReceipt } : {}),
      };
    })
    .filter(
      (entry) =>
        (entry.delta !== 0 || entry.semanticVersionReceipt) &&
        (entry.previousScore !== null || entry.currentScore !== null)
    )
    .sort((a, b) => {
      const aAbs = a.delta === null ? Number.POSITIVE_INFINITY : Math.abs(a.delta);
      const bAbs = b.delta === null ? Number.POSITIVE_INFINITY : Math.abs(b.delta);
      return bAbs - aAbs || a.server.localeCompare(b.server);
    });

  return {
    previousTimestamp: previous.timestamp,
    currentTimestamp: current.timestamp,
    requestedDelta: current.requested - previous.requested,
    scoredDelta: current.scored - previous.scored,
    failedDelta: current.failed - previous.failed,
    addedServers,
    removedServers,
    scoreChanges,
    semanticVersionReceipts,
    agentUriLineage: detectAgentUriLineage(currentByServer, previousByServer),
    endpointDeprecations: [],
  };
}

/** Write the bounded MCP report as both machine-readable JSON and markdown. */
export function writeMcpReportFiles(
  report: McpSweepReport,
  paths: McpReportFilePaths,
  options: McpReportFileOptions = {}
): McpReportFilePaths {
  const diff = options.previousReport ? diffMcpSweepReports(report, options.previousReport) : undefined;
  const hostedUrls = buildHostedUrls(paths, options.publishedBaseUrl);
  writeTextFile(paths.json, renderJSON(report));
  writeTextFile(paths.markdown, renderMcpLeaderboard(report, { diff, hostedUrls }));
  if (paths.manifest) {
    const manifest: McpReportArtifactManifest = {
      generatedAt: new Date().toISOString(),
      registryUrl: report.registryUrl,
      reportTimestamp: report.timestamp,
      files: {
        json: paths.json,
        markdown: paths.markdown,
        manifest: paths.manifest,
      },
      ...(hostedUrls ? { hostedUrls } : {}),
      ...(diff ? { diff } : {}),
    };
    writeTextFile(paths.manifest, renderJSON(manifest));
  }
  return paths;
}