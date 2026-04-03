import type { AlertSeverity, RiskCategory } from '../types/api';

export const formatDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) {
    return 'Not available';
  }

  const fallbackOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };

  return new Intl.DateTimeFormat('en-IN', options ?? fallbackOptions).format(new Date(value));
};

export const formatCompactDate = (value?: string | null) =>
  formatDate(value, { month: 'short', day: 'numeric' });

export const formatNumber = (value?: number | null, fractionDigits = 1) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Not available';
  }

  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: fractionDigits,
  }).format(value);
};

export const sentenceCase = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export const riskTone = (value?: AlertSeverity | RiskCategory | 'unknown') => {
  switch (value) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
      return 'moderate';
    case 'low':
      return 'low';
    default:
      return 'neutral';
  }
};

export const toActionList = (
  value?: string[] | Record<string, unknown> | null,
): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  return Object.values(value).map(String);
};
