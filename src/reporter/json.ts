import type { AXReport, McpReport, McpSweepReport } from '../types.js';

/**
 * Render a report as formatted JSON.
 */
export function renderJSON(report: AXReport | McpReport | McpSweepReport): string {
  return JSON.stringify(report, null, 2);
}
