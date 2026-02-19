import { describe, it, expect } from 'vitest';
import { calculateCategoryScore, calculateOverallScore, generateRecommendations } from './scoring.js';
import type { AuditResult, AuditRef, AXCategory } from './types.js';

function makeAudit(id: string, score: number): AuditResult {
  return {
    id,
    title: `Audit ${id}`,
    description: `Description for ${id}`,
    score,
    weight: 0,
    scoreDisplayMode: 'numeric',
  };
}

describe('calculateCategoryScore', () => {
  it('should return 0 when there are no audit refs', () => {
    const score = calculateCategoryScore({}, []);
    expect(score).toBe(0);
  });

  it('should return 0 when all refs have zero weight', () => {
    const audits: Record<string, AuditResult> = {
      'test-1': makeAudit('test-1', 1),
    };
    const refs: AuditRef[] = [{ id: 'test-1', weight: 0 }];
    const score = calculateCategoryScore(audits, refs);
    expect(score).toBe(0);
  });

  it('should calculate weighted average correctly', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 1),
      b: makeAudit('b', 0),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 1 },
      { id: 'b', weight: 1 },
    ];
    // (1*1 + 0*1) / (1+1) * 100 = 50
    const score = calculateCategoryScore(audits, refs);
    expect(score).toBe(50);
  });

  it('should respect different weights', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 1),
      b: makeAudit('b', 0),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 3 },
      { id: 'b', weight: 1 },
    ];
    // (1*3 + 0*1) / (3+1) * 100 = 75
    const score = calculateCategoryScore(audits, refs);
    expect(score).toBe(75);
  });

  it('should skip missing audits', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 1),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 1 },
      { id: 'missing', weight: 1 },
    ];
    // Only 'a' is counted: (1*1) / 1 * 100 = 100
    const score = calculateCategoryScore(audits, refs);
    expect(score).toBe(100);
  });

  it('should return 100 when all audits pass', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 1),
      b: makeAudit('b', 1),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 5 },
      { id: 'b', weight: 5 },
    ];
    const score = calculateCategoryScore(audits, refs);
    expect(score).toBe(100);
  });
});

describe('calculateOverallScore', () => {
  it('should return 0 when there are no categories', () => {
    const score = calculateOverallScore([]);
    expect(score).toBe(0);
  });

  it('should return 0 when all categories have zero weight', () => {
    const categories: AXCategory[] = [
      { id: 'cat', title: 'Cat', description: 'Desc', score: 100, weight: 0, auditRefs: [] },
    ];
    const score = calculateOverallScore(categories);
    expect(score).toBe(0);
  });

  it('should calculate weighted average of category scores', () => {
    const categories: AXCategory[] = [
      { id: 'a', title: 'A', description: '', score: 100, weight: 1, auditRefs: [] },
      { id: 'b', title: 'B', description: '', score: 0, weight: 1, auditRefs: [] },
    ];
    const score = calculateOverallScore(categories);
    expect(score).toBe(50);
  });

  it('should respect different category weights', () => {
    const categories: AXCategory[] = [
      { id: 'a', title: 'A', description: '', score: 80, weight: 3, auditRefs: [] },
      { id: 'b', title: 'B', description: '', score: 20, weight: 1, auditRefs: [] },
    ];
    // (80*3 + 20*1) / (3+1) = 65
    const score = calculateOverallScore(categories);
    expect(score).toBe(65);
  });
});

describe('generateRecommendations', () => {
  it('should return empty array when all audits pass', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 1),
      b: makeAudit('b', 1),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 5 },
      { id: 'b', weight: 5 },
    ];
    const recs = generateRecommendations(audits, refs);
    expect(recs).toHaveLength(0);
  });

  it('should generate recommendations for failing audits', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 0),
      b: makeAudit('b', 1),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 5 },
      { id: 'b', weight: 5 },
    ];
    const recs = generateRecommendations(audits, refs);
    expect(recs).toHaveLength(1);
    expect(recs[0]?.audit).toBe('a');
  });

  it('should sort recommendations by impact (highest first)', () => {
    const audits: Record<string, AuditResult> = {
      a: makeAudit('a', 0),
      b: makeAudit('b', 0.5),
    };
    const refs: AuditRef[] = [
      { id: 'a', weight: 3 },
      { id: 'b', weight: 10 },
    ];
    const recs = generateRecommendations(audits, refs);
    expect(recs).toHaveLength(2);
    // b has higher impact: (1-0.5)*10 = 5, a has: (1-0)*3 = 3
    expect(recs[0]?.audit).toBe('b');
    expect(recs[1]?.audit).toBe('a');
  });

  it('should handle missing audits gracefully', () => {
    const audits: Record<string, AuditResult> = {};
    const refs: AuditRef[] = [{ id: 'missing', weight: 5 }];
    const recs = generateRecommendations(audits, refs);
    expect(recs).toHaveLength(0);
  });
});
