import { describe, it, expect } from 'vitest';
import { NoCaptchaAudit } from '../no-captcha.js';
import { makeApiArtifact } from './fixtures.js';

describe('NoCaptchaAudit', () => {
  const audit = new NoCaptchaAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('no-captcha');
  });

  it('should pass when no CAPTCHA is detected', async () => {
    const artifacts = makeApiArtifact({ hasCaptcha: false });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when CAPTCHA is detected', async () => {
    const artifacts = makeApiArtifact({ hasCaptcha: true });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });
});
