import { describe, it, expect } from 'vitest';
import { ResponseExamplesAudit } from '../response-examples.js';
import { makeApiArtifact } from './fixtures.js';

describe('ResponseExamplesAudit', () => {
  const audit = new ResponseExamplesAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('response-examples');
  });

  it('should pass when OpenAPI spec contains examples', async () => {
    const artifacts = makeApiArtifact({ hasOpenApi: true, hasExamples: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when OpenAPI spec lacks examples', async () => {
    const artifacts = makeApiArtifact({ hasOpenApi: true, hasExamples: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when no OpenAPI spec is found', async () => {
    const artifacts = makeApiArtifact({ hasOpenApi: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
