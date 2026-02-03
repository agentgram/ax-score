import type { AXReport } from '../types.js';

/**
 * Render an AX report as formatted JSON.
 */
export function renderJSON(report: AXReport): string {
  return JSON.stringify(report, null, 2);
}
