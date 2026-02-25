import type {
  AdvancedAnalyticsChartDefinition,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsStreakDefinition
} from '@/types';

export interface AdvancedAnalyticsValidationIssue {
  scope: 'metric' | 'streak' | 'chart' | 'global';
  id?: string;
  message: string;
}

export function validateAdvancedAnalyticsDefinitions(args: {
  metrics: AdvancedAnalyticsMetricDefinition[];
  streaks: AdvancedAnalyticsStreakDefinition[];
  charts: AdvancedAnalyticsChartDefinition[];
}): AdvancedAnalyticsValidationIssue[] {
  const { metrics, streaks, charts } = args;
  const issues: AdvancedAnalyticsValidationIssue[] = [];
  const metricIds = new Set<string>();

  for (const metric of metrics) {
    if (!metric.id || metricIds.has(metric.id)) {
      issues.push({ scope: 'metric', id: metric.id, message: 'Metric ID must be unique.' });
    }
    metricIds.add(metric.id);

    if (!metric.name.trim()) {
      issues.push({ scope: 'metric', id: metric.id, message: 'Metric name is required.' });
    }

    if (metric.kind === 'base' && !metric.base) {
      issues.push({ scope: 'metric', id: metric.id, message: 'Base metric config is missing.' });
    }

    if (metric.kind === 'formula') {
      if (!metric.formula) {
        issues.push({ scope: 'metric', id: metric.id, message: 'Formula metric config is missing.' });
      } else {
        if (!metric.formula.leftMetricId || !metric.formula.rightMetricId) {
          issues.push({
            scope: 'metric',
            id: metric.id,
            message: 'Formula metric must reference two metrics.'
          });
        }
      }
    }
  }

  for (const streak of streaks) {
    if (!streak.name.trim()) {
      issues.push({ scope: 'streak', id: streak.id, message: 'Streak name is required.' });
    }
    if (!streak.metricId) {
      issues.push({ scope: 'streak', id: streak.id, message: 'Streak metric is required.' });
    }
  }

  for (const chart of charts) {
    if (!chart.name.trim()) {
      issues.push({ scope: 'chart', id: chart.id, message: 'Chart name is required.' });
    }
    if ((chart.chartType === 'bar' || chart.chartType === 'line') && chart.metricIds.length !== 1) {
      issues.push({
        scope: 'chart',
        id: chart.id,
        message: 'Bar and line charts require exactly one metric.'
      });
    }
    if (chart.chartType === 'stackedBar' && (chart.metricIds.length < 2 || chart.metricIds.length > 5)) {
      issues.push({
        scope: 'chart',
        id: chart.id,
        message: 'Stacked bar charts require 2 to 5 metrics.'
      });
    }
  }

  return issues;
}
