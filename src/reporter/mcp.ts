import chalk from 'chalk';
import type {
  AuditResult,
  McpReport,
  McpReportPublishedUrls,
  McpSweepDiff,
  McpSweepReport,
} from '../types.js';
import { MCP_CATEGORIES } from '../config/mcp.js';

function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'PASS';
  if (score >= 50) return 'WARN';
  return 'FAIL';
}

function renderProgressBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = getScoreColor(score);
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

function countExcluded(audits: Record<string, AuditResult>): {
  notApplicable: number;
  indeterminate: number;
} {
  let notApplicable = 0;
  let indeterminate = 0;
  for (const result of Object.values(audits)) {
    if (result.applicability === 'not-applicable') notApplicable += 1;
    if (result.applicability === 'indeterminate') indeterminate += 1;
  }
  return { notApplicable, indeterminate };
}

/**
 * Render an MCP audit report as rich CLI output.
 */
export function renderMcpReport(report: McpReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    chalk.bold(
      `  AX Score (MCP): ${getScoreColor(report.score)(`${report.score}/100`)} ${renderProgressBar(report.score)}`
    )
  );
  lines.push('');
  lines.push(chalk.gray(`  ${report.server}${report.serverVersion ? ` v${report.serverVersion}` : ''}`));
  lines.push(chalk.gray(`  Registry: ${report.registryUrl}`));
  lines.push(chalk.gray(`  Scanned at ${new Date(report.timestamp).toLocaleString()}`));
  lines.push('');

  for (const category of report.categories) {
    if (category.weight === 0) {
      lines.push(`  ${'[SKIP]'.padEnd(8)} ${category.title.padEnd(24)} ${chalk.gray('n/a')}`);
      continue;
    }
    const label = `[${getScoreLabel(category.score)}]`;
    const score = getScoreColor(category.score)(`${category.score}/100`);
    lines.push(`  ${label.padEnd(8)} ${category.title.padEnd(24)} ${score}`);
  }

  const excluded = countExcluded(report.audits);
  if (excluded.notApplicable > 0 || excluded.indeterminate > 0) {
    lines.push('');
    lines.push(
      chalk.gray(
        `  Excluded from scoring: ${excluded.notApplicable} not applicable, ` +
          `${excluded.indeterminate} indeterminate (evidence unavailable).`
      )
    );
  }

  if (report.rateLimited) {
    lines.push('');
    lines.push(
      chalk.yellow(
        '  Note: GitHub rate limiting degraded repository evidence for this run. ' +
          'Set GITHUB_TOKEN and re-run for full provenance and documentation scoring.'
      )
    );
  }

  if (report.recommendations.length > 0) {
    lines.push('');
    lines.push(chalk.bold('  Top Fixes:'));
    const top3 = report.recommendations.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const rec = top3[i]!;
      lines.push(`  ${i + 1}. ${rec.message}  ${chalk.green(`(+${rec.impact} pts)`)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export interface McpLeaderboardRenderOptions {
  diff?: McpSweepDiff;
  hostedUrls?: McpReportPublishedUrls;
}

/**
 * Render a sweep report as a markdown leaderboard table.
 */
export function renderMcpLeaderboard(
  report: McpSweepReport,
  options: McpLeaderboardRenderOptions = {}
): string {
  const lines: string[] = [];
  const categoryColumns = MCP_CATEGORIES.map((c) => ({ id: c.id, title: c.title }));

  lines.push('# MCP Server Leaderboard');
  lines.push('');
  lines.push(
    `Scored ${report.scored} of ${report.requested} requested servers` +
      (report.failed > 0 ? ` (${report.failed} failed)` : '') +
      ` — registry: ${report.registryUrl} — ${report.timestamp}`
  );
  lines.push('');

  const hostedLinks = Object.entries(options.hostedUrls ?? {}).filter((entry) => entry[1]);
  if (hostedLinks.length > 0) {
    lines.push('## Hosted artifacts');
    lines.push('');
    for (const [label, url] of hostedLinks) {
      lines.push(`- ${label}: ${url}`);
    }
    lines.push('');
  }

  if (options.diff) {
    lines.push('## Historical diff');
    lines.push('');
    lines.push(
      `Compared with ${options.diff.previousTimestamp}: ` +
        `${formatSignedNumber(options.diff.scoredDelta)} scored, ` +
        `${formatSignedNumber(options.diff.failedDelta)} failed, ` +
        `${options.diff.addedServers.length} added, ` +
        `${options.diff.removedServers.length} removed.`
    );
    const notableChanges = options.diff.scoreChanges.slice(0, 5);
    if (notableChanges.length > 0) {
      lines.push('');
      for (const change of notableChanges) {
        const delta = change.delta === null ? 'n/a' : formatSignedNumber(change.delta);
        lines.push(
          `- ${escapeMarkdown(change.server)}: ${change.previousScore ?? 'n/a'} → ${change.currentScore ?? 'n/a'} (${delta})`
        );
      }
    }
    lines.push('');
  }
  lines.push(
    `| # | Server | Score | ${categoryColumns.map((c) => c.title).join(' | ')} |`
  );
  lines.push(`|--:|:-------|------:|${categoryColumns.map(() => '----:').join('|')}|`);

  let rank = 0;
  let hasExcluded = false;
  let hasRateLimited = false;
  for (const entry of report.entries) {
    if (entry.score === null) continue;
    rank += 1;
    const categoryCells = categoryColumns.map((col) => {
      const score = entry.categoryScores[col.id];
      if (score === undefined || score === null) {
        // Excluded category (nothing evaluable) — distinct from a genuine 0.
        hasExcluded = true;
        return 'n/a';
      }
      return String(score);
    });
    const marker = entry.rateLimited ? ' \\*' : '';
    if (entry.rateLimited) hasRateLimited = true;
    lines.push(
      `| ${rank} | ${escapeMarkdown(entry.server)}${marker} | **${entry.score}** | ${categoryCells.join(' | ')} |`
    );
  }

  const legend: string[] = [];
  if (hasExcluded) {
    legend.push(
      'n/a = category excluded from scoring (no evaluable audits: evidence unavailable or nothing to evaluate) — not a score of 0.'
    );
  }
  if (hasRateLimited) {
    legend.push(
      '\\* = scored while GitHub rate limiting degraded repository evidence; affected audits were excluded, not failed. Set GITHUB_TOKEN to avoid this.'
    );
  }
  if (legend.length > 0) {
    lines.push('');
    for (const note of legend) {
      lines.push(`> ${note}`);
    }
  }

  const failures = report.entries.filter((entry) => entry.score === null);
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Not scored');
    lines.push('');
    for (const entry of failures) {
      lines.push(`- ${escapeMarkdown(entry.server)}: ${entry.error ?? 'unknown error'}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
