# Contributing to ax-score

We love your input! We want to make contributing to ax-score as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Adding new Audits or Gatherers

## Prerequisites

- Node.js 20+
- pnpm 10+

## Local Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/agentgram/ax-score.git
   cd ax-score
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start development mode:

   ```bash
   pnpm dev
   ```

4. Run tests:
   ```bash
   pnpm test
   ```

## Issue-First Workflow

Every task needs an issue. Before starting any work, please create an issue using `gh issue create` or the GitHub web interface.

## Branch Naming Convention

We use the following format for branch names:
`<type>/<description>-#<issue_number>`

Example: `feat/add-llms-txt-audit-#42`

## Commit Message Format

We follow the conventional commits pattern:
`<type>: <subject> (#<issue_number>)`

Example: `feat: add llms.txt gatherer (#42)`

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `rename`, `remove`.

## Pull Request Process

1. Create your feature branch from `develop`.
2. Ensure all tests pass and the code follows our style guide.
3. Submit a PR targeting the `develop` branch.
4. Use the PR template provided in the repository.

## Adding a New Audit

To add a new audit to ax-score:

1. **Create a Gatherer** (if needed): If the audit requires new data, create a gatherer in `src/gatherers/` that extends `BaseGatherer`.
2. **Create an Audit**: Create a new class in `src/audits/` that extends `BaseAudit`.
3. **Register the Audit**: Add your audit to the configuration in `src/config/default-config.ts`.
4. **Add Tests**: Create a test file in `tests/audits/` to verify your logic.

## Code Style

Please follow the guidelines in [docs/development/CODE_STYLE.md](docs/development/CODE_STYLE.md).

---

By contributing, you agree that your contributions will be licensed under its MIT License.
