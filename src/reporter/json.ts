import type { AXReport, McpReport, McpReportArtifactManifest, McpSweepReport } from '../types.js';

/**
 * Render a report as formatted JSON.
 */
export function renderJSON(
  report: AXReport | McpReport | McpSweepReport | McpReportArtifactManifest
): string {
  return JSON.stringify(report, null, 2);
}
