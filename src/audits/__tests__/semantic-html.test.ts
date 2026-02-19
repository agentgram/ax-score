import { describe, it, expect } from 'vitest';
import { SemanticHtmlAudit } from '../semantic-html.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('SemanticHtmlAudit', () => {
  const audit = new SemanticHtmlAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('semantic-html');
  });

  it('should pass when all semantic elements are present', async () => {
    const artifacts = makeHtmlArtifact({
      semanticElements: {
        hasNav: true,
        hasMain: true,
        hasArticle: true,
        hasHeader: true,
        hasFooter: true,
        hasH1: true,
        headingCount: 5,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no semantic elements are present', async () => {
    const artifacts = makeHtmlArtifact({
      semanticElements: {
        hasNav: false,
        hasMain: false,
        hasArticle: false,
        hasHeader: false,
        hasFooter: false,
        hasH1: false,
        headingCount: 0,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when some elements are present', async () => {
    const artifacts = makeHtmlArtifact({
      semanticElements: {
        hasNav: true,
        hasMain: true,
        hasArticle: false,
        hasHeader: false,
        hasFooter: false,
        hasH1: true,
        headingCount: 3,
      },
    });

    const result = await audit.audit(artifacts);
    // 3 out of 5 checked elements: nav, main, header, footer, h1
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });
});
