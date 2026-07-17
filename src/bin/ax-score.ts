#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Command, InvalidArgumentError } from 'commander';
import ora from 'ora';
import { runRepeatedAudit } from '../runner.js';
import { runMcpAudit, runMcpStaticReport, runMcpSweep } from '../mcp-runner.js';
import { renderReport } from '../reporter/cli.js';
import { renderJSON } from '../reporter/json.js';
import { renderMcpReport, renderMcpLeaderboard } from '../reporter/mcp.js';
import { writeMcpReportFiles } from '../reporter/mcp-files.js';
import { uploadReport } from '../upload.js';
import { VERSION } from '../config/default.js';
import type { McpSweepReport } from '../types.js';
import {
  DEFAULT_MCP_REGISTRY_URL,
  DEFAULT_MCP_SWEEP_CONCURRENCY,
} from '../config/mcp.js';

interface CliOptions {
  format: string;
  timeout: string;
  verbose: boolean;
  upload: boolean;
  apiUrl: string;
  apiKey?: string;
  repeat: number;
}

interface McpCliOptions {
  format: string;
  timeout: string;
  registry: string;
  sweep: boolean;
  limit: number;
  pageSize: number;
  retries: number;
  retryBackoffMs: number;
  concurrency: number;
  output?: string;
}

interface McpReportCliOptions {
  timeout: string;
  registry: string;
  limit: number;
  pageSize: number;
  retries: number;
  retryBackoffMs: number;
  resume: boolean;
  concurrency: number;
  jsonOutput: string;
  markdownOutput: string;
}

const DEFAULT_API_URL = 'https://agentgram.co/api/v1/ax-score/scan';
const DEFAULT_SWEEP_LIMIT = 50;

