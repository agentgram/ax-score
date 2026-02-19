import { describe, it, expect } from 'vitest';
import { AiPluginAudit } from '../ai-plugin.js';
import { makeHttpArtifact } from './fixtures.js';

describe('AiPluginAudit', () => {
  const audit = new AiPluginAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('ai-plugin');
  });

  it('should pass when a valid ai-plugin.json is found', async () => {
    const manifest = JSON.stringify({
      schema_version: 'v1',
      name_for_human: 'My Plugin',
      name_for_model: 'my_plugin',
    });
    const artifacts = makeHttpArtifact({
      aiPlugin: { found: true, content: manifest, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when ai-plugin.json is not found', async () => {
    const artifacts = makeHttpArtifact({
      aiPlugin: { found: false, content: null, statusCode: 404 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when ai-plugin.json is empty', async () => {
    const artifacts = makeHttpArtifact({
      aiPlugin: { found: true, content: '', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when ai-plugin.json contains invalid JSON', async () => {
    const artifacts = makeHttpArtifact({
      aiPlugin: { found: true, content: 'not-valid-json', statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when ai-plugin.json is missing required fields', async () => {
    const manifest = JSON.stringify({ some_field: 'value' });
    const artifacts = makeHttpArtifact({
      aiPlugin: { found: true, content: manifest, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0.5);
  });
});
