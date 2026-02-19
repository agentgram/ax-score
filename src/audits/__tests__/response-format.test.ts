import { describe, it, expect } from 'vitest';
import { ResponseFormatAudit } from '../response-format.js';
import { makeApiArtifact } from './fixtures.js';

describe('ResponseFormatAudit', () => {
  const audit = new ResponseFormatAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('response-format');
  });

  it('should pass when API returns JSON content type', async () => {
    const artifacts = makeApiArtifact({ hasJsonContentType: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when API does not return JSON content type', async () => {
    const artifacts = makeApiArtifact({ hasJsonContentType: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
