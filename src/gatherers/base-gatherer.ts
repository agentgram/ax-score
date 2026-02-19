import type { AXConfig } from '../types.js';

export interface GatherResult {
  [key: string]: unknown;
}

/**
 * Base class for all gatherers.
 * Gatherers collect raw data from the target URL that audits will analyze.
 *
 * Second-pass gatherers (e.g., HtmlGatherer) receive `artifacts` from
 * first-pass gatherers so they can parse derived data without re-fetching.
 */
export abstract class BaseGatherer {
  abstract name: string;

  abstract gather(
    config: AXConfig,
    artifacts?: Record<string, GatherResult>
  ): Promise<GatherResult>;
}
