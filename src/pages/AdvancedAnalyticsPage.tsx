import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis
} from 'recharts';

import { MetricEditorSheet } from '@/components/analytics/MetricEditorSheet';
import { formatAnalyticsValue, metricPreviewGranularity, metricResultUnit } from '@/lib/analytics/formatting';
import { runAdvancedAnalytics } from '@/lib/tauri';
import { formatDuration } from '@/lib/format';
import { useAdvancedAnalyticsStore } from '@/store/useAdvancedAnalyticsStore';
import { useAppStore } from '@/store/useAppStore';
import type {
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsMetricResult,
  AdvancedAnalyticsRunRequest,
  AdvancedAnalyticsRunResponse
} from '@/types';

type AddMetricTemplate = 'activitiesCount' | 'sampleTime';

function resolveTimeRange(
  preset: 'all' | '30d' | '90d' | '365d' | 'custom',
  customStartDate: string,
  customEndDate: string
) {
  const today = new Date();
  if (preset === 'all') {
    return { startDate: undefined, endDate: undefined };
  }
  if (preset === 'custom') {
    return {
      startDate: customStartDate || undefined,
      endDate: customEndDate || undefined
    };
  }

  const days = preset === '30d' ? 29 : preset === '90d' ? 89 : 364;
  return {
    startDate: format(subDays(today, days), 'yyyy-MM-dd'),
    endDate: format(today, 'yyyy-MM-dd')
  };
}

function formatDateBucketLabel(label: string): string {
  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (dayMatch) {
    return `${dayMatch[3]}.${dayMatch[2]}.${dayMatch[1]}`;
  }

  const monthMatch = /^(\d{4})-(\d{2})/.exec(label);
  if (monthMatch) {
    return `01.${monthMatch[2]}.${monthMatch[1]}`;
  }

  return label;
}

