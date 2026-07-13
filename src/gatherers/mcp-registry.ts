import type {
  McpConfig,
  McpRegistryMeta,
  McpRegistryRecord,
  McpServerRecord,
} from '../types.js';
import type { GatherResult } from './base-gatherer.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';
import { DEFAULT_MCP_REGISTRY_URL } from '../config/mcp.js';

const OFFICIAL_META_KEY = 'io.modelcontextprotocol.registry/official';
const PAGE_SIZE = 100;
/** Hard cap on pagination requests per sweep (500 pages x 100 = 50k servers). */
const MAX_PAGES = 500;
const USER_AGENT = 'AX-Score/1.0 (mcp-audit)';

export interface McpRegistryGatherResult extends GatherResult {
  registryUrl: string;
  /** True when the registry responded (even with "not found"). */
  fetched: boolean;
  error: string | null;
  server: McpServerRecord | null;
  meta: McpRegistryMeta | null;
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

function normalizeBaseUrl(registryUrl: string): string {
  return registryUrl.replace(/\/+$/, '');
}

/** Extract `{ server, meta }` from a raw registry entry, or null when malformed. */
export function parseRegistryEntry(entry: unknown): McpRegistryRecord | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const server = record['server'];
  if (!server || typeof server !== 'object') return null;

  const metaWrapper = record['_meta'];
  let meta: McpRegistryMeta | null = null;
  if (metaWrapper && typeof metaWrapper === 'object') {
    const official = (metaWrapper as Record<string, unknown>)[OFFICIAL_META_KEY];
    if (official && typeof official === 'object') {
      meta = official as McpRegistryMeta;
    }
  }

  return { server: server as McpServerRecord, meta };
}

/**
 * Fetches a single server record from the official MCP Registry
 * (`GET /v0/servers/{name}/versions/latest`).
 *
 * When `config.record` is provided (e.g., during a sweep), the registry
 * is not queried again.
 */
export class McpRegistryGatherer {
  name = 'mcpRegistry';

  async gather(config: McpConfig): Promise<McpRegistryGatherResult> {
    const registryUrl = normalizeBaseUrl(config.registryUrl ?? DEFAULT_MCP_REGISTRY_URL);

    if (config.record) {
      return {
        registryUrl,
        fetched: true,
        error: null,
        server: config.record.server,
        meta: config.record.meta,
      };
    }

    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    const url = `${registryUrl}/v0/servers/${encodeURIComponent(config.server)}/versions/latest`;
    const res = await fetchJson(url, timeout);

    if (!res) {
      return {
        registryUrl,
        fetched: false,
        error: 'MCP Registry was unreachable.',
        server: null,
        meta: null,
      };
    }

    if (res.status === 404) {
      return {
        registryUrl,
        fetched: true,
        error: `Server "${config.server}" was not found in the registry.`,
        server: null,
        meta: null,
      };
    }

    if (!res.ok) {
      return {
        registryUrl,
        fetched: false,
        error: `MCP Registry responded with HTTP ${res.status}.`,
        server: null,
        meta: null,
      };
    }

    const record = parseRegistryEntry(res.body);
    if (!record) {
      return {
        registryUrl,
        fetched: true,
        error: 'MCP Registry returned a malformed server record.',
        server: null,
        meta: null,
      };
    }

    return {
      registryUrl,
      fetched: true,
      error: null,
      server: record.server,
      meta: record.meta,
    };
  }
}

export interface ListRegistryServersOptions {
  limit: number;
  registryUrl?: string;
  timeout?: number;
}

/**
 * Lists up to `limit` latest-version server records from the registry,
 * following cursor pagination. Records are de-duplicated by server name.
 * Throws when the registry cannot be reached at all.
 */
export async function listRegistryServers(
  options: ListRegistryServersOptions
): Promise<McpRegistryRecord[]> {
  const registryUrl = normalizeBaseUrl(options.registryUrl ?? DEFAULT_MCP_REGISTRY_URL);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const records: McpRegistryRecord[] = [];
  const seen = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;

  while (records.length < options.limit && pages < MAX_PAGES) {
    pages += 1;
    const pageSize = Math.min(PAGE_SIZE, options.limit - records.length);
    const params = new URLSearchParams({ version: 'latest', limit: String(pageSize) });
    if (cursor) params.set('cursor', cursor);

    const res = await fetchJson(`${registryUrl}/v0/servers?${params.toString()}`, timeout);
    if (!res) {
      throw new Error('MCP Registry was unreachable.');
    }
    if (!res.ok) {
      throw new Error(`MCP Registry responded with HTTP ${res.status}.`);
    }

    const body = (res.body ?? {}) as Record<string, unknown>;
    const rawServers = Array.isArray(body['servers']) ? (body['servers'] as unknown[]) : [];

    for (const entry of rawServers) {
      const record = parseRegistryEntry(entry);
      if (!record) continue;
      const name = record.server.name ?? '';
      if (name.length > 0 && seen.has(name)) continue;
      seen.add(name);
      records.push(record);
      if (records.length >= options.limit) break;
    }

    const metadata = body['metadata'];
    const nextCursor =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)['nextCursor']
        : null;

    if (typeof nextCursor !== 'string' || nextCursor.length === 0 || rawServers.length === 0) {
      break;
    }
    // Guard against cyclic pagination: a cursor we have already followed
    // (or one identical to the current cursor) would loop forever.
    if (seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return records;
}
