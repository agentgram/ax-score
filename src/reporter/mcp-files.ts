import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { basename, dirname } from 'node:path';
import type {
  Erc8004AgentUriLineageEvidence,
  Erc8004IdentityContinuityEvidence,
  Erc8004KeyContinuityReceipt,
  Erc8004OwnershipContinuityEvidence,
  Erc8004OwnershipEpochEvidence,
  Erc8004OwnershipEvent,
  McpReportArtifactManifest,
  McpReportPublishedUrls,
  McpSemanticVersionReceipt,
  McpSweepDiff,
  McpSweepEntry,
  McpSweepReport,
  McpX402PaidAxReportOffer,
  McpX402PaidAxReportReceipt,
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
  x402PaidReportOffer?: McpX402PaidAxReportOffer;
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

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function signX402PaidAxReportReceipt(args: {
  report: McpSweepReport;
  renderedJson: string;
  offer: McpX402PaidAxReportOffer;
  hostedUrls?: McpReportPublishedUrls;
}): McpX402PaidAxReportReceipt {
  const deliveryUrl = args.offer.deliveryUrl ?? args.hostedUrls?.json;
  if (!deliveryUrl) {
    throw new Error(
      'x402 paid AX Report receipts require a durable delivery URL; provide publishedBaseUrl or offer.deliveryUrl.'
    );
  }

  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const payload = {
    offerDescription: args.offer.offerDescription,
    route: args.offer.route,
    contentDigestSha256: sha256Text(args.renderedJson),
    settlementReceipt: args.offer.settlementReceipt,
    settlementReceiptSha256: sha256(args.offer.settlementReceipt),
    deliveryUrl,
    reportTimestamp: args.report.timestamp,
    axScoreVersion: args.report.version,
  };
  const canonicalPayload = stableJson(payload);

  return {
    signatureAlgorithm: 'ed25519',
    canonicalization: 'json-stable-v1',
    payload,
    payloadSha256: sha256(payload),
    signatureBase64: sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64'),
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    signedAt: new Date().toISOString(),
  };
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

function activeEd25519Keys(entry: McpSweepEntry): Array<{ version?: number | null; publicKeyBase64: string }> {
  return (entry.erc8004Identity?.ed25519PublicKeys ?? [])
    .filter((key) => key.revoked !== true)
    .filter((key) => typeof key.publicKeyBase64 === 'string' && key.publicKeyBase64.length > 0)
    .sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
}

function sameAgentBinding(previousEntry: McpSweepEntry, currentEntry: McpSweepEntry): boolean {
  const previous = previousEntry.erc8004Identity;
  const current = currentEntry.erc8004Identity;
  if (!previous || !current) return true;
  return (
    previous.agentId === current.agentId &&
    previous.owner === current.owner &&
    previous.identityRegistry === current.identityRegistry &&
    previous.chainId === current.chainId
  );
}

function verifyContinuityReceipt(args: {
  receipt: Erc8004KeyContinuityReceipt;
  previousEntry: McpSweepEntry;
  currentEntry: McpSweepEntry;
  previousKeyBase64: string;
  currentKeyBase64: string;
}): boolean {
  if (args.receipt.signatureAlgorithm !== 'ed25519') return false;
  if (args.receipt.canonicalization !== 'json-stable-v1') return false;
  if (args.receipt.kind !== 'old-to-new-continuity' && args.receipt.kind !== 'explicit-revocation') return false;
  if (args.receipt.payloadSha256 !== sha256(args.receipt.payload)) return false;

  const previousIdentity = args.previousEntry.erc8004Identity;
  const currentIdentity = args.currentEntry.erc8004Identity;
  if (!previousIdentity || !currentIdentity) return false;
  const previousKey = activeEd25519Keys(args.previousEntry).find(
    (key) => key.publicKeyBase64 === args.previousKeyBase64
  );
  const currentKey = activeEd25519Keys(args.currentEntry).find(
    (key) => key.publicKeyBase64 === args.currentKeyBase64
  );
  if (!previousKey || !currentKey) return false;
  if (args.receipt.payload.previous.agentId !== previousIdentity.agentId) return false;
  if (args.receipt.payload.previous.owner !== previousIdentity.owner) return false;
  if (args.receipt.payload.previous.publicKeyBase64 !== args.previousKeyBase64) return false;
  if (args.receipt.payload.previous.version !== (previousKey.version ?? null)) return false;
  if (args.receipt.payload.current.agentId !== currentIdentity.agentId) return false;
  if (args.receipt.payload.current.owner !== currentIdentity.owner) return false;
  if (args.receipt.payload.current.publicKeyBase64 !== args.currentKeyBase64) return false;
  if (args.receipt.payload.current.version !== (currentKey.version ?? null)) return false;

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(args.previousKeyBase64, 'base64'),
      type: 'spki',
      format: 'der',
    });
    return verify(
      null,
      Buffer.from(stableJson(args.receipt.payload)),
      publicKey,
      Buffer.from(args.receipt.signatureBase64, 'base64')
    );
  } catch {
    return false;
  }
}

