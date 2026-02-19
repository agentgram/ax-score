import { describe, it, expect } from 'vitest';
import { ErrorCodesAudit } from '../error-codes.js';
import { makeApiArtifact } from './fixtures.js';

describe('ErrorCodesAudit', () => {
  const audit = new ErrorCodesAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('error-codes');
  });

  it('should pass when structured error codes are found', async () => {
    const artifacts = makeApiArtifact({ errorCodeStructured: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no structured error codes are found', async () => {
    const artifacts = makeApiArtifact({ errorCodeStructured: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
