// Main API
export { runAudit, runRepeatedAudit } from './runner.js';
export { runMcpAudit, runMcpStaticReport, runMcpSweep } from './mcp-runner.js';
export type {
  McpStaticReportConfig,
  McpSweepConfig,
  McpSweepProgress,
  McpAuditContext,
} from './mcp-runner.js';

// Types
export type {
  AXReport,
  AXCategory,
  AuditResult,
  AuditApplicability,
  AXConfig,
  Recommendation,
  AuditDetails,
  AuditRef,
  SiteType,
  StabilityResult,
  McpConfig,
  McpReport,
  McpSweepEntry,
  McpSweepReport,
  McpServerRecord,
  McpRegistryMeta,
  McpRegistryRecord,
  McpRepository,
  McpPackageRef,
  McpRemoteRef,
} from './types.js';

// Base classes (for extensibility)
export { BaseAudit } from './audits/base-audit.js';
export type { AuditMeta } from './audits/base-audit.js';
export { McpBaseAudit } from './audits/mcp-base-audit.js';

export { BaseGatherer } from './gatherers/base-gatherer.js';
export type { GatherResult } from './gatherers/base-gatherer.js';

// Concrete gatherers
export { HttpGatherer } from './gatherers/http-gatherer.js';
export type { HttpGatherResult, FileProbe } from './gatherers/http-gatherer.js';

export { HtmlGatherer } from './gatherers/html-gatherer.js';
export type { HtmlGatherResult, MetaTags, SemanticElements, FeedLink } from './gatherers/html-gatherer.js';

export { ApiGatherer } from './gatherers/api-gatherer.js';
export type { ApiGatherResult } from './gatherers/api-gatherer.js';

// MCP gatherers
export { McpRegistryGatherer, listRegistryServers } from './gatherers/mcp-registry.js';
export type { McpRegistryGatherResult, ListRegistryServersOptions } from './gatherers/mcp-registry.js';

export { McpPackageGatherer } from './gatherers/mcp-package.js';
export type { McpPackageGatherResult, PackageProbe } from './gatherers/mcp-package.js';

export { McpRepoGatherer, GithubRateLimiter, parseGithubRepoUrl } from './gatherers/mcp-repo.js';
export type { McpRepoGatherResult, McpReadmeProbe, McpRepoProvider } from './gatherers/mcp-repo.js';

export { McpRemoteGatherer, isPrivateHost } from './gatherers/mcp-remote.js';
export type { McpRemoteGatherResult, RemoteProbe } from './gatherers/mcp-remote.js';

// MCP config
export {
  getMcpCategories,
  MCP_CATEGORIES,
  DEFAULT_MCP_REGISTRY_URL,
} from './config/mcp.js';

// Reporters
export { renderMcpReport, renderMcpLeaderboard } from './reporter/mcp.js';
export { writeMcpReportFiles } from './reporter/mcp-files.js';
export type { McpReportFilePaths } from './reporter/mcp-files.js';

// Upload
export { uploadReport } from './upload.js';
export type { UploadOptions } from './upload.js';

// Site classification
export { classifySiteType } from './classifiers/site-type.js';
export type { SiteTypeResult } from './classifiers/site-type.js';
