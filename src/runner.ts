import type { AXConfig, AXReport, AXCategory, AuditResult } from './types.js';
import { DEFAULT_CATEGORIES, VERSION } from './config/default.js';
import {
  calculateCategoryScore,
  calculateOverallScore,
  generateRecommendations,
} from './scoring.js';

/**
 * Run an AX audit against the given URL.
 * Orchestrates the Gather -> Audit -> Score -> Report pipeline.
 */
export async function runAudit(config: AXConfig): Promise<AXReport> {
  const { url } = config;

  // TODO: Phase 1 — Implement gatherers to collect artifacts from URL
  // TODO: Phase 1 — Run audits against gathered artifacts
  // For now, return a placeholder report showing the structure
  const audits: Record<string, AuditResult> = {};

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