function formatTooltipValue(value: number, unit?: string | null): string {
  const normalizedUnit = (unit ?? '').trim().toLowerCase();
  if (normalizedUnit === 's' || normalizedUnit === 'sec' || normalizedUnit === 'seconds') {
    return formatDuration(value);
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function MetricTooltip({
  active,
  label,
  payload,
  unit
}: TooltipProps<number, string> & { unit?: string | null }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const value = payload[0].value;
  const numericValue = typeof value === 'number' ? value : Number(value);

  return (
    <div className="rounded-md border border-border bg-panel p-2 text-xs text-foreground shadow-lg">
      <p className="font-medium">{formatDateBucketLabel(String(label ?? ''))}</p>
      <p className="mt-1">
        {Number.isFinite(numericValue) ? formatTooltipValue(numericValue, unit) : 'n/a'}
        {unit && !['s', 'sec', 'seconds'].includes(unit.toLowerCase()) ? ` ${unit}` : ''}
      </p>
    </div>
  );
}

function MetricResultCard({
  metric,
  result,
  onEdit,
  onDelete
}: {
  metric: AdvancedAnalyticsMetricDefinition;
  result?: AdvancedAnalyticsMetricResult;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const granularity = metricPreviewGranularity(metric);
  const points =
    granularity === 'day'
      ? result?.seriesByGranularity.day ?? []
      : granularity === 'week'
        ? result?.seriesByGranularity.week ?? []
        : result?.seriesByGranularity.month ?? [];

  const unit = metricResultUnit(metric, result);
  const chartRows = points
    .map((point) => ({
      key: point.key,
      value: point.value
    }))
    .filter((point) => point.value !== null && point.value !== undefined);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{metric.name || 'Untitled metric'}</h3>
          <p className="text-xs text-muted">{granularity} plot</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="text-3xl font-semibold text-foreground">{formatAnalyticsValue(result?.scalarValue, unit)}</p>

      {chartRows.length > 0 ? (
        <div className="h-56 rounded-lg border border-border bg-bg/25 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <CartesianGrid stroke="rgb(var(--color-border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="key"
                tickFormatter={formatDateBucketLabel}
                stroke="rgb(var(--color-border))"
                tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                tickMargin={8}
                minTickGap={24}
              />
              <YAxis
                stroke="rgb(var(--color-border))"
                tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                tickMargin={8}
                width={56}
              />
              <Tooltip content={<MetricTooltip unit={unit} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgb(var(--color-accent))"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-muted">No points in the selected range.</p>
      )}

      {result?.errors && result.errors.length > 0 ? (
        <div className="rounded-md border border-accent/40 bg-accent/10 p-2 text-xs text-accent">
          {result.errors.join(' ')}
        </div>
      ) : null}

      {result?.warnings && result.warnings.length > 0 ? (
        <div className="rounded-md border border-border bg-bg/30 p-2 text-xs text-muted">
          {result.warnings.join(' ')}
        </div>
      ) : null}
    </section>
  );
}

export function AdvancedAnalyticsPage() {
  const settings = useAppStore((state) => state.settings);
  const metrics = useAdvancedAnalyticsStore((state) => state.metrics);
  const timeRangePreset = useAdvancedAnalyticsStore((state) => state.timeRangePreset);
  const customStartDate = useAdvancedAnalyticsStore((state) => state.customStartDate);
  const customEndDate = useAdvancedAnalyticsStore((state) => state.customEndDate);
  const autoRun = useAdvancedAnalyticsStore((state) => state.autoRun);
  const setTimeRangePreset = useAdvancedAnalyticsStore((state) => state.setTimeRangePreset);
  const setCustomStartDate = useAdvancedAnalyticsStore((state) => state.setCustomStartDate);
  const setCustomEndDate = useAdvancedAnalyticsStore((state) => state.setCustomEndDate);
  const setAutoRun = useAdvancedAnalyticsStore((state) => state.setAutoRun);
  const addMetric = useAdvancedAnalyticsStore((state) => state.addMetric);
  const updateMetric = useAdvancedAnalyticsStore((state) => state.updateMetric);
  const removeMetric = useAdvancedAnalyticsStore((state) => state.removeMetric);

  const [response, setResponse] = useState<AdvancedAnalyticsRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const resolvedRange = useMemo(
    () => resolveTimeRange(timeRangePreset, customStartDate, customEndDate),
    [customEndDate, customStartDate, timeRangePreset]
  );

  const request = useMemo<AdvancedAnalyticsRunRequest>(
    () => ({
      startDate: resolvedRange.startDate,
      endDate: resolvedRange.endDate,
      metrics,
      streaks: [],
      charts: []
    }),
    [metrics, resolvedRange.endDate, resolvedRange.startDate]
  );

  const requestKey = useMemo(() => JSON.stringify(request), [request]);

  const runNow = async (payload: AdvancedAnalyticsRunRequest) => {
    setLoading(true);
    setRunError(null);
    try {
      const next = await runAdvancedAnalytics(payload);
      setResponse(next);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!autoRun) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setRunError(null);
      try {
        const next = await runAdvancedAnalytics(request);
        if (!cancelled) {
          setResponse(next);
        }
      } catch (error) {
        if (!cancelled) {
          setRunError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [autoRun, request, requestKey]);

  const editingMetric = editingMetricId
    ? metrics.find((metric) => metric.id === editingMetricId)
    : undefined;

  const addMetricAndEdit = (template: AddMetricTemplate) => {
    const id = addMetric(template);
    setEditingMetricId(id);
    setAddMenuOpen(false);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Analytics</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">Advanced Analytics</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Build simple custom metrics with AND/OR rule groups, then view results directly.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-panel p-4">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_auto_auto_auto_auto_auto_1fr] lg:items-end">
            <label className="space-y-1 text-sm">
              <span className="text-muted">Time range</span>
              <select
                value={timeRangePreset}
                onChange={(event) =>
                  setTimeRangePreset(event.target.value as 'all' | '30d' | '90d' | '365d' | 'custom')
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2"
              >
                <option value="all">All</option>
                <option value="30d">30d</option>
                <option value="90d">90d</option>
                <option value="365d">365d</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted">Start</span>
              <input
                type="date"
                value={customStartDate}
                disabled={timeRangePreset !== 'custom'}
                onChange={(event) => setCustomStartDate(event.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 disabled:opacity-50"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted">End</span>
              <input
                type="date"
                value={customEndDate}
                disabled={timeRangePreset !== 'custom'}
                onChange={(event) => setCustomEndDate(event.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 disabled:opacity-50"
              />
            </label>

            <label className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(event) => setAutoRun(event.target.checked)}
              />
              Auto-run
            </label>

            <button
              type="button"
              onClick={() => {
                void runNow(request);
              }}
              className="rounded-md border border-border bg-bg px-4 py-2 text-sm font-medium text-foreground"
            >
              Recompute
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((current) => !current)}
                className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
              >
                Add metric
              </button>
              {addMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-border bg-panel p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => addMetricAndEdit('activitiesCount')}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-bg"
                  >
                    Activity metric (count/sum)
                  </button>
                  <button
                    type="button"
                    onClick={() => addMetricAndEdit('sampleTime')}
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-bg"
                  >
                    Sample-time metric (time while ...)
                  </button>
                </div>
              ) : null}
            </div>

            <div className="text-xs text-muted lg:text-right">
              HR zones from Settings:
              <span className="ml-1 font-medium text-foreground">
                {(settings?.heartRateZoneUpperBoundsBpm ?? [120, 140, 160, 180]).join(' / ')} bpm
              </span>
            </div>
          </div>
        </section>
      </header>

      {loading ? <p className="text-sm text-muted">Recomputing analytics...</p> : null}
      {runError ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          {runError}
        </div>
      ) : null}
      {response?.globalWarnings && response.globalWarnings.length > 0 ? (
        <div className="rounded-lg border border-border bg-bg/30 p-3 text-sm text-muted">
          {response.globalWarnings.join(' ')}
        </div>
      ) : null}

      {metrics.length === 0 ? (
        <section className="rounded-xl border border-border bg-panel p-6">
          <h3 className="text-lg font-semibold text-foreground">No metrics yet</h3>
          <p className="mt-2 text-sm text-muted">
            Click <span className="font-medium text-foreground">Add metric</span> to create your first custom metric.
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {metrics.map((metric) => (
            <MetricResultCard
              key={metric.id}
              metric={metric}
              result={response?.metricResults?.[metric.id]}
              onEdit={() => setEditingMetricId(metric.id)}
              onDelete={() => removeMetric(metric.id)}
            />
          ))}
        </div>
      )}

      {editingMetric ? (
        <MetricEditorSheet
          metric={editingMetric}
          onChange={(nextMetric) => updateMetric(nextMetric.id, () => nextMetric)}
          onDelete={() => {
            removeMetric(editingMetric.id);
            setEditingMetricId(null);
          }}
          onClose={() => setEditingMetricId(null)}
        />
      ) : null}
    </div>
  );
}
