import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRemoteGatherer } from '../mcp-remote.js';
import type { McpRegistryGatherResult } from '../mcp-registry.js';
import type { McpRemoteRef } from '../../types.js';

function statusResponse(status: number): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    body: null,
  } as unknown as Response);
}

function registryArtifact(remotes: McpRemoteRef[]): Record<string, McpRegistryGatherResult> {
  return {
    mcpRegistry: {
      registryUrl: 'https://registry.modelcontextprotocol.io',
      fetched: true,
      error: null,
      server: { name: 'io.github.acme/todo-server', remotes },
      meta: null,
    },
  };
}

describe('McpRemoteGatherer', () => {
  const gatherer = new McpRemoteGatherer();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should mark endpoints that respond as reachable (405 counts)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => statusResponse(405));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ type: 'streamable-http', url: 'https://mcp.acme.dev/mcp' }])
    );

    const probe = result.remotes[0]!;
    expect(probe.reachable).toBe(true);
    expect(probe.statusCode).toBe(405);
    expect(probe.https).toBe(true);
  });

  it('should mark network failures as unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ type: 'sse', url: 'https://dead.acme.dev/sse' }])
    );

    expect(result.remotes[0]!.reachable).toBe(false);
    expect(result.remotes[0]!.statusCode).toBeNull();
  });

  it('should flag plain-http endpoints', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => statusResponse(200));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ type: 'streamable-http', url: 'http://mcp.acme.dev/mcp' }])
    );

    expect(result.remotes[0]!.https).toBe(false);
    expect(result.remotes[0]!.reachable).toBe(true);
  });

  it('should return no probes when the server declares no remotes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([])
    );

    expect(result.remotes).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
