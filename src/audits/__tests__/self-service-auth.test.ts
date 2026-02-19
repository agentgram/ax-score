import { describe, it, expect } from 'vitest';
import { SelfServiceAuthAudit } from '../self-service-auth.js';
import { makeApiArtifact } from './fixtures.js';

describe('SelfServiceAuthAudit', () => {
  const audit = new SelfServiceAuthAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('self-service-auth');
  });

  it('should pass when auth endpoints are found', async () => {
    const artifacts = makeApiArtifact({ hasAuthEndpoint: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no auth endpoints are found', async () => {
    const artifacts = makeApiArtifact({ hasAuthEndpoint: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
