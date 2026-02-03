export interface AXConfig {
  url: string;
  timeout?: number;
  categories?: string[];
  verbose?: boolean;
}

export interface AuditResult {
  id: string;
  title: string;
  description: string;
  score: number;
  weight: number;
  scoreDisplayMode: 'numeric' | 'binary' | 'informative';
  details?: AuditDetails;
}

export interface AuditDetails {
  type: 'table' | 'list' | 'text';
  items?: Array<Record<string, unknown>>;
  summary?: string;
}

export interface AXCategory {
  id: string;
  title: string;
  description: string;
  score: number;
  weight: number;
  auditRefs: AuditRef[];
}

export interface AuditRef {
  id: string;
  weight: number;
}

export interface AXReport {
  url: string;
  timestamp: string;
  version: string;
  score: number;
  categories: AXCategory[];
  audits: Record<string, AuditResult>;
  recommendations: Recommendation[];
}

export interface Recommendation {
  audit: string;
  message: string;
  impact: number;
}
