import type { McpConfig } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const GITHUB_API_URL = 'https://api.github.com';
const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';
const MAX_README_CHARS = 200_000;

export type McpRepoProvider = 'github' | 'other' | 'none';

export interface McpReadmeProbe {
  checked: boolean;
  exists: boolean | null;
  size: number | null;
  content: string | null;
}

export interface McpRepoGatherResult extends GatherResult {
  provider: McpRepoProvider;
  owner: string | null;
  repo: string | null;
  /** False when the GitHub API could not be queried (network error, rate limit). */
  checked: boolean;
  exists: boolean | null;
  archived: boolean | null;
  stars: number | null;
  pushedAt: string | null;
  license: string | null;
  readme: McpReadmeProbe;
}

/** Parses `owner/repo` out of common GitHub URL shapes, or null. */
export function parseGithubRepoUrl(url: string): { owner: string; repo: string } | null {
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/, '');
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

interface JsonProbe {
  ok: boolean;
  status: number;
  body: unknown;
}

async function fetchGithubJson(path: string, timeout: number): Promise<JsonProbe | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/vnd.github+json',
    };
    const token = process.env['GITHUB_TOKEN'];
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${GITHUB_API_URL}${path}`, {
      signal: controller.signal,
      headers,
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

function decodeBase64(content: string): string | null {
  try {
    return Buffer.from(content, 'base64').toString('utf-8').slice(0, MAX_README_CHARS);
  } catch {
    return null;
  }
}

const UNCHECKED_README: McpReadmeProbe = {
  checked: false,
  exists: null,
  size: null,
  content: null,
};

/**
 * Inspects the repository declared in the registry record via the GitHub API:
 * existence, archived state, stars, last push, license, and README.
 *
 * Unauthenticated requests are rate-limited by GitHub; when that happens the
 * result is marked unchecked so audits report 'indeterminate' instead of
 * failing the server. Set GITHUB_TOKEN to raise the limit.
 */
export class McpRepoGatherer {
  name = 'mcpRepo';

  async gather(
    config: McpConfig,
    artifacts: Record<string, GatherResult>
  ): Promise<McpRepoGatherResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const repoUrl = registry?.server?.repository?.url ?? null;
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    const empty: McpRepoGatherResult = {
      provider: 'none',
      owner: null,
      repo: null,
      checked: false,
      exists: null,
      archived: null,
      stars: null,
      pushedAt: null,
      license: null,
      readme: { ...UNCHECKED_README },
    };

    if (!repoUrl) return empty;

    const parsed = parseGithubRepoUrl(repoUrl);
    if (!parsed) {
      return { ...empty, provider: 'other' };
    }

    const { owner, repo } = parsed;
    const base: McpRepoGatherResult = { ...empty, provider: 'github', owner, repo };

    const repoRes = await fetchGithubJson(`/repos/${owner}/${repo}`, timeout);
    if (!repoRes) return base;
    if (repoRes.status === 404) {
      return { ...base, checked: true, exists: false, readme: { checked: true, exists: false, size: null, content: null } };
    }
    if (!repoRes.ok || !repoRes.body || typeof repoRes.body !== 'object') {
      // 403/429 (rate limit) or unexpected response: indeterminate
      return base;
    }

    const body = repoRes.body as Record<string, unknown>;
    const license = body['license'];
    const spdxId =
      license && typeof license === 'object'
        ? (license as Record<string, unknown>)['spdx_id']
        : null;

    const result: McpRepoGatherResult = {
      ...base,
      checked: true,
      exists: true,
      archived: typeof body['archived'] === 'boolean' ? body['archived'] : null,
      stars: typeof body['stargazers_count'] === 'number' ? body['stargazers_count'] : null,
      pushedAt: typeof body['pushed_at'] === 'string' ? body['pushed_at'] : null,
      license: typeof spdxId === 'string' ? spdxId : null,
    };

    const readmeRes = await fetchGithubJson(`/repos/${owner}/${repo}/readme`, timeout);
    if (!readmeRes) {
      return result;
    }
    if (readmeRes.status === 404) {
      return { ...result, readme: { checked: true, exists: false, size: null, content: null } };
    }
    if (!readmeRes.ok || !readmeRes.body || typeof readmeRes.body !== 'object') {
      return result;
    }

    const readmeBody = readmeRes.body as Record<string, unknown>;
    const size = typeof readmeBody['size'] === 'number' ? readmeBody['size'] : null;
    const rawContent = readmeBody['content'];
    const content = typeof rawContent === 'string' ? decodeBase64(rawContent) : null;

    return { ...result, readme: { checked: true, exists: true, size, content } };
  }
}
