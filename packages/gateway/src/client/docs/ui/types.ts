import React from 'react';

export interface PublishedDoc {
  id: string;
  slug: string;
  title: string;
  mdxContent: string;
  description?: string;
  category?: string;
  publishedAt: string;
  version: number;
}

export interface Service {
  name: string;
  status: string;
  breakingChanges24h: number;
  errorRate24h: number;
}

export interface ServiceSummary {
  total: number;
  active: number;
  avgErrorPct: number;
  totalBreaking: number;
}

export type CompiledDocComponent = React.ComponentType | null;
