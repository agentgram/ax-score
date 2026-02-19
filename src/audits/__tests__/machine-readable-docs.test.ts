import { describe, it, expect } from 'vitest';
import { MachineReadableDocsAudit } from '../machine-readable-docs.js';
import { makeApiArtifact } from './fixtures.js';

describe('MachineReadableDocsAudit', () => {
  const audit = new MachineReadableDocsAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('machine-readable-docs');
  });

  it('should pass when machine-readable docs are found', async () => {
    const artifacts = makeApiArtifact({ hasMachineReadableDocs: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when no machine-readable docs are found', async () => {
    const artifacts = makeApiArtifact({ hasMachineReadableDocs: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
