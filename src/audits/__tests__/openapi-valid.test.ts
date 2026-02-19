import { describe, it, expect } from 'vitest';
import { OpenapiValidAudit } from '../openapi-valid.js';
import { makeHttpArtifact } from './fixtures.js';

describe('OpenapiValidAudit', () => {
  const audit = new OpenapiValidAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('openapi-valid');
  });

  it('should pass when OpenAPI spec has all required fields', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: { '/users': {} },
    });
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: spec, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no OpenAPI spec is found', async () => {
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: false, content: null, statusCode: 404 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when OpenAPI spec is invalid JSON', async () => {
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: 'invalid', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when some fields are missing', async () => {
    const spec = JSON.stringify({ openapi: '3.0.0' });
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: spec, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('should recognize swagger version field', async () => {
    const spec = JSON.stringify({
      swagger: '2.0',
      info: { title: 'Test', version: '1.0' },
      paths: { '/users': {} },
    });
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: spec, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });
});
