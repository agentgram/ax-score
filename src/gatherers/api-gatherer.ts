import type { AXConfig } from '../types.js';
import { BaseGatherer, type GatherResult } from './base-gatherer.js';
import type { HttpGatherResult } from './http-gatherer.js';

export interface ApiGatherResult extends GatherResult {
  hasOpenApi: boolean;
  openapiVersion: string | null;
  endpointCount: number;
  hasJsonContentType: boolean;
  hasAuthEndpoint: boolean;
  hasCaptcha: boolean;
  errorCodeStructured: boolean;
  hasRateLimitHeaders: boolean;
  rateLimitHeaders: Record<string, string>;
  hasRetryAfter: boolean;
  hasExamples: boolean;
  hasSdkLinks: boolean;
  hasMachineReadableDocs: boolean;
}

/**
 * Analyzes API-related artifacts from the HTTP gatherer:
 * OpenAPI spec validity, response headers, auth patterns, etc.
 */
export class ApiGatherer extends BaseGatherer {
  name = 'api';

  async gather(
    _config: AXConfig,
    artifacts?: Record<string, GatherResult>
  ): Promise<ApiGatherResult> {
    const httpResult = artifacts?.['http'] as HttpGatherResult | undefined;
    const openapiContent = httpResult?.openapiSpec?.content ?? null;
    const headers = httpResult?.headers ?? {};
    const body = httpResult?.body ?? '';

    // Parse OpenAPI spec if found
    let hasOpenApi = false;
    let openapiVersion: string | null = null;
    let endpointCount = 0;
    let hasExamples = false;

    if (openapiContent) {
      try {
        const spec = JSON.parse(openapiContent) as Record<string, unknown>;
        hasOpenApi = true;
        openapiVersion =
          (spec.openapi as string) ?? (spec.swagger as string) ?? null;

        // Count paths
        const paths = spec.paths as Record<string, unknown> | undefined;
        if (paths && typeof paths === 'object') {
          endpointCount = Object.keys(paths).length;

          // Check for examples in any operation
          const specStr = openapiContent.toLowerCase();
          hasExamples =
            specStr.includes('"example"') || specStr.includes('"examples"');
        }
      } catch {
        // Invalid JSON — still mark as found but invalid
        hasOpenApi = false;
      }
    }

    // Check content type
    const contentType = headers['content-type'] ?? '';
    const hasJsonContentType =
      contentType.includes('application/json') ||
      contentType.includes('text/html');

    // Check for auth endpoints (heuristic)
    const hasAuthEndpoint =
      body.includes('/auth') ||
      body.includes('/login') ||
      body.includes('/register') ||
      body.includes('/signup') ||
      body.includes('/oauth') ||
      body.includes('/api/token') ||
      (openapiContent?.includes('/auth') ?? false) ||
      (openapiContent?.includes('securitySchemes') ?? false);

    // Check for CAPTCHA
    const bodyLower = body.toLowerCase();
    const hasCaptcha =
      bodyLower.includes('recaptcha') ||
      bodyLower.includes('hcaptcha') ||
      bodyLower.includes('captcha');

    // Check error structure (heuristic from OpenAPI spec or HTML)
    const errorCodeStructured =
      (openapiContent?.includes('"error"') ?? false) ||
      (openapiContent?.includes('"message"') ?? false) ||
      (openapiContent?.includes('"code"') ?? false);

    // Rate limit headers
    const rateLimitHeaders: Record<string, string> = {};
    const rateLimitKeys = [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
      'retry-after',
    ];
    for (const key of rateLimitKeys) {
      const value = headers[key];
      if (value) {
        rateLimitHeaders[key] = value;
      }
    }

    const hasRateLimitHeaders = Object.keys(rateLimitHeaders).length > 0;
    const hasRetryAfter =
      'retry-after' in rateLimitHeaders ||
      (openapiContent?.toLowerCase().includes('retry-after') ?? false);

    // SDK / documentation links
    const hasSdkLinks =
      bodyLower.includes('sdk') ||
      bodyLower.includes('npm install') ||
      bodyLower.includes('pip install') ||
      bodyLower.includes('github.com') ||
      bodyLower.includes('developer') ||
      (openapiContent?.toLowerCase().includes('sdk') ?? false);

    // Machine-readable docs
    const hasMachineReadableDocs =
      hasOpenApi ||
      (httpResult?.llmsTxt?.found ?? false) ||
      (httpResult?.aiPlugin?.found ?? false);

    return {
      hasOpenApi,
      openapiVersion,
      endpointCount,
      hasJsonContentType,
      hasAuthEndpoint,
      hasCaptcha,
      errorCodeStructured,
      hasRateLimitHeaders,
      rateLimitHeaders,
      hasRetryAfter,
      hasExamples,
      hasSdkLinks,
      hasMachineReadableDocs,
    };
  }
}
