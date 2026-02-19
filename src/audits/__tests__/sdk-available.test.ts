import { describe, it, expect } from 'vitest';
import { SdkAvailableAudit } from '../sdk-available.js';
import { makeApiArtifact } from './fixtures.js';

describe('SdkAvailableAudit', () => {
  const audit = new SdkAvailableAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('sdk-available');
  });

  it('should pass when SDK links are found', async () => {
    const artifacts = makeApiArtifact({ hasSdkLinks: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no SDK links are found', async () => {
    const artifacts = makeApiArtifact({ hasSdkLinks: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
