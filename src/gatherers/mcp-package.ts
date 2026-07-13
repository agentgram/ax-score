import type { McpConfig, McpPackageRef } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const PYPI_URL = 'https://pypi.org';
const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';

export interface PackageProbe {
  registryType: string;
  identifier: string;
  declaredVersion: string | null;
  /** False for registries we cannot verify (oci, mcpb, nuget, ...). */
  supported: boolean;
  /** False when the lookup could not be completed (network error, rate limit). */
  checked: boolean;
  exists: boolean | null;
  latestVersion: string | null;
  latestPublishedAt: string | null;
  declaredVersionPublished: boolean | null;
}

export interface McpPackageGatherResult extends GatherResult {
  packages: PackageProbe[];
}

interface JsonProbe {
  ok: boolean;
  status: number;
  body: unknown;
}

async function fetchJson(url: string, timeout: number): Promise<JsonProbe | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    clearTimeout(timer);

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return null;
  }
}

function baseProbe(ref: McpPackageRef): PackageProbe {
  return {
    registryType: ref.registryType ?? 'unknown',
    identifier: ref.identifier ?? '',
    declaredVersion: ref.version ?? null,
    supported: false,
    checked: false,
    exists: null,
    latestVersion: null,
    latestPublishedAt: null,
    declaredVersionPublished: null,
  };
}

async function probeNpm(probe: PackageProbe, timeout: number): Promise<PackageProbe> {
  const encoded = probe.identifier.replace('/', '%2F');
  const res = await fetchJson(`${NPM_REGISTRY_URL}/${encoded}`, timeout);

  if (!res) return probe;
  if (res.status === 404) {
    return { ...probe, checked: true, exists: false };
  }
  if (!res.ok || !res.body || typeof res.body !== 'object') return probe;

  const body = res.body as Record<string, unknown>;
  const distTags = (body['dist-tags'] ?? {}) as Record<string, unknown>;
  const time = (body['time'] ?? {}) as Record<string, unknown>;
  const versions = (body['versions'] ?? {}) as Record<string, unknown>;

  const latestVersion = typeof distTags['latest'] === 'string' ? distTags['latest'] : null;
  const latestTime = latestVersion ? time[latestVersion] : time['modified'];
  const latestPublishedAt = typeof latestTime === 'string' ? latestTime : null;

  const declaredVersionPublished =
    probe.declaredVersion !== null
      ? probe.declaredVersion in versions || probe.declaredVersion in time
      : null;

  return {
    ...probe,
    checked: true,
    exists: true,
    latestVersion,
    latestPublishedAt,
    declaredVersionPublished,
  };
}

async function probePypi(probe: PackageProbe, timeout: number): Promise<PackageProbe> {
  const res = await fetchJson(
    `${PYPI_URL}/pypi/${encodeURIComponent(probe.identifier)}/json`,
    timeout
  );

  if (!res) return probe;
  if (res.status === 404) {
    return { ...probe, checked: true, exists: false };
  }
  if (!res.ok || !res.body || typeof res.body !== 'object') return probe;

  const body = res.body as Record<string, unknown>;
  const info = (body['info'] ?? {}) as Record<string, unknown>;
  const releases = (body['releases'] ?? {}) as Record<string, unknown>;

  const latestVersion = typeof info['version'] === 'string' ? info['version'] : null;
  const latestPublishedAt = latestReleaseTime(releases, latestVersion);

  const declaredVersionPublished =
    probe.declaredVersion !== null ? probe.declaredVersion in releases : null;

  return {
    ...probe,
    checked: true,
    exists: true,
    latestVersion,
    latestPublishedAt,
    declaredVersionPublished,
  };
}

function latestReleaseTime(
  releases: Record<string, unknown>,
  latestVersion: string | null
): string | null {
  const candidates: string[] = [];
  const versions = latestVersion && latestVersion in releases ? [latestVersion] : Object.keys(releases);

  for (const version of versions) {
    const files = releases[version];
    if (!Array.isArray(files)) continue;
    for (const file of files) {
      if (!file || typeof file !== 'object') continue;
      const uploadTime = (file as Record<string, unknown>)['upload_time_iso_8601'];
      if (typeof uploadTime === 'string') candidates.push(uploadTime);
    }
  }

  if (candidates.length === 0) return null;
  return candidates.sort().at(-1) ?? null;
}

/**
 * Verifies the packages declared in the registry record against their
 * package registries (npm and PyPI). Other registry types (oci, mcpb, ...)
 * are reported as unsupported so audits can exclude them from scoring.
 */
export class McpPackageGatherer {
  name = 'mcpPackage';

  async gather(
    config: McpConfig,
    artifacts: Record<string, GatherResult>
  ): Promise<McpPackageGatherResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const refs = registry?.server?.packages ?? [];
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    const packages = await Promise.all(
      refs.map((ref) => {
        const probe = baseProbe(ref);
        if (probe.identifier.length === 0) return Promise.resolve(probe);

        switch (probe.registryType) {
          case 'npm':
            return probeNpm({ ...probe, supported: true }, timeout);
          case 'pypi':
            return probePypi({ ...probe, supported: true }, timeout);
          default:
            return Promise.resolve(probe);
        }
      })
    );

    return { packages };
  }
}
