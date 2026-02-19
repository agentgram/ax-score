import type { AXConfig, AXReport, AXCategory, AuditResult } from './types.js';
import type { GatherResult } from './gatherers/base-gatherer.js';
import { DEFAULT_CATEGORIES, VERSION } from './config/default.js';
import {
  calculateCategoryScore,
  calculateOverallScore,
  generateRecommendations,
} from './scoring.js';

// Gatherers
import { HttpGatherer } from './gatherers/http-gatherer.js';
import { HtmlGatherer } from './gatherers/html-gatherer.js';
import { ApiGatherer } from './gatherers/api-gatherer.js';

// Audits — Discovery
import { LlmsTxtAudit } from './audits/llms-txt.js';
import { OpenapiSpecAudit } from './audits/openapi-spec.js';
import { RobotsAiAudit } from './audits/robots-ai.js';
import { AiPluginAudit } from './audits/ai-plugin.js';
import { SchemaOrgAudit } from './audits/schema-org.js';

// Audits — API Quality
import { OpenapiValidAudit } from './audits/openapi-valid.js';
import { ResponseFormatAudit } from './audits/response-format.js';
import { ResponseExamplesAudit } from './audits/response-examples.js';
import { ContentNegotiationAudit } from './audits/content-negotiation.js';

// Audits — Structured Data
import { JsonLdAudit } from './audits/json-ld.js';
import { MetaTagsAudit } from './audits/meta-tags.js';
import { SemanticHtmlAudit } from './audits/semantic-html.js';

// Audits — Auth & Onboarding
import { SelfServiceAuthAudit } from './audits/self-service-auth.js';
import { NoCaptchaAudit } from './audits/no-captcha.js';

// Audits — Error Handling
import { ErrorCodesAudit } from './audits/error-codes.js';
import { RateLimitHeadersAudit } from './audits/rate-limit-headers.js';
import { RetryAfterAudit } from './audits/retry-after.js';

// Audits — Documentation
import { MachineReadableDocsAudit } from './audits/machine-readable-docs.js';
import { SdkAvailableAudit } from './audits/sdk-available.js';

import type { BaseAudit } from './audits/base-audit.js';

/** All registered audits. Order does not matter — they are mapped by ID. */
function createAudits(): BaseAudit[] {
  return [
    // Discovery
    new LlmsTxtAudit(),
    new OpenapiSpecAudit(),
    new RobotsAiAudit(),
    new AiPluginAudit(),
    new SchemaOrgAudit(),
    // API Quality
    new OpenapiValidAudit(),
    new ResponseFormatAudit(),
    new ResponseExamplesAudit(),
    new ContentNegotiationAudit(),
    // Structured Data
    new JsonLdAudit(),
    new MetaTagsAudit(),
    new SemanticHtmlAudit(),
    // Auth & Onboarding
    new SelfServiceAuthAudit(),
    new NoCaptchaAudit(),
    // Error Handling
    new ErrorCodesAudit(),
    new RateLimitHeadersAudit(),
    new RetryAfterAudit(),
    // Documentation
    new MachineReadableDocsAudit(),
    new SdkAvailableAudit(),
  ];
}

/**
 * Run an AX audit against the given URL.
 * Orchestrates the Gather → Audit → Score → Report pipeline.
 */
export async function runAudit(config: AXConfig): Promise<AXReport> {
  const { url } = config;

  // Phase 1: Gather — collect raw artifacts from the target
  const httpGatherer = new HttpGatherer();
  const htmlGatherer = new HtmlGatherer();
  const apiGatherer = new ApiGatherer();

  // First pass: HTTP (network requests)
  const artifacts: Record<string, GatherResult> = {};
  artifacts['http'] = await httpGatherer.gather(config);

  // Second pass: HTML + API (derived from HTTP artifacts)
  artifacts['html'] = await htmlGatherer.gather(config, artifacts);
  artifacts['api'] = await apiGatherer.gather(config, artifacts);

  // Phase 2: Audit — run all audits against gathered artifacts
  const allAudits = createAudits();
  const audits: Record<string, AuditResult> = {};

  const auditPromises = allAudits.map(async (auditInstance) => {
    try {
      const result = await auditInstance.audit(artifacts);
      audits[result.id] = result;
    } catch (err) {
      // If an audit fails, record it as score 0
      audits[auditInstance.meta.id] = {
        id: auditInstance.meta.id,
        title: auditInstance.meta.failureTitle,
        description: `Audit error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        score: 0,
        weight: 0,
        scoreDisplayMode: auditInstance.meta.scoreDisplayMode,
      };
    }
  });

  await Promise.all(auditPromises);

  // Phase 3: Score — calculate category and overall scores
  const categories: AXCategory[] = DEFAULT_CATEGORIES.map((cat) => ({
    id: cat.id,
    title: cat.title,
    description: cat.description,
    weight: cat.weight,
    score: calculateCategoryScore(audits, cat.auditRefs),
    auditRefs: cat.auditRefs,
  }));

  const allAuditRefs = DEFAULT_CATEGORIES.flatMap((c) => c.auditRefs);
  const recommendations = generateRecommendations(audits, allAuditRefs);

  return {
    url,
    timestamp: new Date().toISOString(),
    version: VERSION,
    score: calculateOverallScore(categories),
    categories,
    audits,
    recommendations,
  };
}
