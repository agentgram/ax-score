/**
 * Shared test fixtures for MCP audit tests.
 *
 * These provide pre-built artifact objects that simulate MCP gatherer output
 * so individual audit tests can focus on their scoring logic. Defaults model
 * a healthy, well-maintained server; individual tests override single fields.
 */
import type { GatherResult } from '../../gatherers/base-gatherer.js';
import type { McpRegistryGatherResult } from '../../gatherers/mcp-registry.js';
import type { McpPackageGatherResult, PackageProbe } from '../../gatherers/mcp-package.js';
import type { McpRepoGatherResult } from '../../gatherers/mcp-repo.js';
import type { McpRemoteGatherResult, RemoteProbe } from '../../gatherers/mcp-remote.js';
import type { McpRegistryMeta, McpServerRecord } from '../../types.js';

/** ISO timestamp `days` days in the past, relative to now. */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export const HEALTHY_SERVER: McpServerRecord = {
  name: 'io.github.acme/todo-server',
  title: 'Todo Server',
  description:
    'Read and write access to Acme Todo lists, projects, and reminders through a typed MCP tool surface.',
  version: '1.2.3',
  websiteUrl: 'https://github.com/acme/todo-server#readme',
  repository: { url: 'https://github.com/acme/todo-server', source: 'github' },
  packages: [
    {
      registryType: 'npm',
      identifier: 'todo-mcp-server',
      version: '1.2.3',
      transport: { type: 'stdio' },
    },
  ],
  remotes: [{ type: 'streamable-http', url: 'https://mcp.acme.dev/mcp' }],
};

export const HEALTHY_META: McpRegistryMeta = {
  status: 'active',
  publishedAt: daysAgoIso(40),
  updatedAt: daysAgoIso(10),
  isLatest: true,
};

export function makeRegistryArtifact(
  overrides: Partial<McpRegistryGatherResult> = {}
): McpRegistryGatherResult {
  return {
    registryUrl: 'https://registry.modelcontextprotocol.io',
    fetched: true,
    error: null,
    server: structuredClone(HEALTHY_SERVER),
    meta: structuredClone(HEALTHY_META),
    ...overrides,
  };
}

export function makePackageProbe(overrides: Partial<PackageProbe> = {}): PackageProbe {
  return {
    registryType: 'npm',
    identifier: 'todo-mcp-server',
    declaredVersion: '1.2.3',
    supported: true,
    checked: true,
    exists: true,
    latestVersion: '1.2.3',
    latestPublishedAt: daysAgoIso(15),
    declaredVersionPublished: true,
    ...overrides,
  };
}

export function makePackageArtifact(probes?: PackageProbe[]): McpPackageGatherResult {
  return { packages: probes ?? [makePackageProbe()] };
}

export function makeRepoArtifact(
  overrides: Partial<McpRepoGatherResult> = {}
): McpRepoGatherResult {
  return {
    provider: 'github',
    owner: 'acme',
    repo: 'todo-server',
    checked: true,
    exists: true,
    archived: false,
    stars: 250,
    pushedAt: daysAgoIso(7),
    license: 'MIT',
    rateLimited: false,
    readme: {
      checked: true,
      exists: true,
      size: 4200,
      content:
        '# Todo Server\n\n## Installation\n\n```bash\nnpm install todo-mcp-server\n```\n\n' +
        '## Usage\n\nAdd this to your `claude_desktop_config.json`:\n\n' +
        '```json\n{"mcpServers": {"todo": {"command": "npx", "args": ["todo-mcp-server"]}}}\n```\n',
    },
    ...overrides,
  };
}

export function makeRemoteProbe(overrides: Partial<RemoteProbe> = {}): RemoteProbe {
  const url = overrides.url ?? 'https://mcp.acme.dev/mcp';
  const type = overrides.type ?? 'streamable-http';
  const resolutionEvidence = overrides.resolutionEvidence ?? [
    {
      hostname: 'mcp.acme.dev',
      address: '203.0.113.10',
      family: 4,
      source: 'dns',
      privateHost: false,
    },
  ];
  const redirectChain = overrides.redirectChain ?? [];
  const resolutionPolicy = overrides.resolutionPolicy ?? {
    allowed: true,
    decision: 'probe',
    reason: 'Remote endpoint resolved without private/link-local DNS or IP evidence.',
  };

  return {
    url,
    type,
    https: true,
    validUrl: true,
    privateHost: false,
    reachable: true,
    statusCode: 405,
    resolutionEvidence,
    redirectChain,
    resolutionPolicy,
    fetchDecisionReceipt: overrides.fetchDecisionReceipt ?? {
      signatureAlgorithm: 'ed25519',
      canonicalization: 'json-stable-v1',
      decisionPayload: {
        url,
        type,
        allowed: resolutionPolicy.allowed,
        reason: resolutionPolicy.reason,
        evidence: resolutionEvidence,
        redirects: redirectChain,
      },
      signature: 'fixture-signature',
      publicKey: 'fixture-public-key',
    },
    ...overrides,
  };
}

export function makeRemoteArtifact(probes?: RemoteProbe[]): McpRemoteGatherResult {
  return { remotes: probes ?? [makeRemoteProbe()] };
}

export interface McpArtifactOverrides {
  registry?: Partial<McpRegistryGatherResult>;
  packages?: PackageProbe[];
  repo?: Partial<McpRepoGatherResult>;
  remotes?: RemoteProbe[];
}

/** Builds the full artifact set expected by MCP audits. */
export function makeMcpArtifacts(
  overrides: McpArtifactOverrides = {}
): Record<string, GatherResult> {
  return {
    mcpRegistry: makeRegistryArtifact(overrides.registry),
    mcpPackage: makePackageArtifact(overrides.packages),
    mcpRepo: makeRepoArtifact(overrides.repo),
    mcpRemote: makeRemoteArtifact(overrides.remotes),
  };
}
