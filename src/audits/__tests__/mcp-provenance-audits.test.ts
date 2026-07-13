import { describe, it, expect } from 'vitest';
import { McpRepoExistsAudit } from '../mcp-repo-exists.js';
import { McpNamespaceAlignmentAudit } from '../mcp-namespace-alignment.js';
import { McpRepoActivityAudit } from '../mcp-repo-activity.js';
import { McpRepoPopularityAudit } from '../mcp-repo-popularity.js';
import { makeMcpArtifacts, daysAgoIso, HEALTHY_SERVER } from './mcp-fixtures.js';

describe('McpRepoExistsAudit', () => {
  const audit = new McpRepoExistsAudit();

  it('should pass for a live repository', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when no repository is declared', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { provider: 'none', owner: null, repo: null, checked: false, exists: null } })
    );
    expect(result.score).toBe(0);
    expect(result.applicability).toBeUndefined();
  });

  it('should fail when the declared repository does not exist', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { exists: false } }));
    expect(result.score).toBe(0);
  });

  it('should heavily penalize archived repositories', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { archived: true } }));
    expect(result.score).toBe(0.25);
  });

  it('should be indeterminate when GitHub is rate limited', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { checked: false, exists: null } }));
    expect(result.applicability).toBe('indeterminate');
  });

  it('should be indeterminate for non-GitHub hosts', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { provider: 'other', owner: null, repo: null, checked: false, exists: null } })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});

describe('McpNamespaceAlignmentAudit', () => {
  const audit = new McpNamespaceAlignmentAudit();

  it('should pass when the io.github namespace matches the repo owner', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail on a namespace/repo owner mismatch', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { owner: 'someone-else' } }));
    expect(result.score).toBe(0);
  });

  it('should fail when a github namespace has no repository', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { provider: 'none', owner: null, repo: null, checked: false, exists: null } })
    );
    expect(result.score).toBe(0);
  });

  it('should be not applicable for custom-domain namespaces', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        registry: { server: { ...structuredClone(HEALTHY_SERVER), name: 'dev.acme/todo' } },
      })
    );
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpRepoActivityAudit', () => {
  const audit = new McpRepoActivityAudit();

  it('should pass for repositories pushed within 30 days', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should degrade for repositories inactive for months', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { pushedAt: daysAgoIso(200) } })
    );
    expect(result.score).toBe(0.35);
  });

  it('should bottom out for repositories inactive for over a year', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { pushedAt: daysAgoIso(800) } })
    );
    expect(result.score).toBe(0.1);
  });

  it('should be not applicable when no repository is declared', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { provider: 'none', owner: null, repo: null, checked: false, exists: null, pushedAt: null } })
    );
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpRepoPopularityAudit', () => {
  const audit = new McpRepoPopularityAudit();

  it('should score 0.8 for 100+ stars', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(0.8);
  });

  it('should pass for 500+ stars', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { stars: 1200 } }));
    expect(result.score).toBe(1);
  });

  it('should not zero out starless repositories', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { stars: 0 } }));
    expect(result.score).toBe(0.1);
  });

  it('should be indeterminate when GitHub is unreachable', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { checked: false, exists: null, stars: null } })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});
