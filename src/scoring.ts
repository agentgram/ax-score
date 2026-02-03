import type { AuditResult, AuditRef, AXCategory, Recommendation } from './types.js';

/**
 * Calculate a category score using weighted arithmetic mean (Lighthouse algorithm).
 * Returns a score between 0-100.
 */
export function calculateCategoryScore(
  audits: Record<string, AuditResult>,
  auditRefs: AuditRef[]
): number {
  const validRefs = auditRefs.filter((ref) => ref.weight > 0);
  if (validRefs.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const ref of validRefs) {
    const audit = audits[ref.id];
    if (!audit) continue;
    weightedSum += audit.score * ref.weight;
    totalWeight += ref.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

/**
 * Calculate overall AX score from category scores using weighted arithmetic mean.
 * Returns a score between 0-100.
 */
export function calculateOverallScore(categories: AXCategory[]): number {
  const validCategories = categories.filter((c) => c.weight > 0);
  if (validCategories.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const category of validCategories) {
    weightedSum += category.score * category.weight;
    totalWeight += category.weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

/**
 * Generate actionable recommendations sorted by impact (highest first).
 */
export function generateRecommendations(
  audits: Record<string, AuditResult>,
  auditRefs: AuditRef[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const ref of auditRefs) {
    const audit = audits[ref.id];
    if (!audit || audit.score >= 1) continue;

    const impact = Math.round((1 - audit.score) * ref.weight);
    if (impact > 0) {
      recommendations.push({
        audit: audit.id,
        message: audit.description,
        impact,
      });
    }
  }

  return recommendations.sort((a, b) => b.impact - a.impact);
}