function evaluateIdentityContinuity(
  previousEntry: McpSweepEntry,
  currentEntry: McpSweepEntry
): Erc8004IdentityContinuityEvidence | undefined {
  const previousKeys = activeEd25519Keys(previousEntry);
  const currentKeys = activeEd25519Keys(currentEntry);
  if (previousKeys.length === 0 && currentKeys.length === 0) return undefined;
  const previousKey = previousKeys.at(-1)?.publicKeyBase64 ?? null;
  const currentKey = currentKeys.at(-1)?.publicKeyBase64 ?? null;
  const ed25519KeyChanged = previousKey !== currentKey;
  const agentBindingChanged = !sameAgentBinding(previousEntry, currentEntry);

  if (!ed25519KeyChanged) {
    return { agentBindingChanged, ed25519KeyChanged, continuityVerified: true, decision: 'unchanged' };
  }
  if (!previousKey || !currentKey || agentBindingChanged) {
    return {
      agentBindingChanged,
      ed25519KeyChanged,
      continuityVerified: false,
      decision: 'missing-continuity',
    };
  }

  const receipt = (currentEntry.erc8004KeyContinuityReceipts ?? []).find((candidate) =>
    verifyContinuityReceipt({
      receipt: candidate,
      previousEntry,
      currentEntry,
      previousKeyBase64: previousKey,
      currentKeyBase64: currentKey,
    })
  );

  return {
    agentBindingChanged,
    ed25519KeyChanged,
    continuityVerified: Boolean(receipt),
    decision: receipt?.kind === 'explicit-revocation' ? 'explicit-revocation' : receipt ? 'signed-continuity' : 'missing-continuity',
    ...(receipt ? { receipt } : {}),
  };
}

function eventCursor(event: Erc8004OwnershipEvent): string {
  return [event.txHash ?? 'unknown-tx', event.blockNumber ?? 'unknown-block', event.logIndex ?? 'unknown-log'].join(':');
}

function sortOwnershipEvents(events: Erc8004OwnershipEvent[]): Erc8004OwnershipEvent[] {
  return [...events].sort((a, b) => {
    const blockDelta = (a.blockNumber ?? Number.MAX_SAFE_INTEGER) - (b.blockNumber ?? Number.MAX_SAFE_INTEGER);
    if (blockDelta !== 0) return blockDelta;
    const logDelta = (a.logIndex ?? Number.MAX_SAFE_INTEGER) - (b.logIndex ?? Number.MAX_SAFE_INTEGER);
    if (logDelta !== 0) return logDelta;
    return eventCursor(a).localeCompare(eventCursor(b));
  });
}

function attributionEvidenceCount(entry: McpSweepEntry): number {
  return Math.max(entry.paidOutcomeReceiptCount ?? 0, entry.reputationEvidenceCount ?? 0);
}

