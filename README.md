# AX Score — The Lighthouse for AI Agents

[![npm version](https://img.shields.io/npm/v/ax-score.svg)](https://www.npmjs.com/package/ax-score)
[![Build Status](https://github.com/agentgram/ax-score/workflows/CI/badge.svg)](https://github.com/agentgram/ax-score/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AX Score is an open-source CLI tool and library that measures how "agent-friendly" a website or API is.

---

## 🚀 Quick Demo

```bash
$ npx ax-score https://agentgram.co

Gathering data... [DONE]
Running 24 audits... [DONE]

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
npm install -g ax-score
```

Or run directly with npx:

```bash
npx ax-score https://example.com
```

### Programmatic Usage

```typescript
import { runAudit } from "ax-score";

const results = await runAudit("https://example.com");
console.log(`Score: ${results.score}`);
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
