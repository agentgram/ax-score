import type { CategoryConfig } from './default.js';

/** Base URL of the official MCP Registry. */
export const DEFAULT_MCP_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';

/** Default number of concurrent server audits during a sweep. */
export const DEFAULT_MCP_SWEEP_CONCURRENCY = 5;

/**
 * Category definitions for MCP server scoring.
 *
 * Category weights sum to 100. Audit ref weights are relative within each
 * category. Audits that report 'not-applicable' or 'indeterminate' are
 * excluded from weighting at runtime by the MCP runner.
 */
const MCP_BASE_CATEGORIES: CategoryConfig[] = [
  {
    id: 'mcp-metadata',
    title: 'Metadata Completeness',
    description: 'Does the registry record tell agents what this server is?',
    weight: 20,
    auditRefs: [
      { id: 'mcp-description-quality', weight: 6 },
      { id: 'mcp-repository-link', weight: 5 },
      { id: 'mcp-version-valid', weight: 4 },
      { id: 'mcp-license', weight: 3 },
      { id: 'mcp-display-metadata', weight: 2 },
    ],
  },
  {
    id: 'mcp-distribution',
    title: 'Distribution Health',
    description: 'Can the server actually be installed, and is it maintained?',
    weight: 25,
    auditRefs: [
      { id: 'mcp-package-resolvable', weight: 10 },
      { id: 'mcp-package-freshness', weight: 6 },
      { id: 'mcp-version-consistency', weight: 5 },
      { id: 'mcp-registry-freshness', weight: 4 },
    ],
  },
  {
    id: 'mcp-provenance',
    title: 'Provenance & Trust',
    description: 'Does the server come from a verifiable, active source?',
    weight: 25,
    auditRefs: [
      { id: 'mcp-repo-exists', weight: 8 },
      { id: 'mcp-repo-activity', weight: 7 },
      { id: 'mcp-namespace-alignment', weight: 6 },
      { id: 'mcp-repo-popularity', weight: 4 },
    ],
  },
  {
    id: 'mcp-operational',
    title: 'Operational',
    description: 'Are declared endpoints reachable and is the record well-formed?',
    weight: 15,
    auditRefs: [
      { id: 'mcp-remote-reachable', weight: 8 },
      { id: 'mcp-remote-tls', weight: 4 },
      { id: 'mcp-server-record-valid', weight: 3 },
      { id: 'erc8004-registration-service-binding', weight: 3 },
    ],
  },
  {
    id: 'mcp-documentation',
    title: 'Documentation',
    description: 'Can agents and humans learn how to install and use this server?',
    weight: 15,
    auditRefs: [
      { id: 'mcp-readme-exists', weight: 8 },
      { id: 'mcp-usage-instructions', weight: 7 },
    ],
  },
];

/** Returns a fresh copy of the MCP category configuration. */
export function getMcpCategories(): CategoryConfig[] {
  return structuredClone(MCP_BASE_CATEGORIES);
}

export const MCP_CATEGORIES: CategoryConfig[] = structuredClone(MCP_BASE_CATEGORIES);
