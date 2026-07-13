import type { McpConfig } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';
const RETRY_DELAY_MS = 500;

export interface RemoteProbe {
  url: string;
  type: string | null;
  /** Whether the endpoint URL uses HTTPS. */
  https: boolean;
  /** False when the URL was not even parseable. */
  validUrl: boolean;
  /** True when the host is private/loopback/link-local and was not probed. */
  privateHost: boolean;
  /** Whether any HTTP response was received (auth challenges count as reachable). */
  reachable: boolean;
  statusCode: number | null;
}

export interface McpRemoteGatherResult extends GatherResult {
  remotes: RemoteProbe[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detects hosts that must not be probed (and cannot serve a public MCP
 * endpoint): loopback, unspecified, RFC 1918 private ranges, link-local,
 * and their common IPv6 equivalents.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10)
  if (host.includes(':')) {
    return (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe8') ||
      host.startsWith('fe9') ||
      host.startsWith('fea') ||
      host.startsWith('feb')
    );
  }

  // IPv4 literals
  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = octets as [number, number, number, number];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
  }

  return false;
}

async function fetchStatus(url: string, timeout: number): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/event-stream',
      },
      redirect: 'follow',
    });

    // Drain nothing: we only need the status line. Cancel the body if present.
    if (res.body) {
      try {
        await res.body.cancel();
      } catch {
        // Body cancellation failure does not affect the probe result.
      }
    }
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}

async function probeRemote(
  url: string,
  type: string | null,
  timeout: number
): Promise<RemoteProbe> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url,
      type,
      https: false,
      validUrl: false,
      privateHost: false,
      reachable: false,
      statusCode: null,
    };
  }

  const https = parsed.protocol === 'https:';

  if (isPrivateHost(parsed.hostname)) {
    return { url, type, https, validUrl: true, privateHost: true, reachable: false, statusCode: null };
  }

  // One retry with a short delay so a single transient network hiccup
  // does not zero the Operational category.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const statusCode = await fetchStatus(url, timeout);
      return { url, type, https, validUrl: true, privateHost: false, reachable: true, statusCode };
    } catch {
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }

  return { url, type, https, validUrl: true, privateHost: false, reachable: false, statusCode: null };
}

/**
 * Probes the remote endpoints declared in `remotes[]`.
 * Any HTTP response (including 401/405/406) counts as reachable — MCP
 * endpoints commonly reject plain GET requests but a response still proves
 * the endpoint is alive. Only network-level failures (after one retry)
 * count as unreachable. Private/loopback/link-local hosts are never probed.
 */
export class McpRemoteGatherer {
  name = 'mcpRemote';

  async gather(
    config: McpConfig,
    artifacts: Record<string, GatherResult>
  ): Promise<McpRemoteGatherResult> {
    const registry = artifacts['mcpRegistry'] as McpRegistryGatherResult | undefined;
    const refs = registry?.server?.remotes ?? [];
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;

    const remotes = await Promise.all(
      refs
        .filter((ref) => typeof ref.url === 'string' && ref.url.length > 0)
        .map((ref) => probeRemote(ref.url ?? '', ref.type ?? null, timeout))
    );

    return { remotes };
  }
}
