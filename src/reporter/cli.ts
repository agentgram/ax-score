import chalk from 'chalk';
import type { AXReport, AXCategory } from '../types.js';

function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return 'PASS';
  if (score >= 50) return 'WARN';
  return 'FAIL';
}

function renderProgressBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = getScoreColor(score);
  return color('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
}

function renderCategory(category: AXCategory): string {
  const emoji = getScoreEmoji(category.score);
  const label = `[${emoji}]`;
  const score = getScoreColor(category.score)(`${category.score}/${category.weight}`);
  return `  ${label.padEnd(8)} ${category.title.padEnd(20)} ${score}`;
}

/**
 * Render an AX report as a rich CLI output.
 */
export function renderReport(report: AXReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    chalk.bold(
      `  AX Score: ${getScoreColor(report.score)(`${report.score}/100`)} ${renderProgressBar(report.score)}`
    )
  );
  lines.push('');
  lines.push(chalk.gray(`  ${report.url}`));
  lines.push(chalk.gray(`  Scanned at ${new Date(report.timestamp).toLocaleString()}`));
  lines.push('');

  for (const category of report.categories) {
    lines.push(renderCategory(category));
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
