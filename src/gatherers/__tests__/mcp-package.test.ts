import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpPackageGatherer } from '../mcp-package.js';
import type { McpRegistryGatherResult } from '../mcp-registry.js';
import type { McpPackageRef } from '../../types.js';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function registryArtifact(packages: McpPackageRef[]): Record<string, McpRegistryGatherResult> {
  return {
    mcpRegistry: {
      registryUrl: 'https://registry.modelcontextprotocol.io',
      fetched: true,
      error: null,
      server: { name: 'io.github.acme/todo-server', packages },
      meta: null,
    },
  };
}

const NPM_BODY = {
  'dist-tags': { latest: '1.2.3' },
  time: {
    created: '2025-01-01T00:00:00Z',
    modified: '2026-06-01T00:00:00Z',
    '1.2.2': '2026-01-01T00:00:00Z',
    '1.2.3': '2026-06-01T00:00:00Z',
  },
  versions: { '1.2.2': {}, '1.2.3': {} },
};

const PYPI_BODY = {
  info: { version: '0.9.0' },
  releases: {
    '0.8.0': [{ upload_time_iso_8601: '2026-01-10T00:00:00Z' }],
    '0.9.0': [{ upload_time_iso_8601: '2026-05-20T00:00:00Z' }],
  },
};

describe('McpPackageGatherer', () => {
  const gatherer = new McpPackageGatherer();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should verify an npm package (existence, latest publish, declared version)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(NPM_BODY));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'npm', identifier: 'todo-mcp-server', version: '1.2.3' }])
    );

    const probe = result.packages[0]!;
    expect(probe.supported).toBe(true);
    expect(probe.checked).toBe(true);
    expect(probe.exists).toBe(true);
    expect(probe.latestVersion).toBe('1.2.3');
    expect(probe.latestPublishedAt).toBe('2026-06-01T00:00:00Z');
    expect(probe.declaredVersionPublished).toBe(true);
  });

  it('should detect a declared npm version that was never published', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(NPM_BODY));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'npm', identifier: 'todo-mcp-server', version: '9.9.9' }])
    );

    expect(result.packages[0]!.declaredVersionPublished).toBe(false);
  });

  it('should verify a PyPI package', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(PYPI_BODY));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'pypi', identifier: 'todo-mcp', version: '0.9.0' }])
    );

    const probe = result.packages[0]!;
    expect(probe.exists).toBe(true);
    expect(probe.latestVersion).toBe('0.9.0');
    expect(probe.latestPublishedAt).toBe('2026-05-20T00:00:00Z');
    expect(probe.declaredVersionPublished).toBe(true);
  });

  it('should mark missing packages as non-existent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 404));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'npm', identifier: 'ghost-package' }])
    );

    expect(result.packages[0]!.checked).toBe(true);
    expect(result.packages[0]!.exists).toBe(false);
  });

  it('should mark network failures as unchecked (indeterminate)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'npm', identifier: 'todo-mcp-server' }])
    );

    expect(result.packages[0]!.checked).toBe(false);
    expect(result.packages[0]!.exists).toBeNull();
  });

  it('should mark oci packages as unsupported without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ registryType: 'oci', identifier: 'docker.io/acme/todo:1.2.3' }])
    );

    expect(result.packages[0]!.supported).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
