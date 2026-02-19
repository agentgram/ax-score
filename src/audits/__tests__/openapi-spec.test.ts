import { describe, it, expect } from 'vitest';
import { OpenapiSpecAudit } from '../openapi-spec.js';
import { makeHttpArtifact } from './fixtures.js';

describe('OpenapiSpecAudit', () => {
  const audit = new OpenapiSpecAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('openapi-spec');
  });

  it('should pass when a valid openapi.json is found', async () => {
    const spec = JSON.stringify({ openapi: '3.0.0', info: {}, paths: {} });
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: spec, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when openapi.json is not found', async () => {
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: false, content: null, statusCode: 404 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when openapi.json is empty', async () => {
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: '', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.5);
  });

  it('should return partial score when openapi.json contains invalid JSON', async () => {
    const artifacts = makeHttpArtifact({
      openapiSpec: { found: true, content: 'not-json{{{', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.3);
  });
});
