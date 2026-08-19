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

/** ERC-8004-style service advertised by an agent registration file. */
export interface AgentRegistrationService {
  name?: string;
  endpoint?: string;
  version?: string;
}

/** ERC-8004 progressive validation response advertised by an agent registration file. */
export interface AgentValidationResponse {
  requestHash?: string;
  validator?: string;
  score?: number;
  /** ERC-8004 feedback payload URI. Legacy fixtures may still use responseURI. */
  feedbackURI?: string;
  /** Expected SHA-256 digest for the feedback payload. Legacy fixtures may still use responseHash. */
  feedbackHash?: string;
  responseURI?: string;
  responseHash?: string;
  tag?: string;
  updatedAt?: string;
  blockNumber?: number;
  transactionHash?: string;
}

/** ERC-8004 validation request plus its repeated validator responses. */
export interface AgentValidationRequest {
  requestHash?: string;
  validator?: string;
  validationResponses?: AgentValidationResponse[];
  responses?: AgentValidationResponse[];
}

export interface Erc8004ValidationResponseEvidence {
  order: number;
  requestHash: string | null;
  validator: string | null;
  requestHashMatches: boolean;
  validatorMatchesRequest: boolean;
  score: number | null;
  responseURI: string | null;
  responseHash: string | null;
  responseHashVerified: boolean | null;
  responseHashAlgorithm: 'sha256' | null;
  /** Signed allow/block plus integrity evidence for dereferencing feedbackURI/responseURI. */
  feedbackFetchDecisionReceipt: Erc8004FeedbackFetchDecisionReceipt | null;
  tag: string | null;
  updatedAt: string | null;
  blockNumber: number | null;
  transactionHash: string | null;
  isLatest: boolean;
}

export interface Erc8004FeedbackResolutionEvidence {
  hostname: string;
  address: string | null;
  family: 4 | 6 | null;
  source: 'literal' | 'dns';
  error?: string;
  privateHost?: boolean;
}

export interface Erc8004FeedbackRedirectEvidence {
  from: string;
  to: string;
  statusCode: number;
}

export interface Erc8004FeedbackFetchDecisionPayload {
  url: string;
  allowed: boolean;
  reason: string;
  evidence: Erc8004FeedbackResolutionEvidence[];
  redirects: Erc8004FeedbackRedirectEvidence[];
  integritySha256: string | null;
  integrityVerified: boolean | null;
}

export interface Erc8004FeedbackFetchDecisionReceipt {
  signatureAlgorithm: 'ed25519';
  canonicalization: 'json-stable-v1';
  decisionPayload: Erc8004FeedbackFetchDecisionPayload;
  signature: string;
  publicKey: string;
}

export interface Erc8004ValidationLineageEvidence {
  requestHash: string;
  validator: string;
  responseCount: number;
  orderedTags: string[];
  latestTag: string | null;
  latestScore: number | null;
  allResponsesBound: boolean;
  allResponseHashesVerified: boolean;
  responses: Erc8004ValidationResponseEvidence[];
}

/** Optional ERC-8004 identity metadata embedded by downstream registries. */
export interface Erc8004AgentIdentityRef {
  agentURI?: string;
  agentUri?: string;
  agentId?: string | number;
  identityRegistry?: string;
  chainId?: string | number;
}

export interface AgentServiceBindingEvidence {
  agentURI: string;
  registrationSha256?: string;
  agentId: string | null;
  identityRegistry: string | null;
  serviceName: string;
  endpoint: string;
  endpointHost: string;
  agentUriHost: string | null;
  domainControl: 'same-host' | 'same-registrable-domain' | 'mismatch' | 'unverified';
  tls: boolean;
  redirectCount: number;
  signatureAlgorithm: 'ed25519';
}

/** A server record as returned by the official MCP Registry. */
export interface McpServerRecord {
  name?: string;
  title?: string;
  description?: string;
  version?: string;
  schema?: unknown;
  schemas?: unknown;
  tools?: unknown;
  websiteUrl?: string;
  erc8004?: Erc8004AgentIdentityRef;
  agentURI?: string;
  agentUri?: string;
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
  /** True when GitHub rate limiting degraded repository evidence for this audit. */
  rateLimited: boolean;
  categories: AXCategory[];
  audits: Record<string, AuditResult>;
  recommendations: Recommendation[];
}

export interface McpSweepEntry {
  server: string;
  serverVersion: string | null;
  /** Signed publisher-auth provenance bound to the AX scan before score export. */
  publisherAuthProvenance?: McpRegistryPublisherAuthProvenance;
  /** ERC-8004 agent registration URI captured during this sweep. */
  agentURI?: string | null;
  /** SHA-256 hash of the fetched ERC-8004 registration file, when available. */
  registrationSha256?: string | null;
  /** True only when declared A2A/MCP services were re-attested after dereferencing. */
  a2aMcpServiceReattested?: boolean;
  /** ERC-8004 validation responses grouped by requestHash/original validator. */
  validationLineage?: Erc8004ValidationLineageEvidence[];
  /** Latest-version remote endpoint URLs captured from the registry record. */
  remoteUrls?: string[];
  /** Official registry status for the latest-version snapshot, when present. */
  registryStatus?: string | null;
  /** Canonical hash over semver-significant Registry fields. */
  semanticVersionFingerprint?: McpSemanticVersionFingerprint;
  score: number | null;
  /**
   * Per-category scores. `null` means the category was fully excluded from
   * scoring (all of its audits were not-applicable or indeterminate) —
   * distinct from a genuine score of 0.
   */
  categoryScores: Record<string, number | null>;
  /** Number of audits excluded because the server had nothing to evaluate. */
  notApplicableAudits: number;
  /** Number of audits excluded because evidence could not be gathered. */
  indeterminateAudits: number;
  /** True when GitHub rate limiting degraded repository evidence for this entry. */
  rateLimited: boolean;
  error?: string;
}

