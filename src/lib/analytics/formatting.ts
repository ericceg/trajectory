import type { AdvancedAnalyticsMetricDefinition, AdvancedAnalyticsMetricResult } from '@/types';

export function formatAnalyticsValue(value: number | null | undefined, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) {
    return 'n/a';
  }

  const normalizedUnit = (unit ?? '').trim().toLowerCase();
  if (normalizedUnit === 's' || normalizedUnit === 'sec' || normalizedUnit === 'seconds') {
    return formatSeconds(value);
  }

  if (normalizedUnit === '%') {
    return `${value.toFixed(1)}%`;
  }

  if (normalizedUnit === 'count') {
    return Math.round(value).toLocaleString();
  }

  if (normalizedUnit) {
    return `${value.toFixed(1)} ${unit}`;
  }

  return value.toFixed(2);
}

export function metricPreviewGranularity(metric: AdvancedAnalyticsMetricDefinition) {
  return metric.base?.defaultChartGranularity ?? 'week';
}

export function metricResultUnit(
  metric: AdvancedAnalyticsMetricDefinition | undefined,
  result: AdvancedAnalyticsMetricResult | undefined
) {
  return result?.unit ?? metric?.base?.displayUnit ?? metric?.formula?.displayUnit ?? null;
}

function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}
