# CLAUDE.md — ax-score Development Guide

> This document provides guidelines for AI coding assistants when writing, reviewing, or modifying code in the ax-score project.
> **All comments, commit messages, and documentation must be written in English.**

---

## Project Overview

**ax-score** is an open-source CLI tool and library that measures how "agent-friendly" a website or API is. Like Google Lighthouse for web performance, ax-score scores sites on their readiness for AI agent consumption.

- **Domain**: `ax-score.org` (planned)
- **License**: MIT
- **Language**: English (all documentation, commits, PRs, and code)

---

## Tech Stack

| Technology | Version | Purpose             |
| ---------- | ------- | ------------------- |
| TypeScript | 5.9     | Type Safety         |
| Node.js    | 20+     | Runtime Environment |
| tsup       | latest  | Bundler             |
| vitest     | latest  | Testing Framework   |
| commander  | latest  | CLI Framework       |
| chalk      | latest  | Terminal Styling    |
| ora        | latest  | Terminal Spinners   |
| pnpm       | 10+     | Package Manager     |

---

## Project Structure

```
ax-score/
├── src/
│   ├── gatherers/    # Data collection logic (HTTP, Puppeteer, etc.)
│   ├── audits/       # Scoring logic based on gathered data
│   ├── config/       # Audit configurations and weights
│   ├── reporter/     # Output formatting (CLI, JSON, HTML)
│   ├── bin/          # CLI entry point
│   ├── lib/          # Shared utilities
│   └── types/        # TypeScript type definitions
├── tests/            # Test suites
├── docs/             # Project documentation
└── dist/             # Compiled output
```

---

## Architecture: Lighthouse-style Pipeline

ax-score follows a 3-phase pipeline:

1. **Gather**: Collect raw data from the target URL (e.g., fetching `llms.txt`, checking headers, parsing HTML).
2. **Audit**: Run specific tests against the gathered data to produce scores and diagnostic information.
3. **Report**: Aggregate audit results into categories and format the output for the user.

---

## Coding Conventions

### TypeScript

- `strict: true` is required
- `any` is forbidden → use `unknown`
- `as any`, `@ts-ignore`, `@ts-expect-error` are strictly forbidden
- `interface` → Public API, `type` → Internal use
- Omit types if they can be inferred

### Naming

| Target            | Rule             | Example                 |
| ----------------- | ---------------- | ----------------------- |
| File              | kebab-case       | `base-gatherer.ts`      |
| Variable/Function | camelCase        | `runAudit()`, `data`    |
| Constant          | UPPER_SNAKE_CASE | `MAX_RETRIES`           |
| Type/Interface    | PascalCase       | `AuditResult`, `Config` |

---

## Git Workflow (Mandatory)

### Git Flow Branch Strategy

ax-score uses **Git Flow** with two long-lived branches:

| Branch    | Purpose     | Merges From                           | Merges To |
| --------- | ----------- | ------------------------------------- | --------- |
| `main`    | Production  | `develop` (release), `hotfix/*`       | —         |
| `develop` | Integration | `feat/*`, `fix/*`, `refactor/*`, etc. | `main`    |

**Key Rules:**

- Feature branches are created from `develop`
- Feature PRs target `develop`
- Branch name format: `<type>/<description>-#<issue_number>`

### Commit Messages

```
<type>: <subject> (#<issue_number>)

<body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `rename`, `remove`.

---

## Pre-Push Verification

Before pushing, run these checks:

```bash
pnpm type-check    # TypeScript errors = MUST fix
pnpm lint           # Lint errors = MUST fix
pnpm build          # Build failure = MUST fix
pnpm test           # Test failure = MUST fix
```

---

## Anti-Patterns

- `as any`, `@ts-ignore`, `@ts-expect-error` — Strictly forbidden
- Empty catch blocks `catch(e) {}` — Error handling is required
- Committing `console.log` debugging code — Forbidden

---

## Common Commands

```bash
# Build the project
pnpm build

# Development mode (watch)
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Type check
pnpm type-check
```
