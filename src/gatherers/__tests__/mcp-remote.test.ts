import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRemoteGatherer, isPrivateHost } from '../mcp-remote.js';
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

  it('should retry once so a transient failure does not mark the remote unreachable', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('ECONNRESET'));
      return statusResponse(200);
    });

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ type: 'streamable-http', url: 'https://flaky.acme.dev/mcp' }])
    );

    expect(calls).toBe(2);
    expect(result.remotes[0]!.reachable).toBe(true);
    expect(result.remotes[0]!.statusCode).toBe(200);
  });

  it('should give up after the retry on persistent failures', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([{ type: 'sse', url: 'https://dead.acme.dev/sse' }])
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.remotes[0]!.reachable).toBe(false);
  });

  it('should never probe private, loopback, or link-local hosts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact([
        { type: 'streamable-http', url: 'http://localhost:3000/mcp' },
        { type: 'streamable-http', url: 'https://192.168.1.10/mcp' },
        { type: 'streamable-http', url: 'http://[::1]:8080/mcp' },
      ])
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    for (const probe of result.remotes) {
      expect(probe.privateHost).toBe(true);
      expect(probe.reachable).toBe(false);
    }
  });
});

describe('isPrivateHost', () => {
  it('should detect private and special-use hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.0.5', '::1', 'fd12::1', 'fe80::1', 'printer.local']) {
      expect(isPrivateHost(host), host).toBe(true);
    }
  });

  it('should allow public hosts', () => {
    for (const host of ['mcp.acme.dev', '8.8.8.8', '172.15.0.1', '2606:4700::1111']) {
      expect(isPrivateHost(host), host).toBe(false);
    }
  });
});
