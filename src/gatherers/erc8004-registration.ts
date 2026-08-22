import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type {
  AgentRegistrationService,
  AgentServiceBindingEvidence,
  AgentValidationRequest,
  AgentValidationResponse,
  Erc8004FeedbackEventPointer,
  Erc8004FeedbackEventStorageCompletenessReceipt,
  Erc8004FeedbackEventStorageVerdictPayload,
  Erc8004FeedbackStorageSnapshot,
  Erc8004FeedbackFetchDecisionPayload,
  Erc8004FeedbackFetchDecisionReceipt,
  Erc8004FeedbackRedirectEvidence,
  Erc8004FeedbackResolutionEvidence,
  Erc8004AgentIdentityRef,
  Erc8004AgentIdentityEvidence,
  Erc8004KeyContinuityReceipt,
  Erc8004VersionedEd25519PublicKey,
  Erc8004ValidationLineageEvidence,
  Erc8004ValidationResponseEvidence,
  McpConfig,
  McpServerRecord,
} from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { RemoteProbe } from './mcp-remote.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';
import { isPrivateHost } from './mcp-remote.js';

const USER_AGENT = 'AX-Score/1.0 (erc8004-registration-binding)';
const MAX_FEEDBACK_REDIRECTS = 5;

export interface AgentRegistrationDocument {
  services?: AgentRegistrationService[];
  validationRequests?: AgentValidationRequest[];
  identity?: Erc8004AgentIdentityEvidence;
  keyContinuityReceipts?: Erc8004KeyContinuityReceipt[];
}
export interface Erc8004RegistrationGatherResult extends GatherResult {
  agentURI: string | null;
  fetched: boolean;
  error: string | null;
  registration: AgentRegistrationDocument | null;
  registrationSha256: string | null;
  identity: Erc8004AgentIdentityEvidence | null;
  keyContinuityReceipts: Erc8004KeyContinuityReceipt[];
  bindings: AgentServiceBindingEvidence[];
  validationLineage: Erc8004ValidationLineageEvidence[];
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

function sha256Registration(document: unknown): string {
  return createHash('sha256').update(stableJson(document)).digest('hex');
}

function normalizeAgentURI(server: McpServerRecord): string | null {
  const identity = server.erc8004;
  const uri = identity?.agentURI ?? identity?.agentUri ?? server.agentURI ?? server.agentUri;
  return typeof uri === 'string' && uri.length > 0 ? uri : null;
}

function identityRef(server: McpServerRecord): Erc8004AgentIdentityRef {
  return server.erc8004 ?? { agentURI: server.agentURI, agentUri: server.agentUri };
}

function normalizeIdentityValue(value: string | number | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function normalizePublicKeyVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

function normalizeEd25519PublicKeys(document: unknown): Erc8004VersionedEd25519PublicKey[] {
  if (!document || typeof document !== 'object') return [];
  const record = document as Record<string, unknown>;
  const identity = record['identity'];
  const identityRecord = identity && typeof identity === 'object' ? identity as Record<string, unknown> : {};
  const rawKeys = record['ed25519PublicKeys'] ?? record['publicKeys'] ?? identityRecord['ed25519PublicKeys'] ?? identityRecord['publicKeys'];
  if (!Array.isArray(rawKeys)) return [];
  return rawKeys
    .filter((key): key is Record<string, unknown> => Boolean(key) && typeof key === 'object')
    .flatMap((key) => {
      const algorithm = typeof key['algorithm'] === 'string' ? key['algorithm'].toLowerCase() : 'ed25519';
      if (algorithm !== 'ed25519') return [];
      const publicKeyBase64 = normalizeString(key['publicKeyBase64'] ?? key['publicKey'] ?? key['publicKeyDerBase64']);
      if (!publicKeyBase64) return [];
      return [{
        version: normalizePublicKeyVersion(key['version']),
        publicKeyBase64,
        keyId: normalizeString(key['keyId'] ?? key['id']) ?? null,
        revoked: key['revoked'] === true,
      }];
    })
    .sort((a, b) => (a.version ?? -1) - (b.version ?? -1) || a.publicKeyBase64.localeCompare(b.publicKeyBase64));
}

function normalizeAgentIdentity(document: unknown, server: McpServerRecord): Erc8004AgentIdentityEvidence {
  const docRecord = document && typeof document === 'object' ? document as Record<string, unknown> : {};
  const docIdentity = docRecord['identity'];
  const identityRecord = docIdentity && typeof docIdentity === 'object' ? docIdentity as Record<string, unknown> : {};
  const registryIdentity = identityRef(server);
  return {
    agentId: normalizeIdentityValue((identityRecord['agentId'] ?? docRecord['agentId'] ?? registryIdentity.agentId) as string | number | undefined),
    owner: normalizeIdentityValue((identityRecord['owner'] ?? identityRecord['ownerAddress'] ?? docRecord['owner'] ?? docRecord['ownerAddress'] ?? registryIdentity.owner ?? registryIdentity.ownerAddress) as string | number | undefined),
    identityRegistry: normalizeIdentityValue((identityRecord['identityRegistry'] ?? docRecord['identityRegistry'] ?? registryIdentity.identityRegistry) as string | number | undefined),
    chainId: normalizeIdentityValue((identityRecord['chainId'] ?? docRecord['chainId'] ?? registryIdentity.chainId) as string | number | undefined),
    ed25519PublicKeys: normalizeEd25519PublicKeys(document),
  };
}

function keyContinuityReceipts(document: unknown): Erc8004KeyContinuityReceipt[] {
  if (!document || typeof document !== 'object') return [];
  const rawReceipts = (document as Record<string, unknown>)['keyContinuityReceipts'] ?? (document as Record<string, unknown>)['continuityReceipts'] ?? (document as Record<string, unknown>)['keyRotationReceipts'];
  if (!Array.isArray(rawReceipts)) return [];
  return rawReceipts
    .filter((receipt): receipt is Record<string, unknown> => Boolean(receipt) && typeof receipt === 'object')
    .flatMap((receipt) => {
      const payload = receipt['payload'];
      const kind = receipt['kind'];
      const signatureAlgorithm = receipt['signatureAlgorithm'];
      const canonicalization = receipt['canonicalization'];
      const payloadSha256 = normalizeString(receipt['payloadSha256']);
      const signatureBase64 = normalizeString(receipt['signatureBase64']);
      const signedAt = normalizeString(receipt['signedAt']);
      if (!payload || typeof payload !== 'object' || (kind !== 'old-to-new-continuity' && kind !== 'explicit-revocation') || signatureAlgorithm !== 'ed25519' || canonicalization !== 'json-stable-v1' || !payloadSha256 || !signatureBase64 || !signedAt) return [];
      return [{ signatureAlgorithm, canonicalization, kind, payload: payload as Erc8004KeyContinuityReceipt['payload'], payloadSha256, signatureBase64, signedAt }];
    });
}

function registrableDomain(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isPrivateHost(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return null;
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return host;
  return parts.slice(-2).join('.');
}

function domainControl(agentUriHost: string | null, endpointHost: string): AgentServiceBindingEvidence['domainControl'] {
  if (!agentUriHost) return 'unverified';
  const normalizedAgentHost = agentUriHost.toLowerCase();
  const normalizedEndpointHost = endpointHost.toLowerCase();
  if (normalizedAgentHost === normalizedEndpointHost) return 'same-host';
  const agentDomain = registrableDomain(normalizedAgentHost);
  const endpointDomain = registrableDomain(normalizedEndpointHost);
  if (agentDomain && endpointDomain && agentDomain === endpointDomain) return 'same-registrable-domain';
  return 'mismatch';
}

function registrationServices(document: unknown): AgentRegistrationService[] {
  if (!document || typeof document !== 'object') return [];
  const rawServices = (document as Record<string, unknown>)['services'];
  if (!Array.isArray(rawServices)) return [];
  return rawServices.filter((service): service is Record<string, unknown> => Boolean(service) && typeof service === 'object').map((service) => ({
    name: typeof service['name'] === 'string' ? service['name'] : undefined,
    endpoint: typeof service['endpoint'] === 'string' ? service['endpoint'] : undefined,
    version: typeof service['version'] === 'string' ? service['version'] : undefined,
  }));
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function validationResponseFromRecord(record: Record<string, unknown>): AgentValidationResponse {
  return {
    requestHash: normalizeString(record['requestHash']),
    validator: normalizeString(record['validator']),
    agentId: normalizeString(record['agentId']),
    score: normalizeNumber(record['score']),
    endpoint: normalizeString(record['endpoint']),
    feedbackURI: normalizeString(record['feedbackURI'] ?? record['feedbackUri']),
    feedbackHash: normalizeString(record['feedbackHash']),
    responseURI: normalizeString(record['responseURI'] ?? record['responseUri']),
    responseHash: normalizeString(record['responseHash']),
    tag: normalizeString(record['tag'] ?? record['tag1']),
    tag1: normalizeString(record['tag1'] ?? record['tag']),
    tag2: normalizeString(record['tag2']),
    value: normalizeNumber(record['value']),
    valueDecimals: normalizeNumber(record['valueDecimals']),
    isRevoked: typeof record['isRevoked'] === 'boolean' ? record['isRevoked'] : undefined,
    feedbackIndex: normalizeNumber(record['feedbackIndex']),
    clientAddress: normalizeString(record['clientAddress']),
    updatedAt: normalizeString(record['updatedAt']),
    blockNumber: normalizeNumber(record['blockNumber']),
    logIndex: normalizeNumber(record['logIndex']),
    transactionHash: normalizeString(record['transactionHash']),
  };
}

function validationRequests(document: unknown): AgentValidationRequest[] {
  if (!document || typeof document !== 'object') return [];
  const rawRequests = (document as Record<string, unknown>)['validationRequests'] ?? (document as Record<string, unknown>)['validations'];
  if (!Array.isArray(rawRequests)) return [];
  return rawRequests
    .filter((request): request is Record<string, unknown> => Boolean(request) && typeof request === 'object')
    .map((request) => {
      const rawResponses = request['validationResponses'] ?? request['responses'];
      const responses = Array.isArray(rawResponses)
        ? rawResponses
            .filter((response): response is Record<string, unknown> => Boolean(response) && typeof response === 'object')
            .map((response) => validationResponseFromRecord(response))
        : [];
      return {
        requestHash: normalizeString(request['requestHash']),
        validator: normalizeString(request['validator']),
        validationResponses: responses,
      };
    });
}

function isA2aOrMcpService(service: AgentRegistrationService): boolean {
  const name = service.name?.toLowerCase() ?? '';
  return name === 'a2a' || name === 'mcp';
}

async function fetchRegistration(agentURI: string, timeout: number): Promise<unknown> {
  if (agentURI.startsWith('data:application/json,')) return JSON.parse(decodeURIComponent(agentURI.slice('data:application/json,'.length)));
  const parsed = new URL(agentURI);
  if (parsed.protocol !== 'https:') throw new Error('Only HTTPS and data:application/json agentURI dereferencing is supported.');
  if (isPrivateHost(parsed.hostname)) throw new Error('agentURI resolves to a private/link-local host.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(agentURI, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, redirect: 'follow' });
    if (!response.ok) throw new Error(`agentURI responded with HTTP ${response.status}.`);
    return response.json();
  } finally { clearTimeout(timer); }
}

function normalizeSha256(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/^sha-?256[:=]/, '').replace(/^0x/, '');
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function signFeedbackDecision(payload: Erc8004FeedbackFetchDecisionPayload): Erc8004FeedbackFetchDecisionReceipt {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  return {
    signatureAlgorithm: 'ed25519',
    canonicalization: 'json-stable-v1',
    decisionPayload: payload,
    signature: sign(null, Buffer.from(stableStringify(payload)), privateKey).toString('base64'),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function signFeedbackEventStorageCompleteness(
  payload: Erc8004FeedbackEventStorageVerdictPayload
): Erc8004FeedbackEventStorageCompletenessReceipt {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const signedAt = new Date().toISOString();
  const signaturePayload = { ...payload, signedAt };
  const canonicalPayload = stableStringify(signaturePayload);
  return {
    signatureAlgorithm: 'ed25519',
    canonicalization: 'json-stable-v1',
    verdictPayload: payload,
    payloadSha256: createHash('sha256').update(canonicalPayload).digest('hex'),
    signatureBase64: sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64'),
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    signedAt,
  };
}

function canonicalEventPointer(args: {
  request: AgentValidationRequest;
  response: AgentValidationResponse;
}): Erc8004FeedbackEventPointer | null {
  const feedbackIndex = args.response.feedbackIndex ?? null;
  const transactionHash = args.response.transactionHash ?? null;
  const blockNumber = args.response.blockNumber ?? null;
  const logIndex = args.response.logIndex ?? null;
  if (feedbackIndex === null || !transactionHash || blockNumber === null || logIndex === null) return null;
  return {
    eventName: 'NewFeedback',
    agentId: args.response.agentId ?? null,
    clientAddress: args.response.clientAddress ?? null,
    feedbackIndex,
    transactionHash,
    blockNumber,
    logIndex,
  };
}

function storageSnapshot(response: AgentValidationResponse): Erc8004FeedbackStorageSnapshot {
  return {
    value: typeof response.value === 'number' && Number.isFinite(response.value) ? response.value : null,
    valueDecimals: typeof response.valueDecimals === 'number' && Number.isFinite(response.valueDecimals) ? response.valueDecimals : null,
    tag1: response.tag1 ?? response.tag ?? null,
    tag2: response.tag2 ?? null,
    isRevoked: typeof response.isRevoked === 'boolean' ? response.isRevoked : null,
  };
}

function feedbackEventStorageVerdict(args: {
  request: AgentValidationRequest;
  response: AgentValidationResponse;
  order: number;
  feedbackURI: string | undefined;
  feedbackHash: string | null;
}): {
  pointer: Erc8004FeedbackEventPointer | null;
  snapshot: Erc8004FeedbackStorageSnapshot;
  receipt: Erc8004FeedbackEventStorageCompletenessReceipt;
} {
  const pointer = canonicalEventPointer(args);
  const snapshot = storageSnapshot(args.response);
  const eventFields = {
    endpoint: args.response.endpoint ?? null,
    feedbackURI: args.feedbackURI ?? null,
    feedbackHash: args.feedbackHash,
  };
  const missingEventFields = [
    ...(!pointer ? ['canonicalEventPointer'] : []),
    ...(!eventFields.endpoint ? ['endpoint'] : []),
    ...(!eventFields.feedbackURI ? ['feedbackURI'] : []),
    ...(!eventFields.feedbackHash ? ['feedbackHash'] : []),
  ];
  const missingStorageFields = [
    ...(snapshot.value === null ? ['value'] : []),
    ...(snapshot.valueDecimals === null ? ['valueDecimals'] : []),
    ...(snapshot.tag1 === null ? ['tag1'] : []),
    ...(snapshot.tag2 === null ? ['tag2'] : []),
    ...(snapshot.isRevoked === null ? ['isRevoked'] : []),
  ];
  const payload: Erc8004FeedbackEventStorageVerdictPayload = {
    requestHash: args.request.requestHash ?? '',
    validator: args.request.validator ?? '',
    responseOrder: args.order,
    eventPointer: pointer,
    eventFields,
    storageSnapshot: snapshot,
    verdict: missingEventFields.length === 0 && missingStorageFields.length === 0 ? 'complete' : 'incomplete',
    missingEventFields,
    missingStorageFields,
  };
  return { pointer, snapshot, receipt: signFeedbackEventStorageCompleteness(payload) };
}

async function resolveFeedbackHost(hostname: string): Promise<Erc8004FeedbackResolutionEvidence[]> {
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    return [{ hostname, address: hostname, family: literalFamily, source: 'literal', privateHost: isPrivateHost(hostname) }];
  }

  try {
    const entries = await lookup(hostname, { all: true, verbatim: true });
    return entries.map((entry) => ({
      hostname,
      address: entry.address,
      family: entry.family === 6 ? 6 : 4,
      source: 'dns',
      privateHost: isPrivateHost(entry.address),
    }));
  } catch (err) {
    return [{ hostname, address: null, family: null, source: 'dns', error: err instanceof Error ? err.message : 'DNS lookup failed', privateHost: false }];
  }
}

function blockedFeedbackReceipt(
  url: string,
  reason: string,
  evidence: Erc8004FeedbackResolutionEvidence[] = [],
  redirects: Erc8004FeedbackRedirectEvidence[] = []
): Erc8004FeedbackFetchDecisionReceipt {
  return signFeedbackDecision({ url, allowed: false, reason, evidence, redirects, integritySha256: null, integrityVerified: false });
}

async function fetchFeedbackPayload(feedbackURI: string, timeout: number): Promise<{ body: Uint8Array | null; receipt: Erc8004FeedbackFetchDecisionReceipt; }> {
  if (feedbackURI.startsWith('data:')) {
    const response = await fetch(feedbackURI);
    const body = new Uint8Array(await response.arrayBuffer());
    const integritySha256 = createHash('sha256').update(body).digest('hex');
    return {
      body,
      receipt: signFeedbackDecision({
        url: feedbackURI,
        allowed: true,
        reason: 'Data feedbackURI payload was read without network dereferencing.',
        evidence: [],
        redirects: [],
        integritySha256,
        integrityVerified: null,
      }),
    };
  }

  let currentUrl = feedbackURI;
  const redirectChain: Erc8004FeedbackRedirectEvidence[] = [];
  let resolutionEvidence: Erc8004FeedbackResolutionEvidence[] = [];

  for (let redirects = 0; redirects <= MAX_FEEDBACK_REDIRECTS; redirects++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { body: null, receipt: blockedFeedbackReceipt(currentUrl, 'feedbackURI URL is invalid.', resolutionEvidence, redirectChain) };
    }

    if (parsed.protocol !== 'https:') {
      return { body: null, receipt: blockedFeedbackReceipt(currentUrl, 'Only HTTPS and data: feedbackURI verification is supported.', resolutionEvidence, redirectChain) };
    }

    const evidence = await resolveFeedbackHost(parsed.hostname);
    resolutionEvidence = [...resolutionEvidence, ...evidence];
    if (isPrivateHost(parsed.hostname) || evidence.some((item) => item.privateHost)) {
      return { body: null, receipt: blockedFeedbackReceipt(currentUrl, 'feedbackURI resolves to a private/link-local/loopback target.', resolutionEvidence, redirectChain) };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(currentUrl, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT }, redirect: 'manual' });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (location && redirects < MAX_FEEDBACK_REDIRECTS) {
          const nextUrl = new URL(location, currentUrl).toString();
          redirectChain.push({ from: currentUrl, to: nextUrl, statusCode: response.status });
          currentUrl = nextUrl;
          continue;
        }
        return { body: null, receipt: blockedFeedbackReceipt(currentUrl, 'feedbackURI exceeded redirect limit.', resolutionEvidence, redirectChain) };
      }
      if (!response.ok) return { body: null, receipt: blockedFeedbackReceipt(currentUrl, `feedbackURI responded with HTTP ${response.status}.`, resolutionEvidence, redirectChain) };
      const body = new Uint8Array(await response.arrayBuffer());
      const integritySha256 = createHash('sha256').update(body).digest('hex');
      return {
        body,
        receipt: signFeedbackDecision({
          url: currentUrl,
          allowed: true,
          reason: 'feedbackURI payload fetched after safe DNS/IP and redirect checks.',
          evidence: resolutionEvidence,
          redirects: redirectChain,
          integritySha256,
          integrityVerified: null,
        }),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { body: null, receipt: blockedFeedbackReceipt(currentUrl, 'feedbackURI exceeded redirect limit.', resolutionEvidence, redirectChain) };
}

async function verifyResponseHash(responseURI: string | undefined, responseHash: string | undefined, timeout: number): Promise<{ verified: boolean | null; receipt: Erc8004FeedbackFetchDecisionReceipt | null; }> {
  const expected = normalizeSha256(responseHash);
  if (!responseURI || !expected) return { verified: null, receipt: null };
  try {
    const result = await fetchFeedbackPayload(responseURI, timeout);
    const actual = result.body ? createHash('sha256').update(result.body).digest('hex') : null;
    const verified = actual === expected;
    return {
      verified,
      receipt: signFeedbackDecision({ ...result.receipt.decisionPayload, integritySha256: actual, integrityVerified: verified }),
    };
  } catch {
    return { verified: false, receipt: blockedFeedbackReceipt(responseURI, 'feedbackURI verification failed before the payload could enter AX Score aggregation.') };
  }
}

export async function buildProgressiveValidationLineage(args: { validationRequests: AgentValidationRequest[]; timeout: number; }): Promise<Erc8004ValidationLineageEvidence[]> {
  const grouped = await Promise.all(args.validationRequests.flatMap(async (request) => {
    if (!request.requestHash || !request.validator) return [];
    const sourceResponses = request.validationResponses ?? request.responses ?? [];
    const responses: Erc8004ValidationResponseEvidence[] = await Promise.all(sourceResponses.map(async (response, index) => {
      const responseRequestHash = response.requestHash ?? request.requestHash ?? null;
      const responseValidator = response.validator ?? request.validator ?? null;
      const feedbackURI = response.feedbackURI ?? response.responseURI;
      const feedbackHash = response.feedbackHash ?? response.responseHash;
      const normalizedResponseHash = normalizeSha256(feedbackHash);
      const verification = await verifyResponseHash(feedbackURI, feedbackHash, args.timeout);
      const eventStorage = feedbackEventStorageVerdict({
        request,
        response,
        order: index + 1,
        feedbackURI,
        feedbackHash: normalizedResponseHash ?? feedbackHash ?? null,
      });
      return {
        order: index + 1,
        requestHash: responseRequestHash,
        validator: responseValidator,
        requestHashMatches: responseRequestHash === request.requestHash,
        validatorMatchesRequest: responseValidator === request.validator,
        score: typeof response.score === 'number' && Number.isFinite(response.score) ? response.score : null,
        endpoint: response.endpoint ?? null,
        responseURI: feedbackURI ?? null,
        responseHash: normalizedResponseHash ?? feedbackHash ?? null,
        responseHashVerified: verification.verified,
        responseHashAlgorithm: normalizedResponseHash ? 'sha256' : null,
        feedbackFetchDecisionReceipt: verification.receipt,
        canonicalEventPointer: eventStorage.pointer,
        storageSnapshot: eventStorage.snapshot,
        eventStorageCompletenessVerdict: eventStorage.receipt,
        tag: response.tag ?? null,
        updatedAt: response.updatedAt ?? null,
        blockNumber: response.blockNumber ?? null,
        transactionHash: response.transactionHash ?? null,
        isLatest: index === sourceResponses.length - 1,
      };
    }));
    const latest = responses.at(-1);
    return [{
      requestHash: request.requestHash,
      validator: request.validator,
      responseCount: responses.length,
      orderedTags: responses.map((response) => response.tag).filter((tag): tag is string => typeof tag === 'string'),
      latestTag: latest?.tag ?? null,
      latestScore: latest?.score ?? null,
      allResponsesBound: responses.length > 0 && responses.every((response) => response.requestHashMatches && response.validatorMatchesRequest),
      allResponseHashesVerified: responses.length > 0 && responses.every((response) => response.responseHashVerified === true),
      allFeedbackEventStorageComplete: responses.length > 0 && responses.every((response) => response.eventStorageCompletenessVerdict.verdictPayload.verdict === 'complete'),
      responses,
    }];
  }));
  return grouped.flat().sort((a, b) => a.requestHash.localeCompare(b.requestHash) || a.validator.localeCompare(b.validator));
}

function remoteByEndpoint(remotes: RemoteProbe[]): Map<string, RemoteProbe> {
  return new Map(remotes.map((remote) => [remote.url, remote]));
}

export function buildAgentServiceBindings(args: { agentURI: string; registrationSha256?: string | null; server: McpServerRecord; services: AgentRegistrationService[]; remotes: RemoteProbe[]; identity?: Erc8004AgentIdentityEvidence | null; }): AgentServiceBindingEvidence[] {
  let agentUriHost: string | null = null;
  try { const parsedAgentUri = new URL(args.agentURI); agentUriHost = parsedAgentUri.protocol === 'https:' ? parsedAgentUri.hostname : null; } catch { agentUriHost = null; }
  const identity = identityRef(args.server);
  const identityEvidence = args.identity ?? {
    agentId: normalizeIdentityValue(identity.agentId),
    owner: normalizeIdentityValue(identity.owner ?? identity.ownerAddress),
    identityRegistry: normalizeIdentityValue(identity.identityRegistry),
    chainId: normalizeIdentityValue(identity.chainId),
    ed25519PublicKeys: [],
  };
  const remotes = remoteByEndpoint(args.remotes);
  return args.services.filter((service) => isA2aOrMcpService(service) && typeof service.endpoint === 'string').flatMap((service) => {
    const endpoint = service.endpoint ?? '';
    const remote = remotes.get(endpoint);
    if (!remote) return [];
    let endpointHost: string;
    try { endpointHost = new URL(endpoint).hostname; } catch { return []; }
    return [{
      agentURI: args.agentURI,
      ...(args.registrationSha256 ? { registrationSha256: args.registrationSha256 } : {}),
      agentId: identityEvidence.agentId,
      owner: identityEvidence.owner,
      identityRegistry: identityEvidence.identityRegistry,
      ed25519PublicKeys: identityEvidence.ed25519PublicKeys,
      serviceName: service.name ?? 'unknown',
      endpoint,
      endpointHost,
      agentUriHost,
      domainControl: domainControl(agentUriHost, endpointHost),
      tls: remote.https,
      redirectCount: remote.redirectChain.length,
      signatureAlgorithm: remote.fetchDecisionReceipt.signatureAlgorithm,
    }];
  });
}

export class Erc8004RegistrationGatherer {
  name = 'erc8004Registration';
  async gather(config: McpConfig, artifacts: Record<string, GatherResult>): Promise<Erc8004RegistrationGatherResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const remote = artifacts['mcpRemote'] as { remotes?: RemoteProbe[] } | undefined;
    const server = registry?.server;
    if (!server) return { agentURI: null, fetched: false, error: 'Missing MCP registry server record.', registration: null, registrationSha256: null, identity: null, keyContinuityReceipts: [], bindings: [], validationLineage: [] };
    const agentURI = normalizeAgentURI(server);
    if (!agentURI) return { agentURI: null, fetched: false, error: null, registration: null, registrationSha256: null, identity: null, keyContinuityReceipts: [], bindings: [], validationLineage: [] };
    try {
      const timeout = config.timeout ?? DEFAULT_TIMEOUT;
      const document = await fetchRegistration(agentURI, timeout);
      const registrationSha256 = sha256Registration(document);
      const services = registrationServices(document);
      const validationRequestEvidence = validationRequests(document);
      const identity = normalizeAgentIdentity(document, server);
      const receipts = keyContinuityReceipts(document);
      return {
        agentURI,
        fetched: true,
        error: null,
        registration: { services, validationRequests: validationRequestEvidence, identity, keyContinuityReceipts: receipts },
        registrationSha256,
        identity,
        keyContinuityReceipts: receipts,
        bindings: buildAgentServiceBindings({ agentURI, registrationSha256, server, services, remotes: remote?.remotes ?? [], identity }),
        validationLineage: await buildProgressiveValidationLineage({ validationRequests: validationRequestEvidence, timeout }),
      };
    } catch (err) {
      return { agentURI, fetched: false, error: err instanceof Error ? err.message : 'Could not dereference agent registration file.', registration: null, registrationSha256: null, identity: null, keyContinuityReceipts: [], bindings: [], validationLineage: [] };
    }
  }
}
