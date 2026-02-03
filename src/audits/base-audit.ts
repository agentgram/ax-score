import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';

export interface AuditMeta {
  id: string;
  title: string;
  failureTitle: string;
  description: string;
  requiredGatherers: string[];
  scoreDisplayMode: 'numeric' | 'binary' | 'informative';
}

/**
 * Base class for all audits.
 * Audits analyze gathered artifacts and produce a score with recommendations.
 */
export abstract class BaseAudit {
  abstract meta: AuditMeta;

  abstract audit(artifacts: Record<string, GatherResult>): Promise<AuditResult>;

  protected pass(details?: AuditDetails): AuditResult {
    return {
      id: this.meta.id,
      title: this.meta.title,
      description: this.meta.description,
      score: 1,
      weight: 0,
      scoreDisplayMode: this.meta.scoreDisplayMode,
      details,
    };
  }

  protected fail(details?: AuditDetails): AuditResult {
    return {
      id: this.meta.id,
      title: this.meta.failureTitle,
      description: this.meta.description,
      score: 0,
      weight: 0,
      scoreDisplayMode: this.meta.scoreDisplayMode,
      details,
    };
  }

  protected partial(score: number, details?: AuditDetails): AuditResult {
    return {
      id: this.meta.id,
      title: score >= 0.5 ? this.meta.title : this.meta.failureTitle,
      description: this.meta.description,
      score: Math.max(0, Math.min(1, score)),
      weight: 0,
      scoreDisplayMode: this.meta.scoreDisplayMode,
      details,
    };
  }
}
