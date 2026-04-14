import type { AuditResult, AuditDetails } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { HttpGatherResult } from '../gatherers/http-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks whether the site exposes a `/llms.txt` file with meaningful content,
 * and awards bonus points for quality indicators and a companion `/llms-full.txt`.
 *
 * Scoring (0–1):
 *   - llms.txt found: base 0.4
 *   - Contains H1 heading: +0.1
 *   - Contains blockquote summary (> …): +0.1
 *   - Contains sectioned URL lists (### heading followed by links): +0.15
 *   - Content ≥ 100 chars: +0.05
 *   - Companion /llms-full.txt found: +0.2
 */
export class LlmsTxtAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'llms-txt',
    title: 'Site provides an llms.txt file',
    failureTitle: 'Site does not provide an llms.txt file',
    description:
      'An llms.txt file helps AI agents understand the site purpose and available resources. ' +
      'Providing one with proper structure (headings, summaries, URL lists) and a companion ' +
      'llms-full.txt maximizes discoverability by LLM-based tools.',
    requiredGatherers: ['http'],
    scoreDisplayMode: 'numeric',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const http = artifacts['http'] as HttpGatherResult;
    const llmsTxt = http.llmsTxt;
    const llmsFullTxt = http.llmsFullTxt;

    if (!llmsTxt.found) {
      return this.fail({
        type: 'text',
        summary: 'No /llms.txt file was found at the target URL.',
      });
    }

    const content = (llmsTxt.content ?? '').trim();

    if (content.length === 0) {
      return this.partial(0.2, {
        type: 'text',
        summary: 'An /llms.txt file was found but it is empty.',
      });
    }

    // Score individual quality signals
    let score = 0.4; // base for found + non-empty
    const signals: string[] = ['file found'];

    // H1 heading
    if (/^#\s+.+/m.test(content)) {
      score += 0.1;
      signals.push('H1 heading');
    }

    // Blockquote summary (> …)
    if (/^>\s+.+/m.test(content)) {
      score += 0.1;
      signals.push('blockquote summary');
    }

    // Sectioned URL lists (### heading followed by lines with links)
    if (/###\s+.+[\s\S]*?https?:\/\//m.test(content)) {
      score += 0.15;
      signals.push('sectioned URL lists');
    }

    // Content length bonus
    if (content.length >= 100) {
      score += 0.05;
      signals.push('≥100 chars');
    }

    // Companion llms-full.txt
    if (llmsFullTxt.found && (llmsFullTxt.content ?? '').trim().length > 0) {
      score += 0.2;
      signals.push('companion /llms-full.txt');
    }

    score = Math.min(1, score);

    const details: AuditDetails = {
      type: 'list',
      items: signals.map((s) => ({ signal: s })),
      summary: `Found /llms.txt (${content.length} chars). Signals: ${signals.join(', ')}.`,
    };

    if (score >= 1) {
      return this.pass(details);
    }

    return this.partial(score, details);
  }
}
