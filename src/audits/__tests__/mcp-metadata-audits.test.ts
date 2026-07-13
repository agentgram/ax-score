import { describe, it, expect } from 'vitest';
import { McpDescriptionQualityAudit } from '../mcp-description-quality.js';
import { McpRepositoryLinkAudit } from '../mcp-repository-link.js';
import { McpVersionValidAudit } from '../mcp-version-valid.js';
import { McpLicenseAudit } from '../mcp-license.js';
import { McpDisplayMetadataAudit } from '../mcp-display-metadata.js';
import { makeMcpArtifacts, makeRegistryArtifact, HEALTHY_SERVER } from './mcp-fixtures.js';

function withServer(overrides: Partial<typeof HEALTHY_SERVER>) {
  return makeMcpArtifacts({
    registry: { server: { ...structuredClone(HEALTHY_SERVER), ...overrides } },
  });
}

describe('McpDescriptionQualityAudit', () => {
  const audit = new McpDescriptionQualityAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('mcp-description-quality');
  });

  it('should pass with a full-sentence description', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when the description is missing', async () => {
    const result = await audit.audit(withServer({ description: '' }));
    expect(result.score).toBe(0);
  });

  it('should score 0.3 for a very short description', async () => {
    const result = await audit.audit(withServer({ description: 'Todo tools.' }));
    expect(result.score).toBe(0.3);
  });

  it('should score 0.7 for a medium description', async () => {
    const result = await audit.audit(
      withServer({ description: 'Manage Acme todo lists over MCP.' })
    );
    expect(result.score).toBe(0.7);
  });

  it('should be indeterminate when the registry record is unavailable', async () => {
    const artifacts = makeMcpArtifacts();
    artifacts['mcpRegistry'] = makeRegistryArtifact({ server: null, fetched: false });
    const result = await audit.audit(artifacts);
    expect(result.applicability).toBe('indeterminate');
  });
});

describe('McpRepositoryLinkAudit', () => {
  const audit = new McpRepositoryLinkAudit();

  it('should pass with a valid https repository URL', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when there is no repository', async () => {
    const result = await audit.audit(withServer({ repository: undefined }));
    expect(result.score).toBe(0);
  });

  it('should partially score a non-https repository URL', async () => {
    const result = await audit.audit(
      withServer({ repository: { url: 'http://github.com/acme/todo-server' } })
    );
    expect(result.score).toBe(0.4);
  });

  it('should partially score an unparseable repository URL', async () => {
    const result = await audit.audit(withServer({ repository: { url: 'not a url' } }));
    expect(result.score).toBe(0.4);
  });
});

describe('McpVersionValidAudit', () => {
  const audit = new McpVersionValidAudit();

  it('should pass with a semver version', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should accept prerelease semver', async () => {
    const result = await audit.audit(withServer({ version: '2.0.0-beta.1' }));
    expect(result.score).toBe(1);
  });

  it('should fail when the version is missing', async () => {
    const result = await audit.audit(withServer({ version: '' }));
    expect(result.score).toBe(0);
  });

  it('should partially score a non-semver version', async () => {
    const result = await audit.audit(withServer({ version: 'latest' }));
    expect(result.score).toBe(0.5);
  });
});

describe('McpLicenseAudit', () => {
  const audit = new McpLicenseAudit();

  it('should pass when the repository declares a license', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when no license is detected', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { license: null } }));
    expect(result.score).toBe(0);
  });

  it('should fail on NOASSERTION licenses', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { license: 'NOASSERTION' } }));
    expect(result.score).toBe(0);
  });

  it('should be not applicable when no repository is declared', async () => {
    const result = await audit.audit(makeMcpArtifacts({ repo: { provider: 'none', owner: null, repo: null, checked: false, exists: null, license: null } }));
    expect(result.applicability).toBe('not-applicable');
  });

  it('should be indeterminate when GitHub was unreachable', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ repo: { checked: false, exists: null, license: null } })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});

describe('McpDisplayMetadataAudit', () => {
  const audit = new McpDisplayMetadataAudit();

  it('should pass with both title and website URL', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should score 0.5 with only a title', async () => {
    const result = await audit.audit(withServer({ websiteUrl: undefined }));
    expect(result.score).toBe(0.5);
  });

  it('should fail with neither title nor website URL', async () => {
    const result = await audit.audit(withServer({ title: undefined, websiteUrl: undefined }));
    expect(result.score).toBe(0);
  });
});
