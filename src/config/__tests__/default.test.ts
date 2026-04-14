import { describe, it, expect } from 'vitest';
import { getCategoriesForSiteType, DEFAULT_CATEGORIES } from '../default.js';

describe('getCategoriesForSiteType', () => {
  it('should zero out API-only audits for content sites', () => {
    const contentCats = getCategoriesForSiteType('content');

    // API-only audits should have weight 0
    const apiOnlyIds = [
      'openapi-spec', 'openapi-valid', 'response-format',
      'response-examples', 'content-negotiation', 'self-service-auth',
      'error-codes', 'rate-limit-headers', 'retry-after', 'sdk-available',
    ];

    for (const cat of contentCats) {
      for (const ref of cat.auditRefs) {
        if (apiOnlyIds.includes(ref.id)) {
          // These should have been removed by redistributeWeights
          expect.fail(`API-only audit ${ref.id} should not appear in content profile`);
        }
      }
    }
  });

  it('should set weight 0 for categories with no active audits in content mode', () => {
    const contentCats = getCategoriesForSiteType('content');

    const apiQuality = contentCats.find((c) => c.id === 'api-quality');
    expect(apiQuality?.weight).toBe(0);

    const errorHandling = contentCats.find((c) => c.id === 'error-handling');
    expect(errorHandling?.weight).toBe(0);
  });

  it('should keep structured-data category active for content sites', () => {
    const contentCats = getCategoriesForSiteType('content');

    const structuredData = contentCats.find((c) => c.id === 'structured-data');
    expect(structuredData?.weight).toBeGreaterThan(0);
    expect(structuredData?.auditRefs.length).toBeGreaterThan(0);
  });

  it('should keep discovery category partially active for content sites', () => {
    const contentCats = getCategoriesForSiteType('content');

    const discovery = contentCats.find((c) => c.id === 'discovery');
    expect(discovery?.weight).toBeGreaterThan(0);
    // llms-txt and robots-ai should remain
    const remainingIds = discovery!.auditRefs.map((r) => r.id);
    expect(remainingIds).toContain('llms-txt');
    expect(remainingIds).toContain('robots-ai');
    // openapi-spec should be removed
    expect(remainingIds).not.toContain('openapi-spec');
  });

  it('should return default categories for api sites', () => {
    const apiCats = getCategoriesForSiteType('api');

    expect(apiCats.length).toBe(DEFAULT_CATEGORIES.length);
    // All audits should have their default weights
    for (let i = 0; i < apiCats.length; i++) {
      expect(apiCats[i]!.auditRefs.length).toBe(DEFAULT_CATEGORIES[i]!.auditRefs.length);
    }
  });

  it('should return default categories for hybrid sites', () => {
    const hybridCats = getCategoriesForSiteType('hybrid');
    expect(hybridCats.length).toBe(DEFAULT_CATEGORIES.length);
  });

  it('should return default categories for unknown sites', () => {
    const unknownCats = getCategoriesForSiteType('unknown');
    expect(unknownCats.length).toBe(DEFAULT_CATEGORIES.length);
  });
});
