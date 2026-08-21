import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { McpConfig } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';
const RETRY_DELAY_MS = 500;
const MAX_REDIRECTS = 5;
const MCP_INITIALIZE_PROTOCOL_VERSION = '2024-11-05';
const MCP_INITIALIZE_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: MCP_INITIALIZE_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'ax-score', version: '0.3.0' },
  },
};

export interface RemoteResolutionEvidence {
  hostname: string;
  address: string | null;
  family: 4 | 6 | null;
  source: 'literal' | 'dns';
  error?: string;
  privateHost?: boolean;
}

export interface RemoteRedirectEvidence {
  from: string;
  to: string;
  statusCode: number;
}

export interface RemoteResolutionPolicy {
  allowed: boolean;
  decision: 'probe' | 'block';
  reason: string;
}

export interface RemoteFetchDecisionPayload {
  url: string;
  type: string | null;
  allowed: boolean;
  reason: string;
  evidence: RemoteResolutionEvidence[];
  redirects: RemoteRedirectEvidence[];
}

export interface RemoteFetchDecisionReceipt {
  signatureAlgorithm: 'ed25519';
  canonicalization: 'json-stable-v1';
  decisionPayload: RemoteFetchDecisionPayload;
  signature: string;
  publicKey: string;
}

export interface RemoteSemanticProbe {
  attempted: boolean;
  status: 'attested' | 'unavailable' | 'blocked';
  statusCode: number | null;
  protocolVersion: string | null;
  serverName: string | null;
  serverVersion: string | null;
  capabilitiesSha256: string | null;
  canonicalSha256: string | null;
  error?: string;
}

export interface RemoteSemanticConsistencyPayload {
  canonicalization: 'mcp-remote-semantic-v1';
  request: typeof MCP_INITIALIZE_REQUEST;
  status: 'parity' | 'divergence' | 'insufficient-evidence' | 'not-applicable';
  declaredRemoteCount: number;
  attestedRemoteCount: number;
  baselineCanonicalSha256: string | null;
  remotes: Array<{
    url: string;
    type: string | null;
    status: RemoteSemanticProbe['status'];
    protocolVersion: string | null;
    serverName: string | null;
    serverVersion: string | null;
    capabilitiesSha256: string | null;
    canonicalSha256: string | null;
  }>;
}

export interface RemoteSemanticConsistencyReceipt {
  signatureAlgorithm: 'ed25519';
  canonicalization: 'json-stable-v1';
  payload: RemoteSemanticConsistencyPayload;
  payloadSha256: string;
  signatureBase64: string;
  publicKeyBase64: string;
  signedAt: string;
}

export interface RemoteSemanticConsistencyEvidence {
  status: RemoteSemanticConsistencyPayload['status'];
  declaredRemoteCount: number;
  attestedRemoteCount: number;
  exportConfidence: number;
  receipt: RemoteSemanticConsistencyReceipt;
}

export interface RemoteProbe {
  url: string;
  type: string | null;
  /** Whether the endpoint URL uses HTTPS. */
  https: boolean;
  /** False when the URL was not even parseable. */
  validUrl: boolean;
  /** True when the host is private/loopback/link-local and was not probed. */
  privateHost: boolean;
  /** Whether any HTTP response was received (auth challenges count as reachable). */
  reachable: boolean;
  statusCode: number | null;
  /** DNS/IP resolution evidence gathered before each fetch decision. */
  resolutionEvidence: RemoteResolutionEvidence[];
  /** Redirect hops observed with manual redirect handling. */
  redirectChain: RemoteRedirectEvidence[];
  /** Final allow/block decision made before probing or following redirects. */
  resolutionPolicy: RemoteResolutionPolicy;
  /** Ed25519-signed receipt over the final fetch decision. */
  fetchDecisionReceipt: RemoteFetchDecisionReceipt;
  /** MCP initialize/capability semantic attestation for this endpoint. */
  semanticProbe: RemoteSemanticProbe;
}

