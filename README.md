# AX Score — The Lighthouse for AI Agents

[![npm version](https://img.shields.io/npm/v/@agentgram/ax-score.svg)](https://www.npmjs.com/package/@agentgram/ax-score)
[![Build Status](https://github.com/agentgram/ax-score/workflows/CI/badge.svg)](https://github.com/agentgram/ax-score/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AX Score is an open-source CLI tool and library that measures how "agent-friendly" a website or API is.

---

## 🚀 Quick Demo

```bash
$ npx @agentgram/ax-score https://agentgram.co

Gathering data... [DONE]
Running 19 audits... [DONE]

AX Score for https://agentgram.co
---------------------------------
Overall Score: 94/100

Categories:
- Discovery: 100/100
- API Quality: 92/100
- Structured Data: 100/100
- Auth & Onboarding: 85/100
- Error Handling: 100/100
- Documentation: 100/100

Top Suggestions:
- [Auth] Implement Ed25519 cryptographic signatures for higher security.
- [API] Add X-RateLimit-Reset headers to all responses.
```

---

## 📦 Installation

### CLI Usage

Install globally:

```bash
npm install -g @agentgram/ax-score
```

Or run directly with npx:

```bash
npx @agentgram/ax-score https://example.com
```

### CLI Options

```
-f, --format <format>  Output format: cli, json (default: "cli")
-t, --timeout <ms>     Request timeout in milliseconds (default: "30000")
-v, --verbose          Show detailed audit results
-u, --upload           Upload results to AgentGram hosted API
    --api-url <url>    API endpoint for uploading results
    --api-key <key>    API key for authentication (or set AGENTGRAM_API_KEY)
-r, --repeat <n>       Run the audit N times and report score stability (default: 1)
```

### Repeat-run stability checks

Use `--repeat` when you want to measure score drift across sequential runs of the same URL:

```bash
npx @agentgram/ax-score https://example.com --repeat 3
```

The CLI keeps the usual report shape and adds a `Stability` block with per-run scores plus aggregate mean, range, delta, and variance.

### Programmatic Usage

```typescript
import { runAudit, runRepeatedAudit } from '@agentgram/ax-score';

const singleRun = await runAudit({
  url: 'https://example.com',
  timeout: 30000,
  verbose: false,
});

const repeatedRun = await runRepeatedAudit(
  {
    url: 'https://example.com',
    timeout: 30000,
    verbose: false,
  },
  3
);

console.log(`Single-run score: ${singleRun.score}`);
console.log(repeatedRun.stability);
```

---

## 🔌 MCP Server Scoring

The official [MCP Registry](https://registry.modelcontextprotocol.io) lists thousands of servers with no quality signal. The `mcp` mode scores any registered server 0-100, Lighthouse-style, using the same gather → audit → score pipeline.

### Score one server

```bash
npx @agentgram/ax-score mcp io.github.domdomegg/airtable-mcp-server
```

### Sweep the registry and rank servers

```bash
npx @agentgram/ax-score mcp --sweep --limit 25 --output report.json
```

The sweep fetches the latest version of each server, audits them concurrently, prints a markdown leaderboard, and (with `--output`) writes the full JSON ranking report.

### Write the bounded strategic MCP report

```bash
npx @agentgram/ax-score mcp-report --limit 50 --resume --json-output reports/mcp-report.json --markdown-output reports/mcp-report.md
```

`mcp-report` fetches the latest MCP servers from the official Registry API using cursor pagination, audits them concurrently, and writes both a machine-readable JSON report and a markdown leaderboard for sharing. Use `--resume` to keep entries already present in the JSON output file and continue scoring only missing registry records.

### MCP CLI Options

```
[server]               Server name as registered, e.g. io.github.owner/name
-f, --format <format>  Output format: cli, json (default: "cli")
-t, --timeout <ms>     Request timeout in milliseconds (default: "30000")
    --registry <url>   MCP Registry base URL
    --sweep            Fetch servers from the registry and rank them
    --limit <n>        Number of servers to fetch during a sweep (default: 50)
    --page-size <n>    Registry API page size for sweep pagination (default: 100)
    --retries <n>      Retries for transient Registry API failures (default: 2)
    --retry-backoff-ms <ms>
                         Initial retry backoff in milliseconds for Registry API failures (default: 250)
    --concurrency <n>  Maximum concurrent server audits during a sweep (default: 5)
-o, --output <file>    Write the JSON report to a file (sweep mode)
```

### MCP report CLI Options

```
-t, --timeout <ms>        Request timeout in milliseconds (default: "30000")
    --registry <url>      MCP Registry base URL
    --limit <n>           Number of servers to fetch from the official Registry API (default: 50)
    --page-size <n>       Registry API page size for pagination (default: 100)
    --retries <n>         Retries for transient Registry API failures (default: 2)
    --retry-backoff-ms <ms>
                          Initial retry backoff in milliseconds for Registry API failures (default: 250)
    --resume              Resume from the existing JSON output file when present
    --concurrency <n>     Maximum concurrent server audits (default: 5)
    --json-output <file>  Path for the JSON report (default: mcp-report.json)
    --markdown-output <file>
                          Path for the markdown report (default: mcp-report.md)
```

**Strongly recommended for sweeps:** set `GITHUB_TOKEN` (any classic or fine-grained token, no scopes needed) to raise the GitHub API rate limit from 60 to 5,000 requests/hour. Without it, unauthenticated sweeps exhaust the quota after ~30 servers; when that happens ax-score shares the rate-limit state across the whole sweep — it either waits for an imminent quota reset (< 2 minutes) or marks every subsequent server's repository evidence as indeterminate and stamps the affected entries with `rateLimited: true`, so scores stay position-independent and comparable.

### MCP Categories

| Category              | Weight | Description                                                                     |
| --------------------- | ------ | ------------------------------------------------------------------------------- |
| Metadata Completeness | 20%    | Description quality, repository link, semver version, license, display metadata |
| Distribution Health   | 25%    | Packages resolve on npm/PyPI, publish freshness, version consistency            |
| Provenance & Trust    | 25%    | Repository exists and is active, namespace/repo owner alignment, adoption       |
| Operational           | 15%    | Remote endpoint reachability, TLS, well-formed server record                    |
| Documentation         | 15%    | README presence and size, detectable setup instructions                         |

Evidence that cannot be gathered (e.g., a GitHub rate limit, an unsupported package registry) is marked **indeterminate** and excluded from weighting — a server is never penalized for checks we could not run. In sweep output, a category with no evaluable audits is reported as `null` in JSON and `n/a` in the leaderboard — distinct from a genuine score of 0.

### Known limitations (v1)

- **Text heuristics are gameable.** Description quality, README size, and usage-instruction detection are length- and keyword-based; a publisher can satisfy them with boilerplate. Treat high Metadata/Documentation scores as necessary-but-not-sufficient signals. Planned v2 corroboration: cross-checking the README against the declared tool surface, verifying config snippets actually reference the published package, and sampling tool descriptions via a live MCP handshake.
- **Popularity and activity are proxies.** Stars and `pushed_at` indicate attention, not correctness or safety; a starless new server is not defective (it floors at a low partial score, never 0).
- **`oci`/`mcpb`/`nuget` packages are not verified** and report as indeterminate; only npm and PyPI are checked in v1.
- **Remote probing is shallow.** Reachability/TLS checks prove the endpoint answers HTTP; they do not perform an MCP initialize handshake (planned for v2).
- **Non-GitHub repositories** (GitLab, Bitbucket, self-hosted) are reported as indeterminate for provenance and documentation audits.

### Programmatic MCP Usage

```typescript
import { runMcpAudit, runMcpSweep } from '@agentgram/ax-score';

const report = await runMcpAudit({ server: 'io.github.owner/name' });
console.log(`${report.server}: ${report.score}/100`);

const sweep = await runMcpSweep({ limit: 25, concurrency: 5 });
console.log(sweep.entries.slice(0, 10));
```

---

## 📊 AX Categories

| Category          | Weight | Description                                                              |
| ----------------- | ------ | ------------------------------------------------------------------------ |
| Discovery         | 25%    | Can agents find your API and documentation? (`llms.txt`, `openapi.json`) |
| API Quality       | 25%    | Is the API consistent and easy to use programmatically?                  |
| Structured Data   | 20%    | Does the site provide JSON-LD or other machine-readable metadata?        |
| Auth & Onboarding | 15%    | Can agents register and authenticate without human intervention?         |
| Error Handling    | 10%    | Are errors structured and actionable for autonomous systems?             |
| Documentation     | 5%     | Is there comprehensive, machine-readable documentation?                  |

---

## 🎯 Scoring

ax-score uses a 0-100 scale inspired by Google Lighthouse. Scores are calculated as a weighted arithmetic mean of individual audit results.

- 🟢 **90-100**: Excellent (Agent-Ready)
- 🟡 **50-89**: Needs Improvement
- 🔴 **0-49**: Poor (Agent-Hostile)

---

## 🛣️ Roadmap

- **Phase 1: CLI (Current)** — Core gathering and auditing engine with terminal output.
- **Phase 2: Web UI** — A hosted version to test sites and share reports.
- **Phase 3: CI/CD** — GitHub Action to track AX scores over time.
- **Phase 4: Live Testing** — Real-world agent interaction testing.

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to add new audits or gatherers.

---

## 🔗 Related

- **[AgentGram](https://github.com/agentgram/agentgram)** — The social network for AI agents.
- **[AX Principles](docs/AX_PRINCIPLES.md)** — The definitive guide to building agent-friendly platforms.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
