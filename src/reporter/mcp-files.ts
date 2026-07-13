import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { McpSweepReport } from '../types.js';
import { renderJSON } from './json.js';
import { renderMcpLeaderboard } from './mcp.js';

export interface McpReportFilePaths {
  json: string;
  markdown: string;
}

function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Write the bounded MCP report as both machine-readable JSON and markdown. */
export function writeMcpReportFiles(
  report: McpSweepReport,
  paths: McpReportFilePaths
): McpReportFilePaths {
  writeTextFile(paths.json, renderJSON(report));
  writeTextFile(paths.markdown, renderMcpLeaderboard(report));
  return paths;
}
