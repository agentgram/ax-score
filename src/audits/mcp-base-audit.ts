import type { AuditResult } from '../types.js';
import { BaseAudit } from './base-audit.js';

/**
 * Base class for MCP-mode audits.
 *
 * Adds two result helpers on top of pass/fail/partial:
 * - `notApplicable`: the server has nothing to evaluate for this audit
 * - `indeterminate`: the evidence could not be gathered (network failure,
 *   rate limit, unsupported provider)
 *
 * Both are excluded from weighting by the MCP runner, so a server is never
 * penalized for evidence we failed to collect (indeterminate ≠ zero).
 */
export abstract class McpBaseAudit extends BaseAudit {
  protected notApplicable(summary: string): AuditResult {
    return {
      id: this.meta.id,
      title: this.meta.title,
      description: this.meta.description,
      score: 1,
      weight: 0,
      scoreDisplayMode: 'informative',
      applicability: 'not-applicable',
      details: { type: 'text', summary },
    };
  }

  protected indeterminate(summary: string): AuditResult {
    return {
      id: this.meta.id,
      title: this.meta.title,
      description: this.meta.description,
      score: 0,
      weight: 0,
      scoreDisplayMode: 'informative',
      applicability: 'indeterminate',
      details: { type: 'text', summary },
    };
  }

  /** Days elapsed since an ISO date string, or null when unparseable. */
  protected daysSince(iso: string | null): number | null {
    if (!iso) return null;
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return null;
    return (Date.now() - time) / (1000 * 60 * 60 * 24);
  }
}
