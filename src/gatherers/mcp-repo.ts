import type { McpConfig } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const GITHUB_API_URL = 'https://api.github.com';
const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';
const MAX_README_CHARS = 200_000;

/** Longest reset wait worth pausing a sweep for (2 minutes). */
const MAX_RATE_LIMIT_WAIT_MS = 120_000;

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
  /** True when GitHub rate limiting prevented (part of) the lookup. */
  rateLimited: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Shared GitHub rate-limit state.
 *
 * Share one instance across a sweep so that the first exhausted-quota
 * response (403/429 with `X-RateLimit-Remaining: 0`) is respected by every
 * subsequent server: if the reset is imminent (< 2 minutes) the next call
 * waits for it, otherwise all further GitHub lookups are skipped and
 * reported as rate limited, keeping scores position-independent.
 */
export class GithubRateLimiter {
  private exhausted = false;
  private resetAtMs: number | null = null;

  /** True when GitHub lookups are currently being skipped. */
  get isExhausted(): boolean {
    return this.exhausted;
  }

  /**
   * Returns true when a GitHub call may proceed.
   * Waits for an imminent quota reset; returns false when the quota is
   * exhausted with a distant (or unknown) reset.
   */
  async acquire(): Promise<boolean> {
    if (!this.exhausted) return true;

    const waitMs =
      this.resetAtMs === null ? Number.POSITIVE_INFINITY : this.resetAtMs - Date.now();

    if (waitMs <= 0) {
      this.clear();
      return true;
    }
    if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      await sleep(waitMs);
      this.clear();
      return true;
    }
    return false;
  }

  /** Record an exhausted-quota response. `resetAtEpochSeconds` may be null when unknown. */
  recordExhaustion(resetAtEpochSeconds: number | null): void {
    this.exhausted = true;
    this.resetAtMs = resetAtEpochSeconds !== null ? resetAtEpochSeconds * 1000 : null;
  }

  private clear(): void {
    this.exhausted = false;
    this.resetAtMs = null;
  }
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

function getHeader(res: Response, name: string): string | null {
  if (typeof res.headers?.get !== 'function') return null;
  return res.headers.get(name);
}

async function fetchGithubJson(
  path: string,
  timeout: number,
  limiter: GithubRateLimiter
): Promise<JsonProbe | 'rate-limited' | null> {
  if (!(await limiter.acquire())) return 'rate-limited';

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

    if (
      res.status === 429 ||
      (res.status === 403 && getHeader(res, 'x-ratelimit-remaining') === '0')
    ) {
      const reset = getHeader(res, 'x-ratelimit-reset');
      const retryAfter = getHeader(res, 'retry-after');
      let resetAtEpochSeconds: number | null = null;
      if (reset !== null && Number.isFinite(Number.parseInt(reset, 10))) {
        resetAtEpochSeconds = Number.parseInt(reset, 10);
      } else if (retryAfter !== null && Number.isFinite(Number.parseInt(retryAfter, 10))) {
        resetAtEpochSeconds = Math.floor(Date.now() / 1000) + Number.parseInt(retryAfter, 10);
      }
      limiter.recordExhaustion(resetAtEpochSeconds);
      return 'rate-limited';
    }

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
 * result is marked unchecked (and `rateLimited`) so audits report
 * 'indeterminate' instead of failing the server. Pass a shared
 * `GithubRateLimiter` when auditing many servers, and set GITHUB_TOKEN to
 * raise the limit.
 */
export class McpRepoGatherer {
  name = 'mcpRepo';

  constructor(private readonly limiter: GithubRateLimiter = new GithubRateLimiter()) {}

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
      rateLimited: false,
    };

    if (!repoUrl) return empty;

    const parsed = parseGithubRepoUrl(repoUrl);
    if (!parsed) {
      return { ...empty, provider: 'other' };
    }

    const { owner, repo } = parsed;
    const base: McpRepoGatherResult = { ...empty, provider: 'github', owner, repo };

    const repoRes = await fetchGithubJson(`/repos/${owner}/${repo}`, timeout, this.limiter);
    if (repoRes === 'rate-limited') {
      return { ...base, rateLimited: true };
    }
    if (!repoRes) return base;
    if (repoRes.status === 404) {
      return {
        ...base,
        checked: true,
        exists: false,
        readme: { checked: true, exists: false, size: null, content: null },
      };
    }
    if (!repoRes.ok || !repoRes.body || typeof repoRes.body !== 'object') {
      // Non-rate-limit 403 (blocked repo) or unexpected response: indeterminate
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

    const readmeRes = await fetchGithubJson(
      `/repos/${owner}/${repo}/readme`,
      timeout,
      this.limiter
    );
    if (readmeRes === 'rate-limited') {
      return { ...result, rateLimited: true };
    }
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
