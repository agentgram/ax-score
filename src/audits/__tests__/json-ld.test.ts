import { describe, it, expect } from 'vitest';
import { JsonLdAudit } from '../json-ld.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('JsonLdAudit', () => {
  const audit = new JsonLdAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('json-ld');
  });

  it('should pass with high score when rich JSON-LD types are present', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [
        { '@type': 'WebSite', name: 'Example' },
        { '@type': 'BlogPosting', headline: 'Post' },
        { '@type': 'Article', headline: 'Article' },
        { '@type': 'Person', name: 'Author' },
        { '@type': 'Organization', name: 'Org' },
        { '@type': 'BreadcrumbList', itemListElement: [] },
        { '@type': 'FAQPage', mainEntity: [] },
      ],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should give partial score for minimal JSON-LD', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [{ '@type': 'WebPage', name: 'Page' }],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
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
    expect(result.score).toBeGreaterThan(0);
    expect(result.details?.items?.[0]).toHaveProperty('blockCount', 2);
  });

  it('should handle @graph arrays in JSON-LD', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [
        {
          '@graph': [
            { '@type': 'WebSite', name: 'Example' },
            { '@type': 'Organization', name: 'Org' },
          ],
        },
      ],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should handle @type arrays', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [{ '@type': ['Article', 'BlogPosting'], name: 'Post' }],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
  });
});
