import type { AXConfig } from '../types.js';
import { BaseGatherer, type GatherResult } from './base-gatherer.js';
import { DEFAULT_TIMEOUT } from '../config/default.js';

export interface FileProbe {
  found: boolean;
  content: string | null;
  statusCode: number | null;
}

export interface HttpGatherResult extends GatherResult {
  url: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  robotsTxt: FileProbe;
  llmsTxt: FileProbe;
  openapiSpec: FileProbe;
  aiPlugin: FileProbe;
  sitemapXml: FileProbe;
  securityTxt: FileProbe;
}

const MAX_BODY_SIZE = 512_000; // 512KB

async function fetchFile(
  baseUrl: string,
  path: string,
  timeout: number
): Promise<FileProbe> {
  try {
    const url = new URL(path, baseUrl).href;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AX-Score/1.0 (agent-audit)' },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { found: false, content: null, statusCode: res.status };
    }

    const text = await res.text();
    return {
      found: true,
      content: text.slice(0, MAX_BODY_SIZE),
      statusCode: res.status,
    };
  } catch {
    return { found: false, content: null, statusCode: null };
  }
}

/**
 * Fetches the target URL and probes well-known files.
 */
export class HttpGatherer extends BaseGatherer {
  name = 'http';

  async gather(config: AXConfig): Promise<HttpGatherResult> {
    const timeout = config.timeout ?? DEFAULT_TIMEOUT;
    const baseUrl = config.url;

    // Fetch main page + well-known files in parallel
    const [main, robotsTxt, llmsTxt, openapiSpec, aiPlugin, sitemapXml, securityTxt] =
      await Promise.all([
        fetchFile(baseUrl, '/', timeout),
        fetchFile(baseUrl, '/robots.txt', timeout),
        fetchFile(baseUrl, '/llms.txt', timeout),
        fetchFile(baseUrl, '/openapi.json', timeout),
        fetchFile(baseUrl, '/.well-known/ai-plugin.json', timeout),
        fetchFile(baseUrl, '/sitemap.xml', timeout),
        fetchFile(baseUrl, '/.well-known/security.txt', timeout),
      ]);

    const headers: Record<string, string> = {};
    // Re-fetch main page headers (the fetchFile above already did this)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(baseUrl, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'AX-Score/1.0 (agent-audit)' },
        redirect: 'follow',
      });
      clearTimeout(timer);
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } catch {
      // Fallback: headers remain empty
    }

    return {
      url: baseUrl,
      statusCode: main.statusCode ?? 0,
      headers,
      body: main.content ?? '',
      robotsTxt,
      llmsTxt,
      openapiSpec,
      aiPlugin,
      sitemapXml,
      securityTxt,
    };
  }
}
