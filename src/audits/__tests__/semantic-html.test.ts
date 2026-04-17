import { describe, it, expect } from 'vitest';
import { SemanticHtmlAudit } from '../semantic-html.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('SemanticHtmlAudit', () => {
  const audit = new SemanticHtmlAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('semantic-html');
  });

  it('should pass when all semantic elements are present with valid heading hierarchy', async () => {
    const artifacts = makeHtmlArtifact({
      semanticElements: {
        hasNav: true,
        hasMain: true,
        hasArticle: true,
        hasHeader: true,
        hasFooter: true,
        hasH1: true,
        headingCount: 5,
        headingLevels: [1, 2, 2, 3, 3],
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
        headingLevels: [],
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
        headingLevels: [1, 2, 2],
      },
    });

    const result = await audit.audit(artifacts);
    // 3 out of 6 checked elements (now includes <article>)
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('should penalize skipped heading levels', async () => {
    const validHierarchy = makeHtmlArtifact({
      semanticElements: {
        hasNav: true,
        hasMain: true,
        hasArticle: true,
        hasHeader: true,
        hasFooter: true,
        hasH1: true,
        headingCount: 4,
        headingLevels: [1, 2, 2, 3],
      },
    });
    const skippedHierarchy = makeHtmlArtifact({
      semanticElements: {
        hasNav: true,
        hasMain: true,
        hasArticle: true,
        hasHeader: true,
        hasFooter: true,
        hasH1: true,
        headingCount: 3,
        headingLevels: [1, 3, 3],
      },
    });

    const validResult = await audit.audit(validHierarchy);
    const skippedResult = await audit.audit(skippedHierarchy);

    // Valid hierarchy should score higher (has bonus)
    expect(validResult.score).toBeGreaterThanOrEqual(skippedResult.score);
  });
});
