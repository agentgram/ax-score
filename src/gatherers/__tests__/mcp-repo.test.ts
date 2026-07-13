import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpRepoGatherer, parseGithubRepoUrl } from '../mcp-repo.js';
import type { McpRegistryGatherResult } from '../mcp-registry.js';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function registryArtifact(repoUrl: string | null): Record<string, McpRegistryGatherResult> {
  return {
    mcpRegistry: {
      registryUrl: 'https://registry.modelcontextprotocol.io',
      fetched: true,
      error: null,
      server: {
        name: 'io.github.acme/todo-server',
        repository: repoUrl ? { url: repoUrl, source: 'github' } : undefined,
      },
      meta: null,
    },
  };
}

const REPO_BODY = {
  archived: false,
  stargazers_count: 321,
  pushed_at: '2026-06-20T12:00:00Z',
  license: { spdx_id: 'MIT' },
};

const README_BODY = {
  size: 2048,
  content: Buffer.from('# Todo Server\n\nUsage: npx todo-mcp-server\n').toString('base64'),
};

describe('parseGithubRepoUrl', () => {
  it('should parse https URLs with and without .git', () => {
    expect(parseGithubRepoUrl('https://github.com/acme/todo-server')).toEqual({
      owner: 'acme',
      repo: 'todo-server',
    });
    expect(parseGithubRepoUrl('https://github.com/acme/todo-server.git')).toEqual({
      owner: 'acme',
      repo: 'todo-server',
    });
  });

  it('should parse ssh URLs', () => {
    expect(parseGithubRepoUrl('git@github.com:acme/todo-server.git')).toEqual({
      owner: 'acme',
      repo: 'todo-server',
    });
  });

  it('should reject non-GitHub hosts and malformed URLs', () => {
    expect(parseGithubRepoUrl('https://gitlab.com/acme/todo-server')).toBeNull();
    expect(parseGithubRepoUrl('not a url')).toBeNull();
    expect(parseGithubRepoUrl('https://github.com/only-owner')).toBeNull();
  });
});

describe('McpRepoGatherer', () => {
  const gatherer = new McpRepoGatherer();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should gather repo facts and README from GitHub', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/readme')) return jsonResponse(README_BODY);
      return jsonResponse(REPO_BODY);
    });

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact('https://github.com/acme/todo-server')
    );

    expect(result.provider).toBe('github');
    expect(result.checked).toBe(true);
    expect(result.exists).toBe(true);
    expect(result.archived).toBe(false);
    expect(result.stars).toBe(321);
    expect(result.pushedAt).toBe('2026-06-20T12:00:00Z');
    expect(result.license).toBe('MIT');
    expect(result.readme.exists).toBe(true);
    expect(result.readme.size).toBe(2048);
    expect(result.readme.content).toContain('npx todo-mcp-server');
  });

  it('should report a dead repository', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 404));

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact('https://github.com/acme/gone')
    );

    expect(result.checked).toBe(true);
    expect(result.exists).toBe(false);
  });

  it('should stay unchecked on rate limits (indeterminate, not failure)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      jsonResponse({ message: 'API rate limit exceeded' }, 403)
    );

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact('https://github.com/acme/todo-server')
    );

    expect(result.checked).toBe(false);
    expect(result.exists).toBeNull();
  });

  it('should report provider "none" when no repository is declared', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact(null)
    );

    expect(result.provider).toBe('none');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should report provider "other" for non-GitHub hosts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await gatherer.gather(
      { server: 'io.github.acme/todo-server' },
      registryArtifact('https://gitlab.com/acme/todo-server')
    );

    expect(result.provider).toBe('other');
    expect(result.checked).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
