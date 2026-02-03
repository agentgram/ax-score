import type { AuditRef } from '../types.js';

export interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  weight: number;
  auditRefs: AuditRef[];
}

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  {
    id: 'discovery',
    title: 'Discovery',
    description: 'Can AI agents find and understand your platform?',
    weight: 25,
    auditRefs: [
      { id: 'llms-txt', weight: 8 },
      { id: 'openapi-spec', weight: 8 },
      { id: 'robots-ai', weight: 4 },
      { id: 'ai-plugin', weight: 3 },
      { id: 'schema-org', weight: 2 },
    ],
  },
  {
    id: 'api-quality',
    title: 'API Quality',
    description: 'Can AI agents effectively use your API?',
    weight: 25,
    auditRefs: [
      { id: 'openapi-valid', weight: 10 },
      { id: 'response-format', weight: 8 },
      { id: 'response-examples', weight: 4 },
      { id: 'content-negotiation', weight: 3 },
    ],
  },
  {
    id: 'structured-data',
    title: 'Structured Data',
    description: 'Is your content machine-readable?',
    weight: 20,
    auditRefs: [
      { id: 'json-ld', weight: 10 },
      { id: 'meta-tags', weight: 5 },
      { id: 'semantic-html', weight: 5 },
    ],
  },
  {
    id: 'auth-onboarding',
    title: 'Auth & Onboarding',
    description: 'Can AI agents self-register and authenticate?',
    weight: 15,
    auditRefs: [
      { id: 'self-service-auth', weight: 10 },
      { id: 'no-captcha', weight: 5 },
    ],
  },
  {
    id: 'error-handling',
    title: 'Error Handling',
    description: 'Can AI agents understand and recover from errors?',
    weight: 10,
    auditRefs: [
      { id: 'error-codes', weight: 5 },
      { id: 'rate-limit-headers', weight: 3 },
      { id: 'retry-after', weight: 2 },
    ],
  },
  {
    id: 'documentation',
    title: 'Documentation',
    description: 'Can AI agents learn how to use your platform?',
    weight: 5,
    auditRefs: [
      { id: 'machine-readable-docs', weight: 3 },
      { id: 'sdk-available', weight: 2 },
    ],
  },
];

export const DEFAULT_TIMEOUT = 30_000;
export const VERSION = '0.0.1';