function readResumeReport(path: string): McpSweepReport | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<McpSweepReport>;
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`Resume report ${path} does not contain an entries array.`);
  }
  return parsed as McpSweepReport;
}

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
  .option('-u, --upload', 'Upload results to AgentGram hosted API', false)
  .option('--api-url <url>', 'API endpoint for uploading results', DEFAULT_API_URL)
  .option('--api-key <key>', 'API key for authentication (or set AGENTGRAM_API_KEY env var)')
  .option(
    '-r, --repeat <n>',
    'Run the audit N times and report score stability',
    parsePositiveInteger,
    1
  )
  .action(async (url: string, options: CliOptions) => {
    const repeat = options.repeat;
    const spinner = ora(
      repeat > 1 ? `Auditing ${url} (${repeat} runs)...` : `Auditing ${url}...`
    ).start();

    try {
      const config = {
        url,
        timeout: parseInt(options.timeout, 10),
        verbose: options.verbose,
      };
      const report = await runRepeatedAudit(config, repeat);

      spinner.stop();

      if (options.format === 'json') {
        console.log(renderJSON(report));
      } else {
        console.log(renderReport(report));
      }

      // Upload results if --upload flag is set
      if (options.upload) {
        const apiKey = options.apiKey ?? process.env['AGENTGRAM_API_KEY'];

        if (!apiKey) {
          console.error(
            'Error: --upload requires an API key. ' +
              'Provide one via --api-key or the AGENTGRAM_API_KEY environment variable.'
          );
          process.exit(1);
        }

        const uploadSpinner = ora('Uploading results...').start();

        try {
          await uploadReport(report, {
            apiUrl: options.apiUrl,
            apiKey,
          });
          uploadSpinner.succeed('Results uploaded successfully.');
        } catch (uploadError) {
          uploadSpinner.fail('Failed to upload results.');
          console.error(uploadError instanceof Error ? uploadError.message : String(uploadError));
          // Upload failure is non-fatal: still exit based on score
        }
      }

      process.exit(report.score >= 50 ? 0 : 1);
    } catch (error) {
      spinner.fail(`Failed to audit ${url}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Score an MCP server (or sweep the registry) from the official MCP Registry')
  .argument('[server]', 'Server name as registered, e.g. io.github.owner/name')
  .option('-f, --format <format>', 'Output format (cli, json)', 'cli')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--registry <url>', 'MCP Registry base URL', DEFAULT_MCP_REGISTRY_URL)
  .option('--sweep', 'Fetch servers from the registry and rank them', false)
  .option(
    '--limit <n>',
    'Number of servers to fetch during a sweep',
    parsePositiveInteger,
    DEFAULT_SWEEP_LIMIT
  )
  .option('--page-size <n>', 'Registry API page size for sweep pagination', parsePositiveInteger, 100)
  .option('--retries <n>', 'Retries for transient Registry API failures', parseNonNegativeInteger, 2)
  .option(
    '--retry-backoff-ms <ms>',
    'Initial retry backoff in milliseconds for Registry API failures',
    parseNonNegativeInteger,
    250
  )
  .option(
    '--concurrency <n>',
    'Maximum concurrent server audits during a sweep',
    parsePositiveInteger,
    DEFAULT_MCP_SWEEP_CONCURRENCY
  )
  .option('-o, --output <file>', 'Write the JSON report to a file (sweep mode)')
  .action(async (server: string | undefined, options: McpCliOptions) => {
    const timeout = parseInt(options.timeout, 10);

    if (options.sweep) {
      const spinner = ora(`Sweeping ${options.limit} servers from the MCP Registry...`).start();

      try {
        const report = await runMcpSweep(
          {
            limit: options.limit,
            registryUrl: options.registry,
            timeout,
            pageSize: options.pageSize,
            retries: options.retries,
            retryBackoffMs: options.retryBackoffMs,
            concurrency: options.concurrency,
          },
          (progress) => {
            spinner.text = `Scoring servers... ${progress.completed}/${progress.total}`;
          }
        );

        spinner.stop();

        if (options.output) {
          writeFileSync(options.output, renderJSON(report));
          console.error(`JSON report written to ${options.output}`);
        }

        if (options.format === 'json' && !options.output) {
          console.log(renderJSON(report));
        } else {
          console.log(renderMcpLeaderboard(report));
        }

        process.exit(0);
      } catch (error) {
        spinner.fail('Registry sweep failed');
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }

    if (!server) {
      console.error('Error: provide a server name, or use --sweep to rank registry servers.');
      process.exit(1);
    }

    const serverName = server as string;

    const spinner = ora(`Auditing MCP server ${serverName}...`).start();

    try {
      const report = await runMcpAudit({
        server: serverName,
        registryUrl: options.registry,
        timeout,
      });

      spinner.stop();

      if (options.format === 'json') {
        console.log(renderJSON(report));
      } else {
        console.log(renderMcpReport(report));
      }

      process.exit(report.score >= 50 ? 0 : 1);
    } catch (error) {
      spinner.fail(`Failed to audit ${serverName}`);
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program
  .command('mcp-report')
  .description('Audit a bounded MCP Registry API sweep and write JSON plus markdown report files')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--registry <url>', 'MCP Registry base URL', DEFAULT_MCP_REGISTRY_URL)
  .option(
    '--limit <n>',
    'Number of servers to fetch from the official Registry API',
    parsePositiveInteger,
    DEFAULT_SWEEP_LIMIT
  )
  .option('--page-size <n>', 'Registry API page size for pagination', parsePositiveInteger, 100)
  .option('--retries <n>', 'Retries for transient Registry API failures', parseNonNegativeInteger, 2)
  .option(
    '--retry-backoff-ms <ms>',
    'Initial retry backoff in milliseconds for Registry API failures',
    parseNonNegativeInteger,
    250
  )
  .option('--resume', 'Resume from the existing JSON output file when present', false)
  .option(
    '--concurrency <n>',
    'Maximum concurrent server audits',
    parsePositiveInteger,
    DEFAULT_MCP_SWEEP_CONCURRENCY
  )
  .option('--json-output <file>', 'Path for the JSON report', 'mcp-report.json')
  .option('--markdown-output <file>', 'Path for the markdown report', 'mcp-report.md')
  .action(async (options: McpReportCliOptions) => {
    const timeout = parseInt(options.timeout, 10);
    const spinner = ora(`Auditing ${options.limit} MCP Registry servers...`).start();

    try {
      const resumeFrom = options.resume ? readResumeReport(options.jsonOutput) : undefined;
      const report = await runMcpStaticReport(
        {
          registryUrl: options.registry,
          timeout,
          limit: options.limit,
          pageSize: options.pageSize,
          retries: options.retries,
          retryBackoffMs: options.retryBackoffMs,
          resumeFrom,
          concurrency: options.concurrency,
        },
        (progress) => {
          spinner.text = `Scoring MCP Registry servers... ${progress.completed}/${progress.total}`;
        }
      );

      spinner.stop();
      writeMcpReportFiles(report, {
        json: options.jsonOutput,
        markdown: options.markdownOutput,
      });

      console.log(renderMcpLeaderboard(report));
      console.error(`JSON report written to ${options.jsonOutput}`);
      console.error(`Markdown report written to ${options.markdownOutput}`);
      process.exit(report.scored > 0 ? 0 : 1);
    } catch (error) {
      spinner.fail('Curated MCP report failed');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError('value must be a positive integer');
  }

  return parsed;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError('value must be a non-negative integer');
  }

  return parsed;
}
