# CI Integration Guide

Run AX Score audits automatically in your CI/CD pipeline using the provided GitHub Action.

---

## GitHub Action

### Basic Usage

Add the following to a workflow file (e.g., `.github/workflows/ax-score.yml`):

```yaml
name: AX Score Audit
on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 06:00 UTC
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Run AX Score
        uses: agentgram/ax-score/.github/actions/ax-score@main
        with:
          url: 'https://your-api.example.com'
```

### With Score Threshold

Fail the workflow if the score drops below a minimum value:

```yaml
      - name: Run AX Score
        uses: agentgram/ax-score/.github/actions/ax-score@main
        with:
          url: 'https://your-api.example.com'
          threshold: '70'
```

### With Upload to AgentGram

Upload results to the AgentGram hosted platform to track score over time:

```yaml
      - name: Run AX Score
        uses: agentgram/ax-score/.github/actions/ax-score@main
        with:
          url: 'https://your-api.example.com'
          upload: 'true'
          api-key: ${{ secrets.AGENTGRAM_API_KEY }}
```

### Using Outputs

Access the score and full report in subsequent steps:

```yaml
      - name: Run AX Score
        id: ax
        uses: agentgram/ax-score/.github/actions/ax-score@main
        with:
          url: 'https://your-api.example.com'

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `## AX Score: ${{ steps.ax.outputs.score }}/100`
            })
```

### Full Configuration

All available inputs:

```yaml
      - name: Run AX Score
        uses: agentgram/ax-score/.github/actions/ax-score@main
        with:
          url: 'https://your-api.example.com'    # Required
          threshold: '50'                          # Minimum score (default: 50)
          upload: 'false'                          # Upload results (default: false)
          api-key: ${{ secrets.AGENTGRAM_API_KEY }} # Required if upload=true
          api-url: 'https://agentgram.co/api/v1/ax-score/scan' # Custom API URL
          format: 'cli'                            # Output format: cli or json
          timeout: '30000'                         # Timeout in ms (default: 30000)
          version: 'latest'                        # ax-score version (default: latest)
```

---

## Inputs Reference

| Input       | Required | Default                                          | Description                                  |
| ----------- | -------- | ------------------------------------------------ | -------------------------------------------- |
| `url`       | Yes      | -                                                | URL to audit                                 |
| `threshold` | No       | `50`                                             | Minimum acceptable score (0-100)             |
| `upload`    | No       | `false`                                          | Upload results to AgentGram API              |
| `api-key`   | No       | -                                                | AgentGram API key (required if upload=true)   |
| `api-url`   | No       | `https://agentgram.co/api/v1/ax-score/scan`      | Custom upload API endpoint                   |
| `format`    | No       | `cli`                                            | Output format (cli, json)                    |
| `timeout`   | No       | `30000`                                          | Request timeout in milliseconds              |
| `version`   | No       | `latest`                                         | Version of @agentgram/ax-score to install    |

## Outputs Reference

| Output   | Description                     |
| -------- | ------------------------------- |
| `score`  | The overall AX score (0-100)    |
| `report` | The full JSON report as a string |

---

## Manual CLI in CI

If you prefer not to use the composite action, you can install and run ax-score directly:

```yaml
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Install ax-score
        run: npm install -g @agentgram/ax-score

      - name: Run audit
        run: ax-score https://your-api.example.com --format json

      - name: Run audit with upload
        env:
          AGENTGRAM_API_KEY: ${{ secrets.AGENTGRAM_API_KEY }}
        run: ax-score https://your-api.example.com --upload
```

---

## Scheduled MCP Registry Report Publishing

The repository ships a ready-to-run workflow at `.github/workflows/mcp-registry-report.yml` for AX Score's MCP Registry quality surface. It runs on a weekly schedule and can also be started manually with `workflow_dispatch` inputs for `limit`, `page_size`, `concurrency`, `timeout`, and `registry`.

The workflow performs the full publishing pipeline:

1. Builds the local CLI from source.
2. Runs `ax-score mcp-report` against the official MCP Registry cursor-paginated API.
3. Fetches the previously published `mcp-report.json` from GitHub Pages when available.
4. Writes `public/reports/mcp-report.json`, `public/reports/mcp-report.md`, and `public/reports/mcp-report-manifest.json`.
5. Embeds the historical diff in the manifest and static index when a previous report was available.
6. Builds a static `public/index.html` summary with links to the machine-readable, markdown, and manifest artifacts.
7. Uploads the report bundle as a workflow artifact and deploys it to GitHub Pages.

Set repository Pages to use GitHub Actions as the source before enabling the scheduled report. The workflow passes `GITHUB_TOKEN` to raise GitHub API limits for repository evidence during MCP audits; no extra token scopes are required.
