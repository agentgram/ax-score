# ax-score Code Style Guide

This document outlines the coding conventions and standards for the ax-score project.

## TypeScript Rules

### Strict Mode

- `strict: true` is mandatory in `tsconfig.json`.
- No `any` type allowed. Use `unknown` if the type is truly dynamic.
- `as any`, `@ts-ignore`, and `@ts-expect-error` are strictly forbidden.

### Types vs Interfaces

- Use `interface` for public APIs and external contracts.
- Use `type` for internal definitions, unions, and intersections.

### Type Inference

- Omit type annotations when the type can be clearly inferred by the compiler.
- Use type-only imports: `import type { ... } from '...'`.

## Naming Conventions

| Target         | Rule             | Example            |
| -------------- | ---------------- | ------------------ |
| File           | kebab-case       | `base-audit.ts`    |
| Variable       | camelCase        | `auditResult`      |
| Function       | camelCase        | `calculateScore()` |
| Constant       | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT`  |
| Type/Interface | PascalCase       | `GathererResult`   |

## Import Order

1. Node.js built-in modules (`fs`, `path`, `http`)
2. External libraries (`commander`, `chalk`)
3. Internal project modules using `@/` alias or relative paths
4. Type-only imports

## Error Handling

- Never use empty catch blocks.
- Use custom error classes for specific failure modes (e.g., `GathererError`, `AuditError`).
- Provide actionable error messages that help the user understand what went wrong.

## Testing

- We use **vitest** for testing.
- Follow the **Given-When-Then** pattern for test descriptions.
- Aim for high coverage on audits and gatherers.

## Anti-Patterns

- **No console.log**: Use the project's logger or reporter for output.
- **No magic numbers**: Use named constants for timeouts, weights, and thresholds.
- **No deep nesting**: Prefer early returns to reduce indentation.
- **No side effects in gatherers**: Gatherers should only collect data, not modify state or perform audits.
