import { describe, it, expect } from 'vitest';
import { JsonLdAudit } from '../json-ld.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('JsonLdAudit', () => {
  const audit = new JsonLdAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('json-ld');
  });

  it('should pass when JSON-LD blocks exist', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [{ '@type': 'WebSite', name: 'Example' }],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no JSON-LD blocks exist', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should report the count and types of JSON-LD blocks', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [
        { '@type': 'Organization', name: 'Org' },
        { '@type': 'WebPage', name: 'Page' },
      ],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.details?.items?.[0]).toHaveProperty('blockCount', 2);
  });
});
