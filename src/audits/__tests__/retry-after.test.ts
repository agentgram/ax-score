import { describe, it, expect } from 'vitest';
import { RetryAfterAudit } from '../retry-after.js';
import { makeApiArtifact } from './fixtures.js';

describe('RetryAfterAudit', () => {
  const audit = new RetryAfterAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('retry-after');
  });

  it('should pass when Retry-After header support is detected', async () => {
    const artifacts = makeApiArtifact({ hasRetryAfter: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no Retry-After support is detected', async () => {
    const artifacts = makeApiArtifact({ hasRetryAfter: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
