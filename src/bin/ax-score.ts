#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import { runAudit } from '../runner.js';
import { renderReport } from '../reporter/cli.js';
import { renderJSON } from '../reporter/json.js';
import { uploadReport } from '../upload.js';
import { VERSION } from '../config/default.js';

interface CliOptions {
  format: string;
  timeout: string;
  verbose: boolean;
  upload: boolean;
  apiUrl: string;
  apiKey?: string;
}

const DEFAULT_API_URL = 'https://agentgram.co/api/v1/ax-score/scan';

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
  .action(async (url: string, options: CliOptions) => {
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
          console.error(
            uploadError instanceof Error ? uploadError.message : String(uploadError)
          );
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

program.parse();
