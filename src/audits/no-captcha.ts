import type { AuditResult } from '../types.js';
import type { GatherResult } from '../gatherers/base-gatherer.js';
import type { ApiGatherResult } from '../gatherers/api-gatherer.js';
import { BaseAudit, type AuditMeta } from './base-audit.js';

/**
 * Checks that the site does NOT require CAPTCHA.
 * CAPTCHAs are designed to block automated agents and are a major barrier
 * for AI agent accessibility.
 */
export class NoCaptchaAudit extends BaseAudit {
  meta: AuditMeta = {
    id: 'no-captcha',
    title: 'Site does not require CAPTCHA',
    failureTitle: 'Site requires CAPTCHA, blocking AI agents',
    description:
      'CAPTCHAs (reCAPTCHA, hCaptcha, etc.) are designed to block automated access. ' +
      'Sites that require CAPTCHA prevent AI agents from interacting with them. ' +
      'Consider alternative bot-mitigation strategies like API keys or rate limiting.',
    requiredGatherers: ['api'],
    scoreDisplayMode: 'binary',
  };

  async audit(artifacts: Record<string, GatherResult>): Promise<AuditResult> {
    const api = artifacts['api'] as ApiGatherResult;

    // Inverted logic: no captcha = pass, captcha detected = fail
    if (!api.hasCaptcha) {
      return this.pass({
        type: 'text',
        summary: 'No CAPTCHA detected. AI agents can interact with this site.',
      });
    }

    return this.fail({
      type: 'text',
      summary:
        'CAPTCHA detected (reCAPTCHA, hCaptcha, or similar). This blocks AI agents ' +
        'from accessing the site. Consider using API keys or rate limiting instead.',
    });
  }
}
