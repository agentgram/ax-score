#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import { runAudit } from '../runner.js';
import { renderReport } from '../reporter/cli.js';
import { renderJSON } from '../reporter/json.js';
import { VERSION } from '../config/default.js';

const program = new Command();

program
  .name('ax-score')
  .description('Measure how agent-friendly your website or API is')
  .version(VERSION);

program
  .argument('<url>', 'URL to audit')
  .option('-f, --format <format>', 'Output format (cli, json)', 'cli')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('-v, --verbose', 'Show detailed audit results', false)
  .action(async (url: string, options: { format: string; timeout: string; verbose: boolean }) => {
    const spinner = ora(`Auditing ${url}...`).start();

    try {
      const report = await runAudit({
        url,
        timeout: parseInt(options.timeout, 10),
        verbose: options.verbose,
      });

      spinner.stop();

      if (options.format === 'json') {
        console.log(renderJSON(report));
      } else {
        console.log(renderReport(report));
      }

      process.exit(report.score >= 50 ? 0 : 1);
    } catch (error) {
      spinner.fail(`Failed to audit ${url}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
