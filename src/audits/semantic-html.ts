import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

interface ElementCheck {
  element: string;
  present: boolean;
}

/**
 * Checks for semantic HTML5 elements: nav, main, header, footer, h1.
 * Semantic markup helps AI agents navigate and understand page structure.
 */
export class SemanticHtmlAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'semantic-html',
    title: 'Page uses semantic HTML elements',
    failureTitle: 'Page is missing semantic HTML elements',
    description:
      'Semantic HTML5 elements (nav, main, header, footer, h1) provide structural ' +
      'meaning that helps AI agents navigate page content and identify key sections.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const { semanticElements } = html;

    const checks: ElementCheck[] = [
      { element: '<nav>', present: semanticElements.hasNav },
      { element: '<main>', present: semanticElements.hasMain },
      { element: '<header>', present: semanticElements.hasHeader },
      { element: '<footer>', present: semanticElements.hasFooter },
      { element: '<h1>', present: semanticElements.hasH1 },
    ];

    const foundCount = checks.filter((c) => c.present).length;
    const score = foundCount / checks.length;

    const details: AuditDetails = {
      type: 'table',
      items: checks.map((c) => ({
        element: c.element,
        status: c.present ? 'found' : 'missing',
      })),
      summary: `${foundCount} of ${checks.length} semantic elements found`,
    };

    if (score === 1) {
      return this.pass(details);
    }

    if (score === 0) {
      return this.fail(details);
    }

    return this.partial(score, details);
  }
}
