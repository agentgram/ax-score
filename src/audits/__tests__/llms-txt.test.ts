import { describe, it, expect } from 'vitest';
import { LlmsTxtAudit } from '../llms-txt.js';
import { makeHttpArtifact } from './fixtures.js';

describe('LlmsTxtAudit', () => {
  const audit = new LlmsTxtAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('llms-txt');
  });

  it('should pass when llms.txt is found with content', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: true, content: '# My Site\nThis is a description.', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.id).toBe('llms-txt');
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
    expect(result.score).toBe(0.5);
  });

  it('should return partial score when llms.txt contains only whitespace', async () => {
    const artifacts = makeHttpArtifact({
      llmsTxt: { found: true, content: '   \n  ', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.5);
  });
});
