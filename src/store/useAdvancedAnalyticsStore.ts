import { format, subDays } from 'date-fns';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  AdvancedAnalyticsActivityCondition,
  AdvancedAnalyticsActivityConditionGroup,
  AdvancedAnalyticsBaseMetricDefinition,
  AdvancedAnalyticsBaseMeasure,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsSampleCondition,
  AdvancedAnalyticsSampleConditionGroup
} from '@/types';

export type AdvancedAnalyticsTimeRangePreset = 'all' | '30d' | '90d' | '365d' | 'custom';

interface AdvancedAnalyticsState {
  schemaVersion: number;
  metrics: AdvancedAnalyticsMetricDefinition[];
  timeRangePreset: AdvancedAnalyticsTimeRangePreset;
  customStartDate: string;
  customEndDate: string;
  autoRun: boolean;
  setTimeRangePreset: (preset: AdvancedAnalyticsTimeRangePreset) => void;
  setCustomStartDate: (value: string) => void;
  setCustomEndDate: (value: string) => void;
  setAutoRun: (value: boolean) => void;
  addMetric: (template?: 'activitiesCount' | 'sampleTime') => string;
  updateMetric: (id: string, updater: (metric: AdvancedAnalyticsMetricDefinition) => AdvancedAnalyticsMetricDefinition) => void;
  removeMetric: (id: string) => void;
}

const today = new Date();

const newId = (prefix: string) =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}_${crypto.randomUUID().slice(0, 8)}`
    : `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const normalizeMetricName = (index: number) => `Metric ${index + 1}`;

const defaultBaseMetric = (
  measure: AdvancedAnalyticsBaseMeasure
): AdvancedAnalyticsBaseMetricDefinition => ({
  measure,
  activityConditions: [],
  activityConditionGroups: [],
  sampleConditions: [],
  sampleConditionGroups: [],
  defaultChartGranularity: 'week' as const,
  displayUnit: ''
});

export const createBlankActivityCondition = (): AdvancedAnalyticsActivityCondition => ({
  id: newId('ac'),
  field: 'sportType',
  operator: 'contains',
  value: ''
});

export const createBlankActivityConditionGroup = (): AdvancedAnalyticsActivityConditionGroup => ({
  id: newId('ag'),
  conditions: [createBlankActivityCondition()]
});

export const createBlankSampleCondition = (): AdvancedAnalyticsSampleCondition => ({
  id: newId('sc'),
  field: 'heartRateZone',
  operator: 'is',
  zone: 2
});

export const createBlankSampleConditionGroup = (): AdvancedAnalyticsSampleConditionGroup => ({
  id: newId('sg'),
  conditions: [createBlankSampleCondition()]
});

const createMetric = (index: number, template: 'activitiesCount' | 'sampleTime'): AdvancedAnalyticsMetricDefinition => {
  const id = newId('metric');
  const base = defaultBaseMetric(template);

  if (template === 'sampleTime') {
    base.displayUnit = 'h';
    base.sampleConditionGroups = [createBlankSampleConditionGroup()];
  }

  return {
    id,
    name: normalizeMetricName(index),
    kind: 'base',
    showInView: true,
    base
  };
};

function migrateMetrics(rawMetrics: unknown): AdvancedAnalyticsMetricDefinition[] {
  if (!Array.isArray(rawMetrics)) {
    return [];
  }

  const migrated: AdvancedAnalyticsMetricDefinition[] = [];

  for (const item of rawMetrics) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const metric = item as AdvancedAnalyticsMetricDefinition;
    if (metric.kind !== 'base' || !metric.base) {
      continue;
    }

    const legacyActivityConditions = metric.base.activityConditions ?? [];
    const legacySampleConditions = metric.base.sampleConditions ?? [];

    const activityConditionGroups =
      metric.base.activityConditionGroups && metric.base.activityConditionGroups.length > 0
        ? metric.base.activityConditionGroups
        : legacyActivityConditions.length > 0
          ? [
              {
                id: newId('ag'),
                conditions: legacyActivityConditions
              }
            ]
          : [];

    const sampleConditionGroups =
      metric.base.sampleConditionGroups && metric.base.sampleConditionGroups.length > 0
        ? metric.base.sampleConditionGroups
        : legacySampleConditions.length > 0
          ? [
              {
                id: newId('sg'),
                conditions: legacySampleConditions
              }
            ]
          : [];

    migrated.push({
      ...metric,
      kind: 'base',
      formula: undefined,
      base: {
        ...defaultBaseMetric(metric.base.measure ?? 'activitiesCount'),
        ...metric.base,
        activityConditions: legacyActivityConditions,
        sampleConditions: legacySampleConditions,
        activityConditionGroups,
        sampleConditionGroups
      }
    });
  }

  return migrated;
}

export const useAdvancedAnalyticsStore = create<AdvancedAnalyticsState>()(
  persist(
    (set) => ({
      schemaVersion: 2,
      metrics: [],
      timeRangePreset: '90d',
      customStartDate: format(subDays(today, 30), 'yyyy-MM-dd'),
      customEndDate: format(today, 'yyyy-MM-dd'),
      autoRun: true,
      setTimeRangePreset: (preset) => set({ timeRangePreset: preset }),
      setCustomStartDate: (value) => set({ customStartDate: value }),
      setCustomEndDate: (value) => set({ customEndDate: value }),
      setAutoRun: (value) => set({ autoRun: value }),
      addMetric: (template = 'activitiesCount') => {
        let createdMetricId = '';
        set((state) => {
          const metric = createMetric(state.metrics.length, template);
          createdMetricId = metric.id;
          return { metrics: [...state.metrics, metric] };
        });
        return createdMetricId;
      },
      updateMetric: (id, updater) =>
        set((state) => ({
          metrics: state.metrics.map((metric) => (metric.id === id ? updater(metric) : metric))
        })),
      removeMetric: (id) =>
        set((state) => ({
          metrics: state.metrics.filter((metric) => metric.id !== id)
        }))
    }),
    {
      name: 'trajectory-advanced-analytics',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<AdvancedAnalyticsState> & {
          metrics?: unknown;
          timeRangePreset?: AdvancedAnalyticsTimeRangePreset;
          customStartDate?: string;
          customEndDate?: string;
          autoRun?: boolean;
        };

        return {
          schemaVersion: 2,
          metrics: migrateMetrics(state.metrics),
          timeRangePreset: state.timeRangePreset ?? '90d',
          customStartDate: state.customStartDate ?? format(subDays(today, 30), 'yyyy-MM-dd'),
          customEndDate: state.customEndDate ?? format(today, 'yyyy-MM-dd'),
          autoRun: state.autoRun ?? true
        };
      },
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        metrics: state.metrics,
        timeRangePreset: state.timeRangePreset,
        customStartDate: state.customStartDate,
        customEndDate: state.customEndDate,
        autoRun: state.autoRun
      })
    }
  )
);
