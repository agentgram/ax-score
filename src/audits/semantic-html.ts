import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

interface ElementCheck {
  element: string;
  present: boolean;
}

/**
 * Checks for semantic HTML5 elements and heading hierarchy.
 * Semantic markup helps AI agents navigate and understand page structure.
 *
 * Checks: nav, main, article, header, footer, h1, and heading hierarchy
 * (no skipped levels, e.g. h1 → h3 without h2).
 */
export class SemanticHtmlAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'semantic-html',
    title: 'Page uses semantic HTML elements',
    failureTitle: 'Page is missing semantic HTML elements',
    description:
      'Semantic HTML5 elements (nav, main, article, header, footer, h1) and ' +
      'proper heading hierarchy provide structural meaning that helps AI agents ' +
      'navigate page content and identify key sections.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const { semanticElements } = html;

    const checks: ElementCheck[] = [
      { element: '<nav>', present: semanticElements.hasNav },
      { element: '<main>', present: semanticElements.hasMain },
      { element: '<article>', present: semanticElements.hasArticle },
      { element: '<header>', present: semanticElements.hasHeader },
      { element: '<footer>', present: semanticElements.hasFooter },
      { element: '<h1>', present: semanticElements.hasH1 },
    ];

    const foundCount = checks.filter((c) => c.present).length;
    let score = foundCount / checks.length;

    // Bonus: check heading hierarchy (no skipped levels)
    const hierarchyOk = this.checkHeadingHierarchy(semanticElements.headingLevels);
    if (hierarchyOk && semanticElements.headingLevels.length >= 2) {
      score = Math.min(1, score + 0.1);
    }

    const details: AuditDetails = {
      type: 'table',
      items: [
        ...checks.map((c) => ({
          element: c.element,
          status: c.present ? 'found' : 'missing',
        })),
        {
          element: 'heading hierarchy',
          status: hierarchyOk ? 'valid' : 'skipped levels',
        },
      ],
      summary: `${foundCount} of ${checks.length} semantic elements found${hierarchyOk && semanticElements.headingLevels.length >= 2 ? ', valid heading hierarchy' : ''}`,
    };

    if (score >= 1) {
      return this.pass(details);
    }

    if (score <= 0) {
      return this.fail(details);
    }

    return this.partial(score, details);
  }

  /**
   * Checks that heading levels don't skip (e.g., h1 → h3 without h2).
   * Returns true if the hierarchy is valid (or if there are fewer than 2 headings).
   */
  private checkHeadingHierarchy(levels: number[]): boolean {
    if (levels.length < 2) return true;

    // Check each transition: should not jump more than 1 level down
    for (let i = 1; i < levels.length; i++) {
      const diff = levels[i]! - levels[i - 1]!;
      if (diff > 1) return false;
    }

    return true;
  }
}
