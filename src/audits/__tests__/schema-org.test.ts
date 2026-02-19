import { describe, it, expect } from 'vitest';
import { SchemaOrgAudit } from '../schema-org.js';
import { makeHtmlArtifact } from './fixtures.js';

describe('SchemaOrgAudit', () => {
  const audit = new SchemaOrgAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('schema-org');
  });

  it('should pass when JSON-LD blocks are present', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [{ '@type': 'WebSite', name: 'Example' }],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no JSON-LD blocks are found', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should report multiple @type values', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [
        { '@type': 'WebSite', name: 'Example' },
        { '@type': 'Organization', name: 'Org' },
      ],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.details?.summary).toContain('2 JSON-LD block(s)');
  });

  it('should handle JSON-LD blocks with array @type', async () => {
    const artifacts = makeHtmlArtifact({
      jsonLd: [{ '@type': ['WebSite', 'CreativeWork'] }],
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
    expect(result.details?.summary).toContain('WebSite');
    expect(result.details?.summary).toContain('CreativeWork');
  });
});
