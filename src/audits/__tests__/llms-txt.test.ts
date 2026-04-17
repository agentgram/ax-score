import { describe, it, expect } from 'vitest';
import { LlmsTxtAudit } from '../llms-txt.js';
import { makeHttpArtifact } from './fixtures.js';

describe('LlmsTxtAudit', () => {
  const audit = new LlmsTxtAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('llms-txt');
  });

  it('should pass with high score when llms.txt has full structure and llms-full.txt exists', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: {
        found: true,
        content: '# My Site\n\n> A description of my site\n\n### Docs\n\nhttps://example.com/docs This is a long enough content to pass the 100 char threshold check.',
        statusCode: 200,
      },
      llmsFullTxt: {
        found: true,
        content: '# Full docs\nLots of content here...',
        statusCode: 200,
      },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.id).toBe('llms-txt');
  });

  it('should return partial score when llms.txt has minimal content', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: true, content: 'just some text', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('should fail when llms.txt is not found', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: false, content: null, statusCode: 404 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when llms.txt is empty', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: true, content: '', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.2);
  });

  it('should return partial score when llms.txt contains only whitespace', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: true, content: '   \n  ', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.2);
  });

  it('should give bonus for companion llms-full.txt', async () => {
    const without = await audit.audit(makeHttpArtifact({
      llmsTxt: { found: true, content: '# Site\nSome text here.', statusCode: 200 },
    }));
    const withFull = await audit.audit(makeHttpArtifact({
      llmsTxt: { found: true, content: '# Site\nSome text here.', statusCode: 200 },
      llmsFullTxt: { found: true, content: 'Full content here', statusCode: 200 },
    }));

    expect(withFull.score).toBeGreaterThan(without.score);
  });
});
