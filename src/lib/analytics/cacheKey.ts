import type { AdvancedAnalyticsRunRequest } from '@/types';

export function advancedAnalyticsRequestCacheKey(
  request: AdvancedAnalyticsRunRequest,
  dataVersion: string | null
) {
  const requestSignature = {
    startDate: request.startDate,
    endDate: request.endDate,
    metrics: request.metrics.map((metric) => ({
      id: metric.id,
      kind: metric.kind,
      base: metric.base,
      formula: metric.formula
    })),
    streaks: request.streaks.map((streak) => ({
      id: streak.id,
      metricId: streak.metricId,
      additionalMetricIds: streak.additionalMetricIds,
      period: streak.period,
      thresholdOperator: streak.thresholdOperator,
      thresholdValue: streak.thresholdValue
    })),
    charts: request.charts.map((chart) => ({
      id: chart.id,
      chartType: chart.chartType,
      metricIds: chart.metricIds,
      granularity: chart.granularity
    }))
  };

  return JSON.stringify({ request: requestSignature, dataVersion });
}
