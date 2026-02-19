import { describe, it, expect } from 'vitest';
import { ContentNegotiationAudit } from '../content-negotiation.js';
import { makeHttpArtifact } from './fixtures.js';

describe('ContentNegotiationAudit', () => {
  const audit = new ContentNegotiationAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('content-negotiation');
  });

  it('should pass when content-type includes application/json', async () => {
    const artifacts = makeHttpArtifact({
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should pass when Vary header includes Accept', async () => {
    const artifacts = makeHttpArtifact({
      headers: {
        'content-type': 'text/html',
        vary: 'Accept, Accept-Encoding',
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no content-type header is present', async () => {
    const artifacts = makeHttpArtifact({
      headers: {},
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when content-type exists but no JSON support', async () => {
    const artifacts = makeHttpArtifact({
      headers: { 'content-type': 'text/plain' },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
