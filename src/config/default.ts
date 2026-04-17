import type { AuditRef, SiteType } from '../types.js';

export interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  weight: number;
  auditRefs: AuditRef[];
}

/**
 * Base category definitions with default weights.
 * These are modified per site type by `getCategoriesForSiteType()`.
 */
const BASE_CATEGORIES: CategoryConfig[] = [
  {
    id: 'discovery',
    title: 'Discovery',
    description: 'Can AI agents find and understand your platform?',
    weight: 25,
    auditRefs: [
      { id: 'llms-txt', weight: 8 },
      { id: 'openapi-spec', weight: 8 },
      { id: 'robots-ai', weight: 4 },
      { id: 'schema-org', weight: 2 },
    ],
  },
  {
    id: 'api-quality',
    title: 'API Quality',
    description: 'Can AI agents effectively use your API?',
    weight: 25,
    auditRefs: [
      { id: 'openapi-valid', weight: 10 },
      { id: 'response-format', weight: 8 },
      { id: 'response-examples', weight: 4 },
      { id: 'content-negotiation', weight: 3 },
    ],
  },
  {
    id: 'structured-data',
    title: 'Structured Data',
    description: 'Is your content machine-readable?',
    weight: 20,
    auditRefs: [
      { id: 'json-ld', weight: 10 },
      { id: 'meta-tags', weight: 5 },
      { id: 'semantic-html', weight: 5 },
    ],
  },
  {
    id: 'auth-onboarding',
    title: 'Auth & Onboarding',
    description: 'Can AI agents self-register and authenticate?',
    weight: 15,
    auditRefs: [
      { id: 'self-service-auth', weight: 10 },
      { id: 'no-captcha', weight: 5 },
    ],
  },
  {
    id: 'error-handling',
    title: 'Error Handling',
    description: 'Can AI agents understand and recover from errors?',
    weight: 10,
    auditRefs: [
      { id: 'error-codes', weight: 5 },
      { id: 'rate-limit-headers', weight: 3 },
      { id: 'retry-after', weight: 2 },
    ],
  },
  {
    id: 'documentation',
    title: 'Documentation',
    description: 'Can AI agents learn how to use your platform?',
    weight: 5,
    auditRefs: [
      { id: 'machine-readable-docs', weight: 3 },
      { id: 'sdk-available', weight: 2 },
    ],
  },
];

/**
 * Audits that are irrelevant for content-only sites.
 * These get weight 0 (skipped) when site type is 'content'.
 */
const API_ONLY_AUDITS = new Set([
  'openapi-spec',
  'openapi-valid',
  'response-format',
  'response-examples',
  'content-negotiation',
  'self-service-auth',
  'error-codes',
  'rate-limit-headers',
  'retry-after',
  'sdk-available',
]);

/**
 * Audits that are less relevant for pure API services.
 * These get reduced weight when site type is 'api'.
 * (Reserved for future use)
 */
// const CONTENT_AUDIT_BOOSTS: Record<string, number> = {
//   'json-ld': 10,
//   'meta-tags': 5,
//   'semantic-html': 5,
// };

/**
 * Returns category configs adjusted for the detected site type.
 *
 * - 'api': Use base weights (optimised for API services)
 * - 'content': Zero-out API-only audits, boost structured data weight
 * - 'hybrid': Keep base weights as-is
 * - 'unknown': Keep base weights as-is (conservative default)
 */
export function getCategoriesForSiteType(siteType: SiteType): CategoryConfig[] {
  if (siteType === 'content') {
    return redistributeWeights(
      BASE_CATEGORIES.map((cat) => ({
        ...cat,
        auditRefs: cat.auditRefs.map((ref) => ({
          ...ref,
          weight: API_ONLY_AUDITS.has(ref.id) ? 0 : ref.weight,
        })),
      }))
    );
  }

  // 'api', 'hybrid', 'unknown' → use base config
  return structuredClone(BASE_CATEGORIES);
}

/**
 * When audits are zeroed out, redistribute the category weight
 * across remaining audits so the category score remains meaningful.
 * Also re-balance category weights: categories with zero active audits
 * get weight 0.
 */
function redistributeWeights(categories: CategoryConfig[]): CategoryConfig[] {
  return categories.map((cat) => {
    const activeRefs = cat.auditRefs.filter((r) => r.weight > 0);
    if (activeRefs.length === 0) {
      return { ...cat, weight: 0, auditRefs: [] };
    }
    return { ...cat, auditRefs: activeRefs };
  });
}

/** For backwards compat */
export const DEFAULT_CATEGORIES: CategoryConfig[] = structuredClone(BASE_CATEGORIES);

export const DEFAULT_TIMEOUT = 30_000;
export const VERSION = '0.3.0';
