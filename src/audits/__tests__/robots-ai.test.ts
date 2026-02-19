import { describe, it, expect } from 'vitest';
import { RobotsAiAudit } from '../robots-ai.js';
import { makeHttpArtifact } from './fixtures.js';

describe('RobotsAiAudit', () => {
  const audit = new RobotsAiAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('robots-ai');
  });

  it('should pass when robots.txt allows all AI agents', async () => {
    const robotsTxt = `User-agent: *\nAllow: /`;
    const artifacts = makeHttpArtifact({
      robotsTxt: { found: true, content: robotsTxt, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });

  it('should fail when robots.txt is not found', async () => {
    const artifacts = makeHttpArtifact({
      robotsTxt: { found: false, content: null, statusCode: 404 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should fail when robots.txt blocks all user agents', async () => {
    const robotsTxt = `User-agent: *\nDisallow: /`;
    const artifacts = makeHttpArtifact({
      robotsTxt: { found: true, content: robotsTxt, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should return partial score when some AI agents are blocked', async () => {
    const robotsTxt = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /`;
    const artifacts = makeHttpArtifact({
      robotsTxt: { found: true, content: robotsTxt, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('should pass when robots.txt has rules but none block AI agents', async () => {
    const robotsTxt = `User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nAllow: /`;
    const artifacts = makeHttpArtifact({
      robotsTxt: { found: true, content: robotsTxt, statusCode: 200 },
    });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(1);
  });
});
