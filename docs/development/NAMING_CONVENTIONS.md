# ax-score Naming Conventions

This document defines the naming conventions for the ax-score project to ensure consistency across the codebase.

## Files and Directories

- **Directories**: Use `kebab-case`.
  - Example: `src/gatherers/`, `src/audits/`
- **TypeScript Files**: Use `kebab-case`.
  - Example: `base-gatherer.ts`, `llms-txt-audit.ts`
- **Test Files**: Use `kebab-case` with `.test.ts` or `.spec.ts` suffix.
  - Example: `scoring.test.ts`

## Variables and Functions

- **Variables**: Use `camelCase`.
  - Example: `auditResult`, `gathererData`
- **Functions**: Use `camelCase`.
  - Example: `runAudit()`, `calculateWeightedScore()`
- **Boolean Variables**: Use prefixes like `is`, `has`, `should`, or `can`.
  - Example: `isAgentFriendly`, `hasOpenApiSpec`

## Constants

- **Global Constants**: Use `UPPER_SNAKE_CASE`.
  - Example: `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS`
- **Configuration Objects**: Use `PascalCase` for the object name, `camelCase` for keys.
  - Example: `const DefaultConfig = { ... }`

## Types and Interfaces

- **Interfaces**: Use `PascalCase`.
  - Example: `interface AuditResult { ... }`
- **Type Aliases**: Use `PascalCase`.
  - Example: `type Score = number;`
- **Enums**: Use `PascalCase` for the enum name and `PascalCase` for members.
  - Example:
    ```typescript
    enum AuditStatus {
      Pass,
      Fail,
      Error,
    }
    ```

## Classes

- **Class Names**: Use `PascalCase`.
  - Example: `class BaseGatherer { ... }`
- **Class Methods**: Use `camelCase`.
  - Example: `gatherData()`
- **Class Properties**: Use `camelCase`.
  - Example: `private timeoutMs: number;`

## API and CLI

- **CLI Commands**: Use `kebab-case`.
  - Example: `ax-score run`
- **CLI Options**: Use `kebab-case` for long flags.
  - Example: `--output-format`, `--config-path`
- **JSON Keys**: Use `camelCase` for API responses and JSON reports.
  - Example: `{ "overallScore": 94, "auditResults": [] }`
