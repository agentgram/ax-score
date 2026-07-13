export type SiteType = 'api' | 'content' | 'hybrid' | 'unknown';

export interface AXConfig {
  url: string;
  timeout?: number;
  categories?: string[];
  verbose?: boolean;
}

/**
 * Whether an audit could actually be evaluated.
 * - 'applicable': normal result that counts toward the score (default when omitted)
 * - 'not-applicable': the target has nothing to evaluate (e.g., no remote endpoints)
 * - 'indeterminate': evidence could not be gathered (e.g., a third-party API was unreachable)
 *
 * Not-applicable and indeterminate audits are excluded from weighting so that
 * missing evidence is never scored as a failure.
 */
export type AuditApplicability = 'applicable' | 'not-applicable' | 'indeterminate';

export interface AuditResult {
  id: string;
  title: string;
  description: string;
  score: number;
  weight: number;
  scoreDisplayMode: 'numeric' | 'binary' | 'informative';
  applicability?: AuditApplicability;
  details?: AuditDetails;
}

export interface AuditDetails {
  type: 'table' | 'list' | 'text';
  items?: Array<Record<string, unknown>>;
  summary?: string;
}

export interface AXCategory {
  id: string;
  title: string;
  description: string;
  score: number;
  weight: number;
  auditRefs: AuditRef[];
}

export interface AuditRef {
  id: string;
  weight: number;
}

export interface AXReport {
  url: string;
  timestamp: string;
  version: string;
  score: number;
  siteType: SiteType;
  categories: AXCategory[];
  audits: Record<string, AuditResult>;
  recommendations: Recommendation[];
  stability?: StabilityResult;
}

export interface Recommendation {
  audit: string;
  message: string;
  impact: number;
}

export interface StabilityResult {
  runs: number;
  scores: number[];
  min: number;
  max: number;
  mean: number;
  delta: number;
  variance: number;
}

// ---------------------------------------------------------------------------
// MCP server scoring mode
// ---------------------------------------------------------------------------

/** Repository reference inside an MCP Registry server record. */
export interface McpRepository {
  url?: string;
  source?: string;
  subfolder?: string;
}

/** Package reference inside an MCP Registry server record. */
export interface McpPackageRef {
  registryType?: string;
  identifier?: string;
  version?: string;
  runtimeHint?: string;
  transport?: { type?: string };
}

/** Remote endpoint reference inside an MCP Registry server record. */
export interface McpRemoteRef {
  type?: string;
  url?: string;
}

/** A server record as returned by the official MCP Registry. */
export interface McpServerRecord {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: McpRepository;
  packages?: McpPackageRef[];
  remotes?: McpRemoteRef[];
}

/** Official registry metadata (`_meta["io.modelcontextprotocol.registry/official"]`). */
export interface McpRegistryMeta {
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
}

/** A registry entry: the server record plus its official metadata. */
export interface McpRegistryRecord {
  server: McpServerRecord;
  meta: McpRegistryMeta | null;
}

export interface McpConfig {
  /** Server name as registered, e.g. `io.github.owner/name`. */
  server: string;
  /** Registry base URL. Defaults to the official MCP Registry. */
  registryUrl?: string;
  timeout?: number;
  /** Pre-fetched registry record. When provided, the registry API is not queried. */
  record?: McpRegistryRecord;
}

export interface McpReport {
  server: string;
  serverVersion: string | null;
  registryUrl: string;
  timestamp: string;
  version: string;
  score: number;
  categories: AXCategory[];
  audits: Record<string, AuditResult>;
  recommendations: Recommendation[];
}

export interface McpSweepEntry {
  server: string;
  serverVersion: string | null;
  score: number | null;
  categoryScores: Record<string, number>;
  error?: string;
}

export interface McpSweepReport {
  registryUrl: string;
  timestamp: string;
  version: string;
  requested: number;
  scored: number;
  failed: number;
  entries: McpSweepEntry[];
}