export interface McpRemoteGatherResult extends GatherResult {
  remotes: RemoteProbe[];
  semanticConsistency: RemoteSemanticConsistencyEvidence;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function signSemanticConsistency(
  payload: RemoteSemanticConsistencyPayload
): RemoteSemanticConsistencyReceipt {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const signedAt = new Date().toISOString();
  const signaturePayload = { ...payload, signedAt };
  const canonicalPayload = stableStringify(signaturePayload);

  return {
    signatureAlgorithm: 'ed25519',
    canonicalization: 'json-stable-v1',
    payload,
    payloadSha256: sha256(payload),
    signatureBase64: sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64'),
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    signedAt,
  };
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function canonicalSemanticProbe(body: unknown): Pick<
  RemoteSemanticProbe,
  'protocolVersion' | 'serverName' | 'serverVersion' | 'capabilitiesSha256' | 'canonicalSha256'
> {
  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const result =
    root['result'] && typeof root['result'] === 'object'
      ? (root['result'] as Record<string, unknown>)
      : root;
  const serverInfo =
    result['serverInfo'] && typeof result['serverInfo'] === 'object'
      ? (result['serverInfo'] as Record<string, unknown>)
      : {};
  const capabilities = result['capabilities'] ?? null;
  const semantic = {
    protocolVersion: stringField(result['protocolVersion']),
    serverName: stringField(serverInfo['name']),
    serverVersion: stringField(serverInfo['version']),
    capabilitiesSha256: sha256(capabilities),
  };

  return { ...semantic, canonicalSha256: sha256(semantic) };
}

function emptySemanticProbe(status: 'unavailable' | 'blocked', error: string): RemoteSemanticProbe {
  return {
    attempted: false,
    status,
    statusCode: null,
    protocolVersion: null,
    serverName: null,
    serverVersion: null,
    capabilitiesSha256: null,
    canonicalSha256: null,
    error,
  };
}

function signFetchDecision(payload: RemoteFetchDecisionPayload): RemoteFetchDecisionReceipt {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const canonicalPayload = stableStringify(payload);

  return {
    signatureAlgorithm: 'ed25519',
    canonicalization: 'json-stable-v1',
    decisionPayload: payload,
    signature: sign(null, Buffer.from(canonicalPayload), privateKey).toString('base64'),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

/**
 * Detects hosts that must not be probed (and cannot serve a public MCP
 * endpoint): loopback, unspecified, RFC 1918 private ranges, link-local,
 * and their common IPv6 equivalents.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10)
  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb')
    );
  }

  // IPv4 literals
  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = octets as [number, number, number, number];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }

  return false;
}

async function resolveHost(hostname: string): Promise<RemoteResolutionEvidence[]> {
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    return [
      {
        hostname,
        address: hostname,
        family: literalFamily,
        source: 'literal',
        privateHost: isPrivateHost(hostname),
      },
    ];
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
    return [
      {
        hostname,
        address: null,
        family: null,
        source: 'dns',
        error: err instanceof Error ? err.message : 'DNS lookup failed',
        privateHost: false,
      },
    ];
  }
}

async function resolveUrl(
  url: string,
  type: string | null,
  redirectChain: RemoteRedirectEvidence[]
): Promise<{
  parsed: URL;
  evidence: RemoteResolutionEvidence[];
  policy: RemoteResolutionPolicy;
  receipt: RemoteFetchDecisionReceipt;
}> {
  const parsed = new URL(url);
  const evidence = await resolveHost(parsed.hostname);
  const privateTarget = isPrivateHost(parsed.hostname) || evidence.some((item) => item.privateHost);
  const policy: RemoteResolutionPolicy = privateTarget
    ? {
        allowed: false,
        decision: 'block',
        reason: 'Remote endpoint resolves to a private/link-local/loopback target.',
      }
    : {
        allowed: true,
        decision: 'probe',
        reason: 'Remote endpoint resolved without private/link-local DNS or IP evidence.',
      };
  const receipt = signFetchDecision({
    url,
    type,
    allowed: policy.allowed,
    reason: policy.reason,
    evidence,
    redirects: redirectChain,
  });

  return { parsed, evidence, policy, receipt };
}

function isRedirectStatus(statusCode: number): boolean {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  );
}

function probeFromDecision(
  url: string,
  type: string | null,
  https: boolean,
  resolutionEvidence: RemoteResolutionEvidence[],
  redirectChain: RemoteRedirectEvidence[],
  resolutionPolicy: RemoteResolutionPolicy,
  fetchDecisionReceipt: RemoteFetchDecisionReceipt,
  semanticProbe: RemoteSemanticProbe,
  overrides: Partial<
    Pick<RemoteProbe, 'validUrl' | 'privateHost' | 'reachable' | 'statusCode'>
  > = {}
): RemoteProbe {
  return {
    url,
    type,
    https,
    validUrl: overrides.validUrl ?? true,
    privateHost: overrides.privateHost ?? !resolutionPolicy.allowed,
    reachable: overrides.reachable ?? false,
    statusCode: overrides.statusCode ?? null,
    resolutionEvidence,
    redirectChain,
    resolutionPolicy,
    fetchDecisionReceipt,
    semanticProbe,
  };
}

async function fetchStatus(
  url: string,
  timeout: number,
  type: string | null
): Promise<{
  statusCode: number;
  resolutionEvidence: RemoteResolutionEvidence[];
  redirectChain: RemoteRedirectEvidence[];
  receipt: RemoteFetchDecisionReceipt;
}> {
  let currentUrl = url;
  let resolutionEvidence: RemoteResolutionEvidence[] = [];
  const redirectChain: RemoteRedirectEvidence[] = [];

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const decision = await resolveUrl(currentUrl, type, redirectChain);
    resolutionEvidence = [...resolutionEvidence, ...decision.evidence];
    if (!decision.policy.allowed) {
      throw new RemotePolicyError(
        currentUrl,
        decision.policy,
        resolutionEvidence,
        redirectChain,
        decision.receipt
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/event-stream',
        },
        redirect: 'manual',
      });

      // Drain nothing: we only need the status line. Cancel the body if present.
      if (res.body) {
        try {
          await res.body.cancel();
        } catch {
          // Body cancellation failure does not affect the probe result.
        }
      }
      if (isRedirectStatus(res.status)) {
        const location = res.headers.get('location');
        if (location && redirects < MAX_REDIRECTS) {
          const nextUrl = new URL(location, currentUrl).toString();
          redirectChain.push({ from: currentUrl, to: nextUrl, statusCode: res.status });
          currentUrl = nextUrl;
          continue;
        }
      }

      return {
        statusCode: res.status,
        resolutionEvidence,
        redirectChain,
        receipt: decision.receipt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const decision = await resolveUrl(currentUrl, type, redirectChain);
  throw new RemotePolicyError(
    currentUrl,
    { allowed: false, decision: 'block', reason: 'Remote endpoint exceeded redirect limit.' },
    [...resolutionEvidence, ...decision.evidence],
    redirectChain,
    signFetchDecision({
      url: currentUrl,
      type,
      allowed: false,
      reason: 'Remote endpoint exceeded redirect limit.',
      evidence: [...resolutionEvidence, ...decision.evidence],
      redirects: redirectChain,
    })
  );
}

class RemotePolicyError extends Error {
  constructor(
    readonly url: string,
    readonly policy: RemoteResolutionPolicy,
    readonly resolutionEvidence: RemoteResolutionEvidence[],
    readonly redirectChain: RemoteRedirectEvidence[],
    readonly receipt: RemoteFetchDecisionReceipt
  ) {
    super(policy.reason);
  }
}

async function probeSemanticInitialize(
  url: string,
  timeout: number,
  type: string | null
): Promise<RemoteSemanticProbe> {
  try {
    const decision = await resolveUrl(url, type, []);
    if (!decision.policy.allowed) {
      return emptySemanticProbe('blocked', decision.policy.reason);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(MCP_INITIALIZE_REQUEST),
        redirect: 'manual',
      });
      if (!res.ok || typeof res.json !== 'function') {
        return {
          ...emptySemanticProbe(
            'unavailable',
            `MCP initialize request returned HTTP ${res.status}.`
          ),
          attempted: true,
          statusCode: res.status,
        };
      }
      const semantic = canonicalSemanticProbe(await res.json());
      return { attempted: true, status: 'attested', statusCode: res.status, ...semantic };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      ...emptySemanticProbe(
        'unavailable',
        err instanceof Error ? err.message : 'MCP initialize request failed.'
      ),
      attempted: true,
    };
  }
}

function buildSemanticConsistency(remotes: RemoteProbe[]): RemoteSemanticConsistencyEvidence {
  const attested = remotes.filter((remote) => remote.semanticProbe.status === 'attested');
  const baseline = attested[0]?.semanticProbe.canonicalSha256 ?? null;
  const hasDivergence = Boolean(
    baseline && attested.some((remote) => remote.semanticProbe.canonicalSha256 !== baseline)
  );
  const status: RemoteSemanticConsistencyPayload['status'] =
    remotes.length === 0
      ? 'not-applicable'
      : attested.length < 2
        ? 'insufficient-evidence'
        : hasDivergence
          ? 'divergence'
          : 'parity';
  const exportConfidence = status === 'divergence' ? 0.6 : 1;
  const payload: RemoteSemanticConsistencyPayload = {
    canonicalization: 'mcp-remote-semantic-v1',
    request: MCP_INITIALIZE_REQUEST,
    status,
    declaredRemoteCount: remotes.length,
    attestedRemoteCount: attested.length,
    baselineCanonicalSha256: baseline,
    remotes: remotes.map((remote) => ({
      url: remote.url,
      type: remote.type,
      status: remote.semanticProbe.status,
      protocolVersion: remote.semanticProbe.protocolVersion,
      serverName: remote.semanticProbe.serverName,
      serverVersion: remote.semanticProbe.serverVersion,
      capabilitiesSha256: remote.semanticProbe.capabilitiesSha256,
      canonicalSha256: remote.semanticProbe.canonicalSha256,
    })),
  };

  return {
    status,
    declaredRemoteCount: remotes.length,
    attestedRemoteCount: attested.length,
    exportConfidence,
    receipt: signSemanticConsistency(payload),
  };
}

async function probeRemote(
  url: string,
  type: string | null,
  timeout: number
): Promise<RemoteProbe> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    const policy: RemoteResolutionPolicy = {
      allowed: false,
      decision: 'block',
      reason: 'Remote endpoint URL is invalid.',
    };
    const receipt = signFetchDecision({
      url,
      type,
      allowed: false,
      reason: policy.reason,
      evidence: [],
      redirects: [],
    });
    return {
      url,
      type,
      https: false,
      validUrl: false,
      privateHost: false,
      reachable: false,
      statusCode: null,
      resolutionEvidence: [],
      redirectChain: [],
      resolutionPolicy: policy,
      fetchDecisionReceipt: receipt,
      semanticProbe: emptySemanticProbe('unavailable', policy.reason),
    };
  }

  const https = parsed.protocol === 'https:';

  const initialDecision = await resolveUrl(url, type, []);
  if (!initialDecision.policy.allowed) {
    return probeFromDecision(
      url,
      type,
      https,
      initialDecision.evidence,
      [],
      initialDecision.policy,
      initialDecision.receipt,
      emptySemanticProbe('blocked', initialDecision.policy.reason),
      { privateHost: true }
    );
  }

  // One retry with a short delay so a single transient network hiccup
  // does not zero the Operational category.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fetchStatus(url, timeout, type);
      const semanticProbe =
        result.statusCode < 500
          ? await probeSemanticInitialize(url, timeout, type)
          : emptySemanticProbe('unavailable', `Reachability probe returned HTTP ${result.statusCode}.`);
      return probeFromDecision(
        url,
        type,
        https,
        result.resolutionEvidence,
        result.redirectChain,
        {
          allowed: true,
          decision: 'probe',
          reason: 'Remote endpoint probe completed after safe DNS/IP and redirect checks.',
        },
        result.receipt,
        semanticProbe,
        { privateHost: false, reachable: true, statusCode: result.statusCode }
      );
    } catch (err) {
      if (err instanceof RemotePolicyError) {
        return probeFromDecision(
          url,
          type,
          https,
          err.resolutionEvidence,
          err.redirectChain,
          err.policy,
          err.receipt,
          emptySemanticProbe('blocked', err.policy.reason),
          {
            privateHost: true,
          }
        );
      }
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }

  return probeFromDecision(
    url,
    type,
    https,
    initialDecision.evidence,
    [],
    initialDecision.policy,
    initialDecision.receipt,
    emptySemanticProbe('unavailable', 'Remote endpoint did not respond to reachability probes.'),
    { privateHost: false }
  );
}

/**
 * Probes the remote endpoints declared in `remotes[]`.
 * Any HTTP response (including 401/405/406) counts as reachable — MCP
 * endpoints commonly reject plain GET requests but a response still proves
 * the endpoint is alive. Only network-level failures (after one retry)
 * count as unreachable. Private/loopback/link-local hosts are never probed.
 */
export class McpRemoteGatherer {
  name = 'mcpRemote';

  async gather(
    config: McpConfig,
    artifacts: Record<string, GatherResult>
  ): Promise<McpRemoteGatherResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const refs = registry?.server?.remotes ?? [];
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    const remotes = await Promise.all(
      refs
        .filter((ref) => typeof ref.url === 'string' && ref.url.length > 0)
        .map((ref) => probeRemote(ref.url ?? '', ref.type ?? null, timeout))
    );

    return { remotes, semanticConsistency: buildSemanticConsistency(remotes) };
  }
}
