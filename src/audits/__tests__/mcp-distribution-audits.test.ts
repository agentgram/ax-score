import { describe, it, expect } from 'vitest';
import { McpPackageResolvableAudit } from '../mcp-package-resolvable.js';
import { McpPackageFreshnessAudit } from '../mcp-package-freshness.js';
import { McpVersionConsistencyAudit } from '../mcp-version-consistency.js';
import { McpRegistryFreshnessAudit } from '../mcp-registry-freshness.js';
import { makeMcpArtifacts, makePackageProbe, daysAgoIso, HEALTHY_META } from './mcp-fixtures.js';

describe('McpPackageResolvableAudit', () => {
  const audit = new McpPackageResolvableAudit();

  it('should pass when all packages resolve', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when the package does not exist', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ packages: [makePackageProbe({ exists: false })] })
    );
    expect(result.score).toBe(0);
  });

  it('should score the resolvable fraction with mixed packages', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [
          makePackageProbe(),
          makePackageProbe({ registryType: 'pypi', identifier: 'missing-pkg', exists: false }),
        ],
      })
    );
    expect(result.score).toBe(0.5);
  });

  it('should be not applicable for remote-only servers', async () => {
    const result = await audit.audit(makeMcpArtifacts({ packages: [] }));
    expect(result.applicability).toBe('not-applicable');
  });

  it('should be indeterminate when only oci packages are declared', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [
          makePackageProbe({
            registryType: 'oci',
            supported: false,
            checked: false,
            exists: null,
          }),
        ],
      })
    );
    expect(result.applicability).toBe('indeterminate');
  });

  it('should be indeterminate when package registries were unreachable', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ packages: [makePackageProbe({ checked: false, exists: null })] })
    );
    expect(result.applicability).toBe('indeterminate');
  });
});

describe('McpPackageFreshnessAudit', () => {
  const audit = new McpPackageFreshnessAudit();

  it('should pass for packages published within 90 days', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should degrade for year-old packages', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [makePackageProbe({ latestPublishedAt: daysAgoIso(300) })],
      })
    );
    expect(result.score).toBe(0.5);
  });

  it('should bottom out for very stale packages', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [makePackageProbe({ latestPublishedAt: daysAgoIso(900) })],
      })
    );
    expect(result.score).toBe(0.1);
  });

  it('should use the freshest package when several are declared', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [
          makePackageProbe({ latestPublishedAt: daysAgoIso(900) }),
          makePackageProbe({ registryType: 'pypi', latestPublishedAt: daysAgoIso(5) }),
        ],
      })
    );
    expect(result.score).toBe(1);
  });

  it('should be not applicable for remote-only servers', async () => {
    const result = await audit.audit(makeMcpArtifacts({ packages: [] }));
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpVersionConsistencyAudit', () => {
  const audit = new McpVersionConsistencyAudit();

  it('should pass when declared versions are published', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail when the declared version was never published', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ packages: [makePackageProbe({ declaredVersionPublished: false })] })
    );
    expect(result.score).toBe(0);
  });

  it('should be not applicable when no version is pinned', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        packages: [makePackageProbe({ declaredVersion: null, declaredVersionPublished: null })],
      })
    );
    expect(result.applicability).toBe('not-applicable');
  });
});

describe('McpRegistryFreshnessAudit', () => {
  const audit = new McpRegistryFreshnessAudit();

  it('should pass for an active, recently updated record', async () => {
    const result = await audit.audit(makeMcpArtifacts());
    expect(result.score).toBe(1);
  });

  it('should fail for deprecated records', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({ registry: { meta: { ...HEALTHY_META, status: 'deprecated' } } })
    );
    expect(result.score).toBe(0);
  });

  it('should degrade for stale records', async () => {
    const result = await audit.audit(
      makeMcpArtifacts({
        registry: {
          meta: { status: 'active', updatedAt: daysAgoIso(400), publishedAt: daysAgoIso(500) },
        },
      })
    );
    expect(result.score).toBe(0.4);
  });

  it('should be indeterminate without official metadata', async () => {
    const result = await audit.audit(makeMcpArtifacts({ registry: { meta: null } }));
    expect(result.applicability).toBe('indeterminate');
  });
});
