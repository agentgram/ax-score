// Main API
export { runAudit } from './runner.js';

// Types
export type {
  AXReport,
  AXCategory,
  AuditResult,
  AXConfig,
  Recommendation,
  AuditDetails,
  AuditRef,
} from './types.js';

// Base classes (for extensibility)
export { BaseAudit } from './audits/base-audit.js';
export type { AuditMeta } from './audits/base-audit.js';

export { BaseGatherer } from './gatherers/base-gatherer.js';
export type { GatherResult } from './gatherers/base-gatherer.js';

// Concrete gatherers
export { HttpGatherer } from './gatherers/http-gatherer.js';
export type { HttpGatherResult, FileProbe } from './gatherers/http-gatherer.js';

export { HtmlGatherer } from './gatherers/html-gatherer.js';
export type { HtmlGatherResult, MetaTags, SemanticElements } from './gatherers/html-gatherer.js';

export { ApiGatherer } from './gatherers/api-gatherer.js';
export type { ApiGatherResult } from './gatherers/api-gatherer.js';

// Upload
export { uploadReport } from './upload.js';
export type { UploadOptions } from './upload.js';
