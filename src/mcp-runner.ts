import type {
  AuditResult,
  AXCategory,
  McpConfig,
  McpReport,
  McpSweepEntry,
  McpSweepReport,
} from './types.js';
import type { GatherResult } from './gatherers/base-gatherer.js';
import type { CategoryConfig } from './config/default.js';
import { VERSION } from './config/default.js';
import {
  DEFAULT_MCP_REGISTRY_URL,
  DEFAULT_MCP_SWEEP_CONCURRENCY,
  getMcpCategories,
} from './config/mcp.js';
import {
  calculateCategoryScore,
  calculateOverallScore,
  generateRecommendations,
} from './scoring.js';

// Gatherers
import { McpRegistryGatherer, listRegistryServers } from './gatherers/mcp-registry.js';
import { McpPackageGatherer } from './gatherers/mcp-package.js';
import { McpRepoGatherer, GithubRateLimiter } from './gatherers/mcp-repo.js';
import { McpRemoteGatherer } from './gatherers/mcp-remote.js';

// Audits — Metadata Completeness
import { McpDescriptionQualityAudit } from './audits/mcp-description-quality.js';
import { McpRepositoryLinkAudit } from './audits/mcp-repository-link.js';
import { McpVersionValidAudit } from './audits/mcp-version-valid.js';
import { McpLicenseAudit } from './audits/mcp-license.js';
import { McpDisplayMetadataAudit } from './audits/mcp-display-metadata.js';

// Audits — Distribution Health
import { McpPackageResolvableAudit } from './audits/mcp-package-resolvable.js';
import { McpPackageFreshnessAudit } from './audits/mcp-package-freshness.js';
import { McpVersionConsistencyAudit } from './audits/mcp-version-consistency.js';
import { McpRegistryFreshnessAudit } from './audits/mcp-registry-freshness.js';

// Audits — Provenance & Trust
import { McpRepoExistsAudit } from './audits/mcp-repo-exists.js';
import { McpNamespaceAlignmentAudit } from './audits/mcp-namespace-alignment.js';
import { McpRepoActivityAudit } from './audits/mcp-repo-activity.js';
import { McpRepoPopularityAudit } from './audits/mcp-repo-popularity.js';

// Audits — Operational
import { McpRemoteReachableAudit } from './audits/mcp-remote-reachable.js';
import { McpRemoteTlsAudit } from './audits/mcp-remote-tls.js';
import { McpServerRecordValidAudit } from './audits/mcp-server-record-valid.js';

// Audits — Documentation
import { McpReadmeExistsAudit } from './audits/mcp-readme-exists.js';
import { McpUsageInstructionsAudit } from './audits/mcp-usage-instructions.js';

import type { BaseAudit } from './audits/base-audit.js';

/** All registered MCP audits. Order does not matter — they are mapped by ID. */
function createMcpAudits(): BaseAudit[] {
  return [
    // Metadata Completeness
    new McpDescriptionQualityAudit(),
    new McpRepositoryLinkAudit(),
    new McpVersionValidAudit(),
    new McpLicenseAudit(),
    new McpDisplayMetadataAudit(),
    // Distribution Health
    new McpPackageResolvableAudit(),
    new McpPackageFreshnessAudit(),
    new McpVersionConsistencyAudit(),
    new McpRegistryFreshnessAudit(),
    // Provenance & Trust
    new McpRepoExistsAudit(),
    new McpNamespaceAlignmentAudit(),
    new McpRepoActivityAudit(),
    new McpRepoPopularityAudit(),
    // Operational
    new McpRemoteReachableAudit(),
    new McpRemoteTlsAudit(),
    new McpServerRecordValidAudit(),
    // Documentation
    new McpReadmeExistsAudit(),
    new McpUsageInstructionsAudit(),
  ];
}

/**
 * Zero out the weight of audits that could not be evaluated
 * ('not-applicable' or 'indeterminate') so missing evidence never
 * counts as a failure. Categories left without any active audit
 * get a weight of 0 themselves.
 */
function applyApplicability(
  categories: CategoryConfig[],
  audits: Record<string, AuditResult>
): CategoryConfig[] {
  return categories.map((cat) => {
    const auditRefs = cat.auditRefs.map((ref) => {
      const result = audits[ref.id];
      const excluded =
        result?.applicability === 'not-applicable' ||
        result?.applicability === 'indeterminate';
      return excluded ? { ...ref, weight: 0 } : ref;
    });
    const hasActive = auditRefs.some((ref) => ref.weight > 0);
    return { ...cat, weight: hasActive ? cat.weight : 0, auditRefs };
  });
}

/** Shared per-run context, used by sweeps to coordinate rate-limit state. */
export interface McpAuditContext {
  githubLimiter?: GithubRateLimiter;
}

/**
 * Run an MCP server audit.
 * Orchestrates the Gather → Audit → Score → Report pipeline against the
 * official MCP Registry, package registries, GitHub, and remote endpoints.
 */
