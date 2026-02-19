import { describe, it, expect } from 'vitest';
import { MetaTagsAudit } from '../meta-tags.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('MetaTagsAudit', () => {
  const audit = new MetaTagsAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('meta-tags');
  });

  it('should pass when all essential meta tags are present', async () => {
    const artifacts = makeHtmlArtifact({
      metaTags: {
        title: 'My Site',
        description: 'A description',
        ogTitle: 'My Site OG',
        ogDescription: 'OG Description',
        ogImage: 'https://example.com/image.png',
        canonical: 'https://example.com',
        robots: 'index, follow',
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no meta tags are present', async () => {
    const artifacts = makeHtmlArtifact({
      metaTags: {
        title: null,
        description: null,
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
        canonical: null,
        robots: null,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when some meta tags are missing', async () => {
    const artifacts = makeHtmlArtifact({
      metaTags: {
        title: 'My Site',
        description: 'A description',
        ogTitle: null,
        ogDescription: null,
        ogImage: null,
        canonical: null,
        robots: null,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.5);
  });

  it('should treat empty strings as missing', async () => {
    const artifacts = makeHtmlArtifact({
      metaTags: {
        title: '',
        description: '',
        ogTitle: '',
        ogDescription: '',
        ogImage: null,
        canonical: null,
        robots: null,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
