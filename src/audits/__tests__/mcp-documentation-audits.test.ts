import { describe, it, expect } from 'vitest';
import { McpReadmeExistsAudit } from '../mcp-readme-exists.js';
import { McpUsageInstructionsAudit } from '../mcp-usage-instructions.js';
import { makeMcpArtifacts } from './mcp-fixtures.js';

describe('McpReadmeExistsAudit', () => {
  const audit = new McpReadmeExistsAudit();

  it('should pass with a substantial README', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when the repository has no README', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: { readme: { checked: true, exists: false, size: null, content: null } },
      })
    );
    expect(result.score).toBe(0);
  });

  it('should partially score a tiny README', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: { readme: { checked: true, exists: true, size: 120, content: 'stub' } },
      })
    );
    expect(result.score).toBe(0.5);
  });

  it('should fail when no repository is declared', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: {
          provider: 'none',
          owner: null,
          repo: null,
          checked: false,
          exists: null,
          readme: { checked: false, exists: null, size: null, content: null },
        },
      })
    );
    expect(result.score).toBe(0);
    expect(result.applicability).toBeUndefined();
  });

  it('should be indeterminate when the README lookup was rate limited', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: { readme: { checked: false, exists: null, size: null, content: null } },
      })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});

describe('McpUsageInstructionsAudit', () => {
  const audit = new McpUsageInstructionsAudit();

  it('should pass with config snippet, install command, and usage section', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when the README has no setup content', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: {
          readme: {
            checked: true,
            exists: true,
            size: 900,
            content: 'This project is a general summary of things with no setup guidance at all.',
          },
        },
      })
    );
    expect(result.score).toBe(0);
  });

  it('should partially score an install command without a config snippet', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: {
          readme: {
            checked: true,
            exists: true,
            size: 900,
            content: 'Run `npm install todo-mcp-server` to get started.',
          },
        },
      })
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('should be indeterminate when the README could not be fetched', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        repo: { readme: { checked: false, exists: null, size: null, content: null } },
      })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});