function detectOwnershipContinuity(
  previousEntry: McpSweepEntry,
  currentEntry: McpSweepEntry,
  servicesReattested: boolean
):
  | {
      ownershipEpochs: Erc8004OwnershipEpochEvidence[];
      ownershipContinuity: Erc8004OwnershipContinuityEvidence;
    }
  | undefined {
  const previousOwner = previousEntry.erc8004Identity?.owner ?? null;
  const currentOwner = currentEntry.erc8004Identity?.owner ?? null;
  const agentId = currentEntry.erc8004Identity?.agentId ?? previousEntry.erc8004Identity?.agentId ?? null;
  const events = sortOwnershipEvents(currentEntry.erc8004OwnershipEvents ?? []);
  const transferEvents = events.filter((event) => event.kind === 'transfer');
  const walletEvents = events.filter(
    (event) => event.kind === 'setAgentWallet' || event.kind === 'unsetAgentWallet'
  );
  const ownershipTransferred = transferEvents.length > 0 || (!!previousOwner && !!currentOwner && previousOwner !== currentOwner);

  if (!ownershipTransferred && walletEvents.length === 0) return undefined;

  const preTransferPaidEvidenceIsolated = ownershipTransferred && attributionEvidenceCount(previousEntry) > 0;
  const epochs: Erc8004OwnershipEpochEvidence[] = [
    {
      agentId,
      owner: previousOwner,
      agentWallet: null,
      startEvent: null,
      endEvent: null,
      paidOutcomeReceiptCount: preTransferPaidEvidenceIsolated ? attributionEvidenceCount(previousEntry) : 0,
      reputationWeight: preTransferPaidEvidenceIsolated
        ? 'pre-transfer-isolated'
        : 'reduced-until-reattestation',
    },
  ];

  for (const event of events) {
    const currentEpoch = epochs.at(-1)!;
    if (event.kind === 'transfer') {
      currentEpoch.endEvent = eventCursor(event);
      epochs.push({
        agentId: event.agentId ?? agentId,
        owner: event.to ?? currentOwner,
        agentWallet: null,
        startEvent: eventCursor(event),
        endEvent: null,
        paidOutcomeReceiptCount: 0,
        reputationWeight: 'reduced-until-reattestation',
      });
      continue;
    }
    if (event.kind === 'setAgentWallet') {
      currentEpoch.agentWallet = event.agentWallet ?? null;
      continue;
    }
    currentEpoch.agentWallet = null;
  }

  if (ownershipTransferred && transferEvents.length === 0 && epochs.length === 1) {
    epochs[0]!.endEvent = 'owner-changed-without-transfer-log';
    epochs.push({
      agentId,
      owner: currentOwner,
      agentWallet: null,
      startEvent: 'owner-changed-without-transfer-log',
      endEvent: null,
      paidOutcomeReceiptCount: 0,
      reputationWeight: 'reduced-until-reattestation',
    });
  }

  const currentEpoch = epochs.at(-1)!;
  const currentEpochPaymentWalletReattested = Boolean(currentEpoch.agentWallet);
  const fullWeightAllowed = servicesReattested && (!ownershipTransferred || currentEpochPaymentWalletReattested);
  currentEpoch.reputationWeight = fullWeightAllowed
    ? 'full-after-reattestation'
    : 'reduced-until-reattestation';

  return {
    ownershipEpochs: epochs,
    ownershipContinuity: {
      ownershipTransferred,
      paymentWalletChanged: walletEvents.length > 0,
      preTransferPaidEvidenceIsolated,
      currentEpochPaymentWalletReattested,
      fullWeightAllowed,
      events,
    },
  };
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
      const servicesReattested = currentEntry.a2aMcpServiceReattested === true;
      const identityContinuity = evaluateIdentityContinuity(previousEntry, currentEntry);
      const identityAllowsRetention =
        !identityContinuity || !identityContinuity.ed25519KeyChanged || identityContinuity.continuityVerified;
      const ownershipEvidence = detectOwnershipContinuity(previousEntry, currentEntry, servicesReattested);
      if (!uriChanged && !hashChanged && !ownershipEvidence) return [];
      const transition: Erc8004AgentUriLineageEvidence['transition'] = uriChanged
        ? 'agent-uri-changed'
        : hashChanged
          ? 'registration-hash-changed'
          : 'ownership-epoch-changed';
      return [{
        server,
        previousAgentURI,
        currentAgentURI,
        previousRegistrationSha256,
        currentRegistrationSha256,
        servicesReattested,
        reputationWeightRetained:
          servicesReattested && identityAllowsRetention && (ownershipEvidence?.ownershipContinuity.fullWeightAllowed ?? true),
        ...(previousEntry.erc8004Identity ? { previousIdentity: previousEntry.erc8004Identity } : {}),
        ...(currentEntry.erc8004Identity ? { currentIdentity: currentEntry.erc8004Identity } : {}),
        ...(identityContinuity ? { identityContinuity } : {}),
        ...(ownershipEvidence ? ownershipEvidence : {}),
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
  const renderedJson = renderJSON(report);
  const x402PaidAxReportReceipt = options.x402PaidReportOffer
    ? signX402PaidAxReportReceipt({
        report,
        renderedJson,
        offer: options.x402PaidReportOffer,
        hostedUrls,
      })
    : undefined;
  writeTextFile(paths.json, renderedJson);
  writeTextFile(paths.markdown, renderMcpLeaderboard(report, { diff, hostedUrls, x402PaidAxReportReceipt }));
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
      ...(x402PaidAxReportReceipt ? { x402PaidAxReportReceipt } : {}),
    };
    writeTextFile(paths.manifest, renderJSON(manifest));
  }
  return paths;
}