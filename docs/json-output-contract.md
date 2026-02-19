# JSON Output Contract

This document describes the JSON output schema returned by `runAudit()` and the `--format json` CLI flag.

The output follows the `AXReport` TypeScript interface defined in `src/types.ts`.

---

## Top-Level Schema: `AXReport`

| Field             | Type                          | Description                                      |
| ----------------- | ----------------------------- | ------------------------------------------------ |
| `url`             | `string`                      | The URL that was audited                         |
| `timestamp`       | `string`                      | ISO 8601 timestamp of when the audit was run     |
| `version`         | `string`                      | The ax-score version used to generate the report |
| `score`           | `number`                      | Overall AX score (0-100)                         |
| `categories`      | `AXCategory[]`                | Array of category scores                         |
| `audits`          | `Record<string, AuditResult>` | Map of audit ID to audit result                  |
| `recommendations` | `Recommendation[]`            | Actionable recommendations sorted by impact      |

---

## `AXCategory`

| Field         | Type         | Description                                          |
| ------------- | ------------ | ---------------------------------------------------- |
| `id`          | `string`     | Category identifier (e.g., `"discovery"`)            |
| `title`       | `string`     | Human-readable category name                         |
| `description` | `string`     | What this category measures                          |
| `score`       | `number`     | Category score (0-100)                               |
| `weight`      | `number`     | How much this category contributes to overall score  |
| `auditRefs`   | `AuditRef[]` | References to the audits that belong to this category |

## `AuditRef`

| Field    | Type     | Description                                      |
| -------- | -------- | ------------------------------------------------ |
| `id`     | `string` | References an audit ID in the `audits` map       |
| `weight` | `number` | Weight of this audit within its parent category  |

---

## `AuditResult`

| Field              | Type                                          | Description                              |
| ------------------ | --------------------------------------------- | ---------------------------------------- |
| `id`               | `string`                                      | Unique audit identifier                  |
| `title`            | `string`                                      | Pass or fail title text                  |
| `description`      | `string`                                      | What this audit checks                   |
| `score`            | `number`                                      | Score between 0 and 1 (0=fail, 1=pass)  |
| `weight`           | `number`                                      | Always `0` in results (weight is on ref) |
| `scoreDisplayMode` | `"numeric" \| "binary" \| "informative"`      | How to interpret the score               |
| `details`          | `AuditDetails \| undefined`                   | Optional structured diagnostic details   |

## `AuditDetails`

| Field     | Type                                  | Description                         |
| --------- | ------------------------------------- | ----------------------------------- |
| `type`    | `"table" \| "list" \| "text"`        | How the details should be rendered  |
| `items`   | `Array<Record<string, unknown>>`      | Optional data rows                  |
| `summary` | `string \| undefined`                 | Optional human-readable summary     |

---

## `Recommendation`

| Field     | Type     | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `audit`   | `string` | The audit ID this recommendation relates to   |
| `message` | `string` | The audit description explaining the issue    |
| `impact`  | `number` | Potential score improvement (higher = better) |

---

## Audit IDs

There are 19 audits organized into 6 categories:

### Discovery
- `llms-txt` -- Checks for `/llms.txt`
- `openapi-spec` -- Checks for `/openapi.json`
- `robots-ai` -- Checks if robots.txt allows AI agents
- `ai-plugin` -- Checks for `/.well-known/ai-plugin.json`
- `schema-org` -- Checks for JSON-LD Schema.org data

### API Quality
- `openapi-valid` -- Validates OpenAPI spec structure
- `response-format` -- Checks for JSON content type
- `response-examples` -- Checks for examples in OpenAPI spec
- `content-negotiation` -- Checks content negotiation support

### Structured Data
- `json-ld` -- Checks for JSON-LD structured data
- `meta-tags` -- Checks essential meta tags
- `semantic-html` -- Checks for semantic HTML5 elements

### Auth & Onboarding
- `self-service-auth` -- Checks for programmatic auth endpoints
- `no-captcha` -- Verifies no CAPTCHA is required

### Error Handling
- `error-codes` -- Checks for structured error codes
- `rate-limit-headers` -- Checks for rate limit headers
- `retry-after` -- Checks for Retry-After header

### Documentation
- `machine-readable-docs` -- Checks for machine-readable documentation
- `sdk-available` -- Checks for SDK/library references

---

## Example Output

```json
{
  "url": "https://api.example.com",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "version": "0.3.0",
  "score": 62,
  "categories": [
    {
      "id": "discovery",
      "title": "Discovery",
      "description": "Can AI agents find and understand your platform?",
      "score": 72,
      "weight": 25,
      "auditRefs": [
        { "id": "llms-txt", "weight": 8 },
        { "id": "openapi-spec", "weight": 8 },
        { "id": "robots-ai", "weight": 4 },
        { "id": "ai-plugin", "weight": 3 },
        { "id": "schema-org", "weight": 2 }
      ]
    },
    {
      "id": "api-quality",
      "title": "API Quality",
      "description": "Can AI agents effectively use your API?",
      "score": 80,
      "weight": 25,
      "auditRefs": [
        { "id": "openapi-valid", "weight": 10 },
        { "id": "response-format", "weight": 8 },
        { "id": "response-examples", "weight": 4 },
        { "id": "content-negotiation", "weight": 3 }
      ]
    }
  ],
  "audits": {
    "llms-txt": {
      "id": "llms-txt",
      "title": "Site provides an llms.txt file",
      "description": "An llms.txt file helps AI agents understand the site purpose...",
      "score": 1,
      "weight": 0,
      "scoreDisplayMode": "binary",
      "details": {
        "type": "text",
        "summary": "Found /llms.txt with 342 characters of content."
      }
    },
    "openapi-spec": {
      "id": "openapi-spec",
      "title": "Site does not provide an OpenAPI specification",
      "description": "An OpenAPI specification allows AI agents...",
      "score": 0,
      "weight": 0,
      "scoreDisplayMode": "binary",
      "details": {
        "type": "text",
        "summary": "No /openapi.json file was found at the target URL."
      }
    }
  },
  "recommendations": [
    {
      "audit": "openapi-spec",
      "message": "An OpenAPI specification allows AI agents to discover and understand API endpoints...",
      "impact": 8
    },
    {
      "audit": "rate-limit-headers",
      "message": "Rate limit headers inform AI agents about request quotas...",
      "impact": 3
    }
  ]
}
```

---

## Score Interpretation

| Score Range | Label  | Meaning                                    |
| ----------- | ------ | ------------------------------------------ |
| 90-100      | PASS   | Highly agent-friendly                      |
| 50-89       | WARN   | Partially agent-friendly, room to improve  |
| 0-49        | FAIL   | Not agent-friendly, major improvements needed |

The CLI exits with code `0` if the overall score is >= 50, and `1` otherwise.
