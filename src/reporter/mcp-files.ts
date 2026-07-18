import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type {
  McpReportArtifactManifest,
  McpReportPublishedUrls,
  McpSweepDiff,
  McpSweepEntry,
  McpSweepReport,
} from '../types.js';
import { renderJSON } from './json.js';
import { renderMcpLeaderboard } from './mcp.js';

export interface McpReportFilePaths {
  json: string;
  markdown: string;
  manifest?: string;
}

export interface McpReportFileOptions {
  previousReport?: McpSweepReport;
  publishedBaseUrl?: string;
}

function writeTextFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function normalizePublishedBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function buildHostedUrls(
  paths: McpReportFilePaths,
  publishedBaseUrl?: string
): McpReportPublishedUrls | undefined {
  if (!publishedBaseUrl) return undefined;
  const baseUrl = normalizePublishedBaseUrl(publishedBaseUrl);
  return {
    json: new URL(basename(paths.json), baseUrl).toString(),
    markdown: new URL(basename(paths.markdown), baseUrl).toString(),
    ...(paths.manifest ? { manifest: new URL(basename(paths.manifest), baseUrl).toString() } : {}),
  };
}

function isScored(entry: McpSweepEntry): entry is McpSweepEntry & { score: number } {
  return entry.score !== null;
}

export function diffMcpSweepReports(
  current: McpSweepReport,
  previous: McpSweepReport
): McpSweepDiff {
  const currentByServer = new Map(current.entries.map((entry) => [entry.server, entry]));
  const previousByServer = new Map(previous.entries.map((entry) => [entry.server, entry]));
  const addedServers = current.entries
    .filter((entry) => !previousByServer.has(entry.server))
    .map((entry) => entry.server)
    .sort();
  const removedServers = previous.entries
    .filter((entry) => !currentByServer.has(entry.server))
    .map((entry) => entry.server)
    .sort();
  const scoreChanges = current.entries
    .filter((entry) => previousByServer.has(entry.server))
    .map((entry) => {
      const previousEntry = previousByServer.get(entry.server)!;
      const delta = isScored(entry) && isScored(previousEntry) ? entry.score - previousEntry.score : null;
      return {
        server: entry.server,
        previousScore: previousEntry.score,
        currentScore: entry.score,
        delta,
      };
    })
    .filter((entry) => entry.delta !== 0)
    .sort((a, b) => {
      const aAbs = a.delta === null ? Number.POSITIVE_INFINITY : Math.abs(a.delta);
      const bAbs = b.delta === null ? Number.POSITIVE_INFINITY : Math.abs(b.delta);
      return bAbs - aAbs || a.server.localeCompare(b.server);
    });

  return {
    previousTimestamp: previous.timestamp,
    currentTimestamp: current.timestamp,
    requestedDelta: current.requested - previous.requested,
    scoredDelta: current.scored - previous.scored,
    failedDelta: current.failed - previous.failed,
    addedServers,
    removedServers,
    scoreChanges,
  };
}

/** Write the bounded MCP report as both machine-readable JSON and markdown. */
export function writeMcpReportFiles(
  report: McpSweepReport,
  paths: McpReportFilePaths,
  options: McpReportFileOptions = {}
): McpReportFilePaths {
  const diff = options.previousReport ? diffMcpSweepReports(report, options.previousReport) : undefined;
  const hostedUrls = buildHostedUrls(paths, options.publishedBaseUrl);
  writeTextFile(paths.json, renderJSON(report));
  writeTextFile(paths.markdown, renderMcpLeaderboard(report, { diff, hostedUrls }));
  if (paths.manifest) {
    const manifest: McpReportArtifactManifest = {
      generatedAt: new Date().toISOString(),
      registryUrl: report.registryUrl,
      reportTimestamp: report.timestamp,
      files: {
        json: paths.json,
        markdown: paths.markdown,
        manifest: paths.manifest,
      },
      ...(hostedUrls ? { hostedUrls } : {}),
      ...(diff ? { diff } : {}),
    };
    writeTextFile(paths.manifest, renderJSON(manifest));
  }
  return paths;
}