export type McpRegistryPublisherAuthMethod = 'github-oauth-oidc' | 'dns' | 'http';

export interface McpRegistryPublisherAuthScanReceiptPayload {
  server: string;
  serverVersion: string | null;
  registryUrl: string;
  registryNamespace: string;
  publisherAuthMethod: McpRegistryPublisherAuthMethod;
  verifiedAt: string;
  policyVersion: string;
  canonicalEvidenceSha256: string;
  score: number | null;
  categoryScores: Record<string, number | null>;
  scanTimestamp: string;
  axScoreVersion: string;
}

export interface McpRegistryPublisherAuthScanReceipt {
  signatureAlgorithm: 'ed25519';
  canonicalization: 'json-stable-v1';
  payload: McpRegistryPublisherAuthScanReceiptPayload;
  payloadSha256: string;
  signatureBase64: string;
  publicKeyBase64: string;
  signedAt: string;
}

export interface McpRegistryPublisherAuthProvenance {
  registryNamespace: string;
  publisherAuthMethod: McpRegistryPublisherAuthMethod;
  verifiedAt: string;
  policyVersion: string;
  canonicalEvidenceSha256: string;
  canonicalEvidence: {
    registryUrl: string;
    registryStatus: string | null;
    registryPublishedAt: string | null;
    registryUpdatedAt: string | null;
    repositoryUrl: string | null;
    repositorySource: string | null;
    websiteUrl: string | null;
    remoteUrls: string[];
    packageIdentifiers: string[];
  };
  scanReceipt: McpRegistryPublisherAuthScanReceipt;
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

export interface McpSweepScoreChange {
  server: string;
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
  semanticVersionReceipt?: McpSemanticVersionReceipt;
}

export interface McpSemanticVersionFingerprint {
  canonicalization: 'mcp-registry-semantic-v1';
  fields: ['title', 'description', 'schema', 'remotes'];
  canonicalSha256: string;
  fieldSha256?: {
    title: string;
    description: string;
    schema: string;
    remotes: string;
  };
}

export interface McpSemanticVersionReceiptSignature {
  signatureAlgorithm: 'ed25519';
  canonicalization: 'json-stable-v1';
  payloadSha256: string;
  signatureBase64: string;
  publicKeyBase64: string;
  signedAt: string;
}

export interface McpSemanticVersionReceipt {
  server: string;
  previousVersion: string;
  currentVersion: string;
  previousCanonicalSha256: string;
  currentCanonicalSha256: string;
  classification: 'version-only-increment' | 'semantic-change';
  rationale: string;
  signature: McpSemanticVersionReceiptSignature;
}

export interface Erc8004AgentUriLineageEvidence {
  server: string;
  previousAgentURI: string | null;
  currentAgentURI: string | null;
  previousRegistrationSha256: string | null;
  currentRegistrationSha256: string | null;
  servicesReattested: boolean;
  reputationWeightRetained: boolean;
  transition: 'agent-uri-changed' | 'registration-hash-changed';
}

export interface McpEndpointDeprecationSnapshot {
  timestamp: string;
  version: string | null;
  remoteUrls: string[];
  score: number | null;
  registryStatus: string | null;
}

export interface McpEndpointDeprecationSignature {
  algorithm: 'ed25519';
  payloadSha256: string;
  signatureBase64: string;
  publicKeyPem?: string;
  signedAt: string;
}

export interface McpEndpointDeprecationEvidence {
  server: string;
  previousSnapshot: McpEndpointDeprecationSnapshot;
  currentSnapshot: McpEndpointDeprecationSnapshot;
  removedRemoteUrls: string[];
  retainedRemoteUrls: string[];
  confidence: number;
  confidenceFactors: string[];
  rationale: string;
  signature?: McpEndpointDeprecationSignature;
}

export interface McpSweepDiff {
  previousTimestamp: string;
  currentTimestamp: string;
  requestedDelta: number;
  scoredDelta: number;
  failedDelta: number;
  addedServers: string[];
  removedServers: string[];
  scoreChanges: McpSweepScoreChange[];
  semanticVersionReceipts: McpSemanticVersionReceipt[];
  agentUriLineage: Erc8004AgentUriLineageEvidence[];
  endpointDeprecations: McpEndpointDeprecationEvidence[];
}

export interface McpReportPublishedUrls {
  json?: string;
  markdown?: string;
  manifest?: string;
}

export interface McpReportArtifactManifest {
  generatedAt: string;
  registryUrl: string;
  reportTimestamp: string;
  files: {
    json: string;
    markdown: string;
    manifest?: string;
  };
  hostedUrls?: McpReportPublishedUrls;
  diff?: McpSweepDiff;
}