export async function runMcpAudit(
  config: McpConfig,
  context: McpAuditContext = {}
): Promise<McpReport> {
  // Phase 1: Gather — registry record first, derived evidence second
  const artifacts: Record<string, GatherResult> = {};

  const registryResult = await new McpRegistryGatherer().gather(config);
  artifacts['mcpRegistry'] = registryResult;

  if (!registryResult.server) {
    throw new Error(
      registryResult.error ?? `Could not load a registry record for "${config.server}".`
    );
  }

  const [packageResult, repoResult, remoteResult] = await Promise.all([
    new McpPackageGatherer().gather(config, artifacts),
    new McpRepoGatherer(context.githubLimiter).gather(config, artifacts),
    new McpRemoteGatherer().gather(config, artifacts),
  ]);
  artifacts['mcpPackage'] = packageResult;
  artifacts['mcpRepo'] = repoResult;
  artifacts['mcpRemote'] = remoteResult;

  // Phase 2: Audit
  const allAudits = createMcpAudits();
  const audits: Record<string, AuditResult> = {};

  await Promise.all(
    allAudits.map(async (auditInstance) => {
      try {
        const result = await auditInstance.audit(artifacts);
        audits[result.id] = result;
      } catch (err) {
        audits[auditInstance.meta.id] = {
          id: auditInstance.meta.id,
          title: auditInstance.meta.failureTitle,
          description: `Audit error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          score: 0,
          weight: 0,
          scoreDisplayMode: auditInstance.meta.scoreDisplayMode,
        };
      }
    })
  );

  // Phase 3: Score — with non-evaluable audits excluded from weighting
  const categoriesConfig = applyApplicability(getMcpCategories(), audits);
  const categories: AXCategory[] = categoriesConfig.map((cat) => ({
    id: cat.id,
    title: cat.title,
    description: cat.description,
    weight: cat.weight,
    score: calculateCategoryScore(audits, cat.auditRefs),
    auditRefs: cat.auditRefs,
  }));

  const allAuditRefs = categoriesConfig.flatMap((c) => c.auditRefs);
  const recommendations = generateRecommendations(audits, allAuditRefs);

  return {
    server: registryResult.server.name ?? config.server,
    serverVersion: registryResult.server.version ?? null,
    registryUrl: registryResult.registryUrl,
    timestamp: new Date().toISOString(),
    version: VERSION,
    score: calculateOverallScore(categories),
    rateLimited: repoResult.rateLimited,
    categories,
    audits,
    recommendations,
  };
}

export interface McpSweepConfig {
  /** Number of servers to fetch from the registry. */
  limit: number;
  registryUrl?: string;
  timeout?: number;
  /** Maximum concurrent server audits. Defaults to 5. */
  concurrency?: number;
}

export interface McpSweepProgress {
  completed: number;
  total: number;
  server: string;
}

/** Run `fn` over `items` with at most `limit` tasks in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Fetch up to `limit` servers from the registry, audit them concurrently,
 * and return a ranking report (highest score first, failures last).
 */
export async function runMcpSweep(
  config: McpSweepConfig,
  onProgress?: (progress: McpSweepProgress) => void
): Promise<McpSweepReport> {
  const registryUrl = (config.registryUrl ?? DEFAULT_MCP_REGISTRY_URL).replace(/\/+$/, '');
  const concurrency = config.concurrency ?? DEFAULT_MCP_SWEEP_CONCURRENCY;

  const records = await listRegistryServers({
    limit: config.limit,
    registryUrl,
    timeout: config.timeout,
  });

  // One limiter for the whole sweep: the first exhausted-quota response
  // switches every later GitHub lookup to indeterminate instead of letting
  // scores depend on a server's position in the queue.
  const githubLimiter = new GithubRateLimiter();

  let completed = 0;
  const entries = await mapWithConcurrency(records, concurrency, async (record) => {
    const serverName = record.server.name ?? '(unnamed server)';
    let entry: McpSweepEntry;

    try {
      const report = await runMcpAudit(
        {
          server: serverName,
          registryUrl,
          timeout: config.timeout,
          record,
        },
        { githubLimiter }
      );
      // A fully excluded category (weight 0) is reported as null — "we could
      // not evaluate this" — never as a genuine score of 0.
      const categoryScores: Record<string, number | null> = {};
      for (const category of report.categories) {
        categoryScores[category.id] = category.weight === 0 ? null : category.score;
      }
      let notApplicableAudits = 0;
      let indeterminateAudits = 0;
      for (const audit of Object.values(report.audits)) {
        if (audit.applicability === 'not-applicable') notApplicableAudits += 1;
        if (audit.applicability === 'indeterminate') indeterminateAudits += 1;
      }
      entry = {
        server: report.server,
        serverVersion: report.serverVersion,
        score: report.score,
        categoryScores,
        notApplicableAudits,
        indeterminateAudits,
        rateLimited: report.rateLimited,
      };
    } catch (err) {
      entry = {
        server: serverName,
        serverVersion: record.server.version ?? null,
        score: null,
        categoryScores: {},
        notApplicableAudits: 0,
        indeterminateAudits: 0,
        rateLimited: githubLimiter.isExhausted,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }

    completed += 1;
    onProgress?.({ completed, total: records.length, server: serverName });
    return entry;
  });

  const ranked = [...entries].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const failed = ranked.filter((e) => e.score === null).length;

  return {
    registryUrl,
    timestamp: new Date().toISOString(),
    version: VERSION,
    requested: config.limit,
    scored: ranked.length - failed,
    failed,
    entries: ranked,
  };
}
