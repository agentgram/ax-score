import { describe, it, expect } from 'vitest';
import { RateLimitHeadersAudit } from '../rate-limit-headers.js';
import { makeApiArtifact } from './fixtures.js';

describe('RateLimitHeadersAudit', () => {
  const audit = new RateLimitHeadersAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('rate-limit-headers');
  });

  it('should pass when rate limit headers are present', async () => {
    const artifacts = makeApiArtifact({
      hasRateLimitHeaders: true,
      rateLimitHeaders: {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '99',
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.details?.items).toHaveLength(2);
  });

  it('should fail when no rate limit headers are present', async () => {
    const artifacts = makeApiArtifact({
      hasRateLimitHeaders: false,
      rateLimitHeaders: {},
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
