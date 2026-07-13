import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRegistryGatherer, listRegistryServers } from '../mcp-registry.js';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

const RECORD = {
  server: {
    name: 'io.github.acme/todo-server',
    description: 'Todo tools over MCP.',
    version: '1.2.3',
    packages: [{ registryType: 'npm', identifier: 'todo-mcp-server', version: '1.2.3' }],
  },
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active',
      updatedAt: '2026-06-01T00:00:00Z',
      isLatest: true,
    },
  },
};

describe('McpRegistryGatherer', () => {
  const gatherer = new McpRegistryGatherer();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the name "mcpRegistry"', () => {
    expect(gatherer.name).toBe('mcpRegistry');
  });

  it('should fetch the latest version of a server by name', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => jsonResponse(RECORD));

    const result = await gatherer.gather({ server: 'io.github.acme/todo-server' });

    expect(result.server?.name).toBe('io.github.acme/todo-server');
    expect(result.meta?.status).toBe('active');
    expect(result.fetched).toBe(true);
    expect(result.error).toBeNull();

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/v0/servers/io.github.acme%2Ftodo-server/versions/latest');
  });

  it('should report an unknown server without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 404));

    const result = await gatherer.gather({ server: 'io.github.acme/missing' });

    expect(result.server).toBeNull();
    expect(result.fetched).toBe(true);
    expect(result.error).toContain('not found');
  });

  it('should mark network failures as unfetched', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await gatherer.gather({ server: 'io.github.acme/todo-server' });

    expect(result.server).toBeNull();
    expect(result.fetched).toBe(false);
  });

  it('should use a pre-fetched record without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather({
      server: 'io.github.acme/todo-server',
      record: { server: { name: 'io.github.acme/todo-server' }, meta: null },
    });

    expect(result.server?.name).toBe('io.github.acme/todo-server');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('listRegistryServers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should paginate with cursors and de-duplicate by name', async () => {
    const pageOne = {
      servers: [
        { server: { name: 'io.github.a/one', version: '1.0.0' } },
        { server: { name: 'io.github.b/two', version: '2.0.0' } },
      ],
      metadata: { nextCursor: 'cursor-1', count: 2 },
    };
    const pageTwo = {
      servers: [
        { server: { name: 'io.github.b/two', version: '2.0.0' } },
        { server: { name: 'io.github.c/three', version: '3.0.0' } },
      ],
      metadata: { count: 2 },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      return url.includes('cursor=cursor-1') ? jsonResponse(pageTwo) : jsonResponse(pageOne);
    });

    const records = await listRegistryServers({ limit: 10 });

    expect(records.map((r) => r.server.name)).toEqual([
      'io.github.a/one',
      'io.github.b/two',
      'io.github.c/three',
    ]);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('version=latest');
  });

  it('should stop at the requested limit', async () => {
    const page = {
      servers: [
        { server: { name: 'io.github.a/one' } },
        { server: { name: 'io.github.b/two' } },
      ],
      metadata: { nextCursor: 'more', count: 2 },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse(page));

    const records = await listRegistryServers({ limit: 1 });

    expect(records).toHaveLength(1);
  });

  it('should throw when the registry is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    await expect(listRegistryServers({ limit: 5 })).rejects.toThrow('unreachable');
  });

  it('should terminate on a cyclic cursor instead of looping forever', async () => {
    // The registry keeps returning the same nextCursor with duplicate servers.
    const cyclicPage = {
      servers: [{ server: { name: 'io.github.a/one', version: '1.0.0' } }],
      metadata: { nextCursor: 'stuck-cursor', count: 1 },
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => jsonResponse(cyclicPage));

    const records = await listRegistryServers({ limit: 50 });

    expect(records).toHaveLength(1);
    // First request + one follow of the cursor; the repeated cursor breaks the loop.
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});
