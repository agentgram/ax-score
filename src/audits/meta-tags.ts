import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HtmlGatherResult } from '../gatherers/html-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

interface TagCheck {
  tag: string;
  present: boolean;
}

/**
 * Checks for essential meta tags: title, description, og:title, og:description.
 * These tags help AI agents quickly understand page purpose and content.
 */
export class MetaTagsAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'meta-tags',
    title: 'Page has essential meta tags',
    failureTitle: 'Page is missing essential meta tags',
    description:
      'Essential meta tags (title, description, og:title, og:description) provide ' +
      'AI agents with quick summaries of page content without full HTML parsing.',
    requiredGatherers: ['html'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const html = artifacts['html'] as HtmlGatherResult;
    const { metaTags } = html;

    const checks: TagCheck[] = [
      { tag: 'title', present: metaTags.title !== null && metaTags.title.length > 0 },
      {
        tag: 'description',
        present: metaTags.description !== null && metaTags.description.length > 0,
      },
      {
        tag: 'og:title',
        present: metaTags.ogTitle !== null && metaTags.ogTitle.length > 0,
      },
      {
        tag: 'og:description',
        present: metaTags.ogDescription !== null && metaTags.ogDescription.length > 0,
      },
    ];

    const foundCount = checks.filter((c) => c.present).length;
    const score = foundCount / checks.length;

    const details: AuditDetails = {
      type: 'table',
      items: checks.map((c) => ({
        tag: c.tag,
        status: c.present ? 'found' : 'missing',
      })),
      summary: `${foundCount} of ${checks.length} essential meta tags found`,
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
