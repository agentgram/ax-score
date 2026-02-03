# ax-score Git Conventions

This document outlines the Git workflow and conventions for the ax-score project.

## Git Flow Branch Strategy

ax-score uses **Git Flow** with two long-lived branches:

| Branch    | Purpose     | Merges From                           | Merges To |
| --------- | ----------- | ------------------------------------- | --------- |
| `main`    | Production  | `develop` (release), `hotfix/*`       | —         |
| `develop` | Integration | `feat/*`, `fix/*`, `refactor/*`, etc. | `main`    |

### Key Rules:

- Feature branches are **always** created from `develop`.
- Feature PRs **always** target `develop` (never `main`).
- Only `develop` (release) and `hotfix/*` can merge into `main`.
- Hotfix branches are created from `main` and merged back to **both** `main` and `develop`.
- **Never** merge feature branches directly to `main`.

## Step 1: Create Issue First (REQUIRED)

Every task needs an issue. Use `gh issue create` with the appropriate format:

**Feature/Enhancement:**

```bash
gh issue create \
  --title "Description of the feature" \
  --label "type: feature,area: <area>" \
  --body "## Problem Statement
<What problem does this solve?>

## Proposed Solution
<What should be built?>

## Checklist
- [ ] <task 1>
- [ ] <task 2>"
```

## Step 2: Create Branch from `develop`

```bash
git checkout develop
git pull origin develop
git checkout -b <type>/<description>-#<issue_number>
```

Branch name format: `<type>/<description>-#<issue_number>`
Examples: `feat/add-gatherer-#14`, `fix/scoring-logic-#23`

## Step 3: Commit Messages

```
<type>: <subject> (#<issue_number>)

<body>
```

| Type       | Description                  |
| ---------- | ---------------------------- |
| `feat`     | Add new feature              |
| `fix`      | Fix bug                      |
| `docs`     | Update documentation         |
| `refactor` | Refactor code                |
| `test`     | Test code                    |
| `chore`    | Build/configuration changes  |
| `rename`   | Rename or move files/folders |
| `remove`   | Remove file                  |

## Step 4: Pre-Push Verification

Before pushing, run these checks:

```bash
pnpm type-check
pnpm lint
pnpm build
pnpm test
```

## Step 5: Create PR (REQUIRED format)

Push the branch and create a PR targeting `develop`:

```bash
git push -u origin <branch-name>

gh pr create --base develop --head <branch-name> \
  --title "[TYPE] Description (#IssueNumber)" \
  --body "$(cat <<'EOF'
## Description

<Brief description of the changes>

## Type of Change

- [x] <mark the relevant type>

## Changes Made

- <change 1>
- <change 2>

## Related Issues

Closes #<issue_number>

## Testing

- [ ] Manual testing performed
- [ ] Type check passes (`pnpm type-check`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Tests pass (`pnpm test`)

## Checklist

- [x] My code follows the project's code style
- [x] I have performed a self-review of my code
- [x] I have made corresponding changes to the documentation
- [x] My changes generate no new warnings
EOF
)"
```

## Branch Protection Rules

- **main**: Requires PR, passing CI, and at least one approval. No direct pushes.
- **develop**: Requires PR and passing CI. No direct pushes.
