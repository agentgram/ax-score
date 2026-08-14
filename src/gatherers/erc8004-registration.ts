import { createHash } from 'node:crypto';
import type { AgentRegistrationService, AgentServiceBindingEvidence, Erc8004AgentIdentityRef, McpConfig, McpServerRecord } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { RemoteProbe } from './mcp-remote.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';
import { isPrivateHost } from './mcp-remote.js';

const USER_AGENT = 'AX-Score/1.0 (erc8004-registration-binding)';

export interface AgentRegistrationDocument { services?: AgentRegistrationService[]; }
export interface Erc8004RegistrationGatherResult extends GatherResult {
  agentURI: string | null;
  fetched: boolean;
  error: string | null;
  registration: AgentRegistrationDocument | null;
  registrationSha256: string | null;
  bindings: AgentServiceBindingEvidence[];
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

function remoteByEndpoint(remotes: RemoteProbe[]): Map<string, RemoteProbe> {
  return new Map(remotes.map((remote) => [remote.url, remote]));
}

export function buildAgentServiceBindings(args: { agentURI: string; registrationSha256?: string | null; server: McpServerRecord; services: AgentRegistrationService[]; remotes: RemoteProbe[]; }): AgentServiceBindingEvidence[] {
  let agentUriHost: string | null = null;
  try { const parsedAgentUri = new URL(args.agentURI); agentUriHost = parsedAgentUri.protocol === 'https:' ? parsedAgentUri.hostname : null; } catch { agentUriHost = null; }
  const identity = identityRef(args.server);
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
      agentId: normalizeIdentityValue(identity.agentId),
      identityRegistry: normalizeIdentityValue(identity.identityRegistry),
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
    if (!server) return { agentURI: null, fetched: false, error: 'Missing MCP registry server record.', registration: null, registrationSha256: null, bindings: [] };
    const agentURI = normalizeAgentURI(server);
    if (!agentURI) return { agentURI: null, fetched: false, error: null, registration: null, registrationSha256: null, bindings: [] };
    try {
      const document = await fetchRegistration(agentURI, config.timeout ?? DEFAULT_TIMEOUT);
      const registrationSha256 = sha256Registration(document);
      const services = registrationServices(document);
      return { agentURI, fetched: true, error: null, registration: { services }, registrationSha256, bindings: buildAgentServiceBindings({ agentURI, registrationSha256, server, services, remotes: remote?.remotes ?? [] }) };
    } catch (err) {
      return { agentURI, fetched: false, error: err instanceof Error ? err.message : 'Could not dereference agent registration file.', registration: null, registrationSha256: null, bindings: [] };
    }
  }
}
