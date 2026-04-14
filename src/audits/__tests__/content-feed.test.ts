import { describe, it, expect } from 'vitest';
import { ContentFeedAudit } from '../content-feed.js';
import { makeHttpArtifact, makeHtmlArtifact } from './fixtures.js';
import type { GatherResult } from '../../gatherers/base-gatherer.js';

function makeFeedArtifacts(
  httpOverrides: Record<string, unknown> = {},
  htmlOverrides: Record<string, unknown> = {}
): Record<string, GatherResult> {
  return {
    ...makeHttpArtifact(httpOverrides),
    ...makeHtmlArtifact(htmlOverrides),
  } as unknown as Record<string, GatherResult>;
}

describe('ContentFeedAudit', () => {
  const audit = new ContentFeedAudit();

  it('should have the correct audit id', () => {
    expect(audit.meta.id).toBe('content-feed');
  });

  it('should pass when RSS feed link is found in HTML', async () => {
    const artifacts = makeFeedArtifacts(
      {},
      {
        feedLinks: [{ type: 'application/rss+xml', href: '/rss.xml', title: 'RSS Feed' }],
      }
    );

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should pass when Atom feed link is found', async () => {
    const artifacts = makeFeedArtifacts(
      {},
      {
        feedLinks: [{ type: 'application/atom+xml', href: '/atom.xml', title: null }],
      }
    );

    const result = await audit.audit(artifacts);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should fail when no feed is detected', async () => {
    const artifacts = makeFeedArtifacts({}, { feedLinks: [] });

    const result = await audit.audit(artifacts);
    expect(result.score).toBe(0);
  });

  it('should give higher score for multiple feeds', async () => {
    const single = await audit.audit(makeFeedArtifacts(
      {},
      { feedLinks: [{ type: 'application/rss+xml', href: '/rss.xml', title: null }] }
    ));
    const multiple = await audit.audit(makeFeedArtifacts(
      {},
      {
        feedLinks: [
          { type: 'application/rss+xml', href: '/rss.xml', title: 'RSS' },
          { type: 'application/atom+xml', href: '/atom.xml', title: 'Atom' },
        ],
      }
    ));

    expect(multiple.score).toBeGreaterThanOrEqual(single.score);
  });
});
