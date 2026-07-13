import type { McpConfig } from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import type { McpRegistryGatherResult } from './mcp-registry.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';

export interface RemoteProbe {
  url: string;
  type: string | null;
  /** Whether the endpoint URL uses HTTPS. */
  https: boolean;
  /** False when the URL was not even parseable. */
  validUrl: boolean;
  /** Whether any HTTP response was received (auth challenges count as reachable). */
  reachable: boolean;
  statusCode: number | null;
}

export interface McpRemoteGatherResult extends GatherResult {
  remotes: RemoteProbe[];
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
    return { url, type, https: false, validUrl: false, reachable: false, statusCode: null };
  }

  const https = parsed.protocol === 'https:';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/event-stream',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    // Drain nothing: we only need the status line. Cancel the body if present.
    if (res.body) {
      try {
        await res.body.cancel();
      } catch {
        // Body cancellation failure does not affect the probe result.
      }
    }

    return { url, type, https, validUrl: true, reachable: true, statusCode: res.status };
  } catch {
    return { url, type, https, validUrl: true, reachable: false, statusCode: null };
  }
}

/**
 * Probes the remote endpoints declared in `remotes[]`.
 * Any HTTP response (including 401/405/406) counts as reachable — MCP
 * endpoints commonly reject plain GET requests but a response still proves
 * the endpoint is alive. Only network-level failures count as unreachable.
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
