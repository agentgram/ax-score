import { describe, it, expect } from 'vitest';
import { getMcpCategories, MCP_CATEGORIES } from '../mcp.js';

describe('MCP category configuration', () => {
  it('should define five categories with weights summing to 100', () => {
    expect(MCP_CATEGORIES).toHaveLength(5);
    const total = MCP_CATEGORIES.reduce((sum, cat) => sum + cat.weight, 0);
    expect(total).toBe(100);
  });

  it('should reference each audit exactly once with a positive weight', () => {
    const ids = MCP_CATEGORIES.flatMap((cat) => cat.auditRefs.map((ref) => ref.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(18);
    for (const cat of MCP_CATEGORIES) {
      for (const ref of cat.auditRefs) {
        expect(ref.weight).toBeGreaterThan(0);
        expect(ref.id.startsWith('mcp-')).toBe(true);
      }
    }
  });

  it('should return an independent copy from getMcpCategories', () => {
    const copy = getMcpCategories();
    copy[0]!.weight = 0;
    copy[0]!.auditRefs[0]!.weight = 0;

    expect(MCP_CATEGORIES[0]!.weight).toBeGreaterThan(0);
    expect(MCP_CATEGORIES[0]!.auditRefs[0]!.weight).toBeGreaterThan(0);
  });
});
