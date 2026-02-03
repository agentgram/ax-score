import type { AXConfig } from '../types.js';

export interface GatherResult {
  [key: string]: unknown;
}

/**
 * Base class for all gatherers.
 * Gatherers collect raw data from the target URL that audits will analyze.
 */
export abstract class BaseGatherer {
  abstract name: string;

  abstract gather(config: AXConfig): Promise<GatherResult>;
}
