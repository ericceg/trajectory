import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Rectangle,
  ReferenceArea,
  ResponsiveContainer,
  type TooltipProps,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { formatAnalyticsValue, metricPreviewGranularity, metricResultUnit } from '@/lib/analytics/formatting';
import { normalizeAdvancedAnalyticsTimeRange } from '@/lib/analytics/timeRange';
import { TimeRangeControl } from '@/components/analytics/TimeRangeControl';
import {
  CHART_IS_ANIMATION_ACTIVE,
  CHART_LINE_ACTIVE_DOT,
  CHART_LINE_STROKE_WIDTH,
  CHART_SELECTION_FILL,
  CHART_SELECTION_FILL_OPACITY,
  CHART_SELECTION_STROKE,
  CHART_SELECTION_STROKE_OPACITY,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CURSOR_LINE,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_WRAPPER_STYLE,
  isValueInDomain,
  parseStringChartLabel,
  usePlotDragZoom
} from '@/lib/charts/plottingEngine';
import { formatDuration } from '@/lib/format';
import type { AdvancedAnalyticsSelection } from '@/store/useAdvancedAnalyticsStore';
import type {
  AdvancedAnalyticsChartDefinition,
  AdvancedAnalyticsChartResult,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsMetricResult,
  AdvancedAnalyticsRunResponse,
  AdvancedAnalyticsSampleTimeActivityPreview,
  AdvancedAnalyticsStreakDefinition,
  AdvancedAnalyticsStreakResult,
  AdvancedAnalyticsTimeRangeConfig
} from '@/types';

const CHART_COLORS = ['#2563eb', '#dc2626', '#10b981', '#f59e0b', '#7c3aed'];
const SAMPLE_TIME_PREVIEW_PAGE_SIZE = 6;
type ChartRow = { key: string; label: string } & Record<string, string | number | null>;
const compareBucketKeys = (left: string, right: string) => left.localeCompare(right);

interface AnalyticsPreviewProps {
  selectedItem: AdvancedAnalyticsSelection;
  metrics: AdvancedAnalyticsMetricDefinition[];
  streaks: AdvancedAnalyticsStreakDefinition[];
  charts: AdvancedAnalyticsChartDefinition[];
  mode?: 'selected' | 'overview';
  overviewMetricIds?: string[];
  response: AdvancedAnalyticsRunResponse | null;
  overviewMetricResultsById?: Record<string, AdvancedAnalyticsMetricResult | undefined>;
  overviewStreakResultsById?: Record<string, AdvancedAnalyticsStreakResult | undefined>;
  overviewChartResultsById?: Record<string, AdvancedAnalyticsChartResult | undefined>;
  onMetricTimeRangeChange?: (metricId: string, timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
  onStreakTimeRangeChange?: (streakId: string, timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
  onChartTimeRangeChange?: (chartId: string, timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
  loading: boolean;
  error: string | null;
}

function timeRangeIndicator(range: AdvancedAnalyticsTimeRangeConfig | undefined): string {
  const normalized = normalizeAdvancedAnalyticsTimeRange(range);
  if (normalized.preset === 'custom') {
    if (normalized.customStartDate && normalized.customEndDate) {
      return `${normalized.customStartDate} -> ${normalized.customEndDate}`;
    }
    if (normalized.customStartDate) {
      return `from ${normalized.customStartDate}`;
    }
    if (normalized.customEndDate) {
      return `until ${normalized.customEndDate}`;
    }
    return 'custom';
  }
  return normalized.preset;
}

function trimOuterEmptyBuckets<T>(rows: T[], hasData: (row: T) => boolean): T[] {
  let first = -1;
  let last = -1;

  for (let index = 0; index < rows.length; index += 1) {
    if (!hasData(rows[index])) {
      continue;
    }
    if (first === -1) {
      first = index;
    }
    last = index;
  }

  if (first === -1 || last === -1) {
    return rows;
  }

  return rows.slice(first, last + 1);
}

function useZoomableRows<T extends { key: string }>(rows: T[]) {
  const keyValues = useMemo(() => rows.map((row) => row.key), [rows]);
  const plotZoom = usePlotDragZoom<string>({
    parseLabel: parseStringChartLabel,
    compareValues: compareBucketKeys,
    values: keyValues
  });
  const activeZoomDomain = plotZoom.zoomDomain;
  const visibleRows = useMemo(
    () =>
      activeZoomDomain
        ? rows.filter((row) => isValueInDomain(row.key, activeZoomDomain, compareBucketKeys))
        : rows,
    [activeZoomDomain, rows]
  );

  return {
    visibleRows,
    selectionDomain: plotZoom.selectionDomain,
    isZoomed: plotZoom.isZoomed,
    onMouseDown: plotZoom.onMouseDown,
    onMouseMove: plotZoom.onMouseMove,
    onMouseUp: plotZoom.onMouseUp,
    onMouseLeave: plotZoom.onMouseLeave
  };
}

function NoticeList({ title, items, tone = 'muted' }: { title: string; items: string[]; tone?: 'muted' | 'error' }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        tone === 'error'
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-bg/40 text-muted'
      }`}
    >
      <p className="mb-1 text-xs uppercase tracking-[0.12em]">{title}</p>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatTooltipNumber(value: number) {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatDateBucketLabel(label: unknown): string {
  if (typeof label !== 'string') {
    return String(label ?? '');
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (dayMatch) {
    return `${dayMatch[3]}.${dayMatch[2]}.${dayMatch[1]}`;
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(label);
  if (monthMatch) {
    return `01.${monthMatch[2]}.${monthMatch[1]}`;
  }

  return label;
}

function formatTooltipMetricValue(value: number, unit?: string): string {
  const normalizedUnit = (unit ?? '').trim().toLowerCase();
  if (normalizedUnit === 's' || normalizedUnit === 'sec' || normalizedUnit === 'seconds') {
    return formatDuration(value);
  }

  return formatTooltipNumber(value);
}

function AnalyticsChartTooltip({
  active,
  label,
  payload,
  unitsByKey
}: TooltipProps<number, string> & { unitsByKey?: Record<string, string> }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const firstPayload = payload[0] as { payload?: { label?: unknown } };
  const rawLabel = firstPayload?.payload?.label ?? label;
  const labelText = formatDateBucketLabel(rawLabel);

  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[13rem] p-3 text-sm leading-tight">
      <p className="font-semibold text-foreground">{labelText}</p>
      <div className="mt-2 space-y-1 text-foreground">
        {payload.map((entry) => {
          const seriesKey = String(entry.dataKey ?? '');
          const numericValue = typeof entry.value === 'number' ? entry.value : Number(entry.value);
          const valueLabel = Number.isFinite(numericValue)
            ? formatTooltipMetricValue(numericValue, unitsByKey?.[seriesKey])
            : String(entry.value ?? 'n/a');
          const unit = unitsByKey?.[seriesKey];
          const normalizedUnit = (unit ?? '').trim().toLowerCase();
          const renderUnit = Boolean(unit) && normalizedUnit !== 's' && normalizedUnit !== 'sec' && normalizedUnit !== 'seconds';

          return (
            <p key={`${seriesKey}-${entry.name ?? 'value'}`}>
              <span className="font-medium">{entry.name ?? seriesKey}</span>:{' '}
              <span className="font-semibold">{valueLabel}</span>
              {renderUnit ? ` ${unit}` : ''}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function MetricPreview({
  metric,
  result,
  showChart = true,
  showSamplePreview = true,
  onTimeRangeChange
}: {
  metric: AdvancedAnalyticsMetricDefinition;
  result?: AdvancedAnalyticsMetricResult;
  showChart?: boolean;
  showSamplePreview?: boolean;
  onTimeRangeChange?: (timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
}) {
  const granularity = metricPreviewGranularity(metric);
  const points =
    granularity === 'day'
      ? result?.seriesByGranularity.day ?? []
      : granularity === 'week'
        ? result?.seriesByGranularity.week ?? []
        : result?.seriesByGranularity.month ?? [];
  const chartPoints = trimOuterEmptyBuckets(points, (point) => {
    if (point.value === null || point.value === undefined) {
      return false;
    }
    return Math.abs(point.value) > 1e-9;
  });
  const unit = metricResultUnit(metric, result);
  const rows = chartPoints.map((point) => ({ key: point.key, label: point.label, value: point.value }));
  const zoom = useZoomableRows(rows);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Metric Result</p>
        <h3 className="mt-1 text-xl font-semibold text-foreground">{metric.name || 'Untitled metric'}</h3>
        {onTimeRangeChange ? (
          <div className="mt-3">
            <TimeRangeControl
              value={metric.timeRange}
              onChange={onTimeRangeChange}
              compact
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Range: {timeRangeIndicator(metric.timeRange)}</p>
        )}
        <p className="mt-3 text-3xl font-semibold text-foreground">
          {formatAnalyticsValue(result?.scalarValue, unit)}
        </p>
        {showChart ? <p className="mt-1 text-xs text-muted">Preview granularity: {granularity}</p> : null}
      </div>

      {showChart && chartPoints.length > 0 ? (
        <div className="space-y-2">
          <div className="h-72 rounded-lg border border-border/80 bg-bg/30 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={zoom.visibleRows}
                onMouseDown={zoom.onMouseDown}
                onMouseMove={zoom.onMouseMove}
                onMouseUp={zoom.onMouseUp}
                onMouseLeave={zoom.onMouseLeave}
              >
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="key"
                  stroke={CHART_AXIS_STROKE}
                  tickFormatter={formatDateBucketLabel}
                  tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  stroke={CHART_AXIS_STROKE}
                  tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                  tickMargin={8}
                  width={58}
                />
                <Tooltip
                  cursor={CHART_TOOLTIP_CURSOR_LINE}
                  content={<AnalyticsChartTooltip unitsByKey={{ value: unit ?? '' }} />}
                  wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                  isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                />
                {zoom.selectionDomain ? (
                  <ReferenceArea
                    x1={zoom.selectionDomain[0]}
                    x2={zoom.selectionDomain[1]}
                    fill={CHART_SELECTION_FILL}
                    fillOpacity={CHART_SELECTION_FILL_OPACITY}
                    stroke={CHART_SELECTION_STROKE}
                    strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="rgb(var(--color-accent))"
                  strokeWidth={CHART_LINE_STROKE_WIDTH}
                  dot={false}
                  connectNulls
                  activeDot={CHART_LINE_ACTIVE_DOT}
                  isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">
            Drag to zoom the x-axis. Click once to reset.
            {zoom.isZoomed ? ' Showing a zoomed range.' : ''}
          </p>
        </div>
      ) : showChart ? (
        <p className="text-sm text-muted">No series points for this metric in the selected range.</p>
      ) : null}

      <NoticeList title="Metric Errors" items={result?.errors ?? []} tone="error" />
      <NoticeList title="Metric Warnings" items={result?.warnings ?? []} />
      {showSamplePreview &&
      metric.kind === 'base' &&
      metric.base?.measure === 'sampleTime' &&
      result?.sampleTimePreview ? (
        <SampleTimeActivityPreview preview={result.sampleTimePreview} />
      ) : null}
    </div>
  );
}

function SampleTimeActivityPreview({
  preview
}: {
  preview: NonNullable<AdvancedAnalyticsMetricResult['sampleTimePreview']>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [visibleCount, setVisibleCount] = useState(SAMPLE_TIME_PREVIEW_PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(SAMPLE_TIME_PREVIEW_PAGE_SIZE);
  }, [preview]);

  const hasActivities = preview.activities.length > 0;
  const visibleActivities = preview.activities.slice(0, visibleCount);
  const hasMore = visibleCount < preview.activities.length;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Sample Time Activity Preview</p>
        <p className="text-sm text-muted">
          Considered activities: {preview.consideredActivityCount}. Showing {preview.sampledActivityCount}
          {preview.minimumContinuousMatchSeconds > 0
            ? ` with minimum contiguous match ${formatDuration(preview.minimumContinuousMatchSeconds)}.`
            : ' (no minimum contiguous match threshold).'}
        </p>
      </div>

      {hasActivities ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              Included
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
              Filtered out (below minimum)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-border" />
              Tracked activity timeline
            </div>
          </div>

          {visibleActivities.map((activity) => (
            <SampleTimeActivityRow
              key={activity.activityId}
              activity={activity}
              onOpen={() =>
                navigate(`/activities/${activity.activityId}`, {
                  state: {
                    fromPath: location.pathname,
                    fromLabel: 'Back to Events Analytics'
                  }
                })
              }
            />
          ))}
          {preview.activities.length > SAMPLE_TIME_PREVIEW_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted">
                Showing {Math.min(visibleCount, preview.activities.length)} of {preview.activities.length} activities.
              </p>
              <div className="flex items-center gap-2">
                {visibleCount > SAMPLE_TIME_PREVIEW_PAGE_SIZE ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(SAMPLE_TIME_PREVIEW_PAGE_SIZE)}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-bg hover:text-foreground"
                  >
                    Show less
                  </button>
                ) : null}
                {hasMore ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setVisibleCount(preview.activities.length)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-bg"
                    >
                      Show all
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCount((current) => current + SAMPLE_TIME_PREVIEW_PAGE_SIZE)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-bg"
                    >
                      Show more
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">No activities matched for sample-time preview.</p>
      )}
    </section>
  );
}

function SampleTimeActivityRow({
  activity,
  onOpen
}: {
  activity: AdvancedAnalyticsSampleTimeActivityPreview;
  onOpen: () => void;
}) {
  const total = activity.totalTrackedSeconds;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full space-y-1.5 rounded-lg border border-border bg-bg/30 p-3 text-left transition-colors hover:border-accent/40 hover:bg-bg/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      aria-label={`Open activity details for ${activity.activityTitle || 'untitled activity'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{activity.activityTitle || 'Untitled activity'}</p>
        <p className="text-xs text-muted">{activity.activityStart.replace('T', ' ').replace('Z', '')}</p>
      </div>
      <p className="text-xs text-muted">
        Included {formatDuration(activity.includedSeconds)} · Filtered {formatDuration(activity.filteredOutSeconds)} ·
        Tracked {formatDuration(activity.totalTrackedSeconds)}
      </p>

      <div className="relative h-3 overflow-hidden rounded bg-border/80">
        {total > 0
          ? activity.segments.map((segment, index) => {
              const leftPercent = Math.max(0, Math.min(100, (segment.startElapsedSeconds / total) * 100));
              const widthPercent = Math.max(
                0.8,
                Math.min(100 - leftPercent, (segment.durationSeconds / total) * 100)
              );
              return (
                <div
                  key={`${activity.activityId}-${index}`}
                  className={`absolute top-0 h-full ${
                    segment.status === 'included' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                  title={`${segment.status === 'included' ? 'Included' : 'Filtered out'}: ${formatDuration(
                    segment.durationSeconds
                  )}`}
                />
              );
            })
          : null}
      </div>
    </button>
  );
}

function StreakPreview({
  streak,
  result,
  onTimeRangeChange
}: {
  streak: AdvancedAnalyticsStreakDefinition;
  result?: AdvancedAnalyticsStreakResult;
  onTimeRangeChange?: (timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Streak Result</p>
        <h3 className="mt-1 text-xl font-semibold text-foreground">{streak.name || 'Untitled streak'}</h3>
        {onTimeRangeChange ? (
          <div className="mt-3">
            <TimeRangeControl
              value={streak.timeRange}
              onChange={onTimeRangeChange}
              compact
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Range: {timeRangeIndicator(streak.timeRange)}</p>
        )}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg/30 p-3">
            <p className="text-xs text-muted">Current streak</p>
            <p className="text-2xl font-semibold text-foreground">{result?.count ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg/30 p-3">
            <p className="text-xs text-muted">Status</p>
            <p className="text-lg font-semibold capitalize text-foreground">{result?.status ?? 'n/a'}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg/30 p-3">
            <p className="text-xs text-muted">Current period value</p>
            <p className="text-lg font-semibold text-foreground">
              {result ? result.currentPeriodValue.toFixed(2) : 'n/a'}
            </p>
            <p className="text-xs text-muted">{result?.currentPeriodKey ?? 'n/a'}</p>
          </div>
        </div>
      </div>
      <NoticeList title="Streak Errors" items={result?.errors ?? []} tone="error" />
      <NoticeList title="Streak Warnings" items={result?.warnings ?? []} />
    </div>
  );
}

function ChartPreview({
  chart,
  result,
  metricsById,
  metricResults,
  onTimeRangeChange
}: {
  chart: AdvancedAnalyticsChartDefinition;
  result?: AdvancedAnalyticsChartResult;
  metricsById: Map<string, AdvancedAnalyticsMetricDefinition>;
  metricResults: Record<string, AdvancedAnalyticsMetricResult | undefined>;
  onTimeRangeChange?: (timeRange: AdvancedAnalyticsTimeRangeConfig) => void;
}) {
  const rows: ChartRow[] = (result?.points ?? []).map((point) => ({
    key: point.key,
    label: point.label,
    ...point.values
  }));
  const visibleRows = trimOuterEmptyBuckets(rows, (row) => {
    if (chart.chartType === 'bar' || chart.chartType === 'stackedBar') {
      return chart.metricIds.some((metricId) => {
        const value = row[metricId];
        return typeof value === 'number' && Math.abs(value) > 1e-9;
      });
    }

    return chart.metricIds.some((metricId) => row[metricId] !== null && row[metricId] !== undefined);
  });
  const zoom = useZoomableRows(visibleRows);
  const chartUnitsByMetricId = useMemo(
    () =>
      Object.fromEntries(
        chart.metricIds.map((metricId) => [
          metricId,
          metricResultUnit(metricsById.get(metricId), metricResults[metricId]) ?? ''
        ])
      ),
    [chart.metricIds, metricResults, metricsById]
  );
  const stackedTopMetricIdByRowKey = useMemo(() => {
    if (chart.chartType !== 'stackedBar') {
      return new Map<string, string>();
    }

    const topByKey = new Map<string, string>();
    for (const row of zoom.visibleRows) {
      for (let index = chart.metricIds.length - 1; index >= 0; index -= 1) {
        const metricId = chart.metricIds[index];
        const value = row[metricId];
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) <= 1e-9) {
          continue;
        }
        topByKey.set(row.key, metricId);
        break;
      }
    }

    return topByKey;
  }, [chart.chartType, chart.metricIds, zoom.visibleRows]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Chart View</p>
        <h3 className="text-xl font-semibold text-foreground">{chart.name || 'Untitled chart'}</h3>
        {onTimeRangeChange ? (
          <div className="mt-3">
            <TimeRangeControl
              value={chart.timeRange}
              onChange={onTimeRangeChange}
              compact
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Range: {timeRangeIndicator(chart.timeRange)}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded-full border border-border bg-bg/40 px-2 py-0.5">
            {chart.chartType}
          </span>
          <span className="rounded-full border border-border bg-bg/40 px-2 py-0.5">
            {chart.granularity}
          </span>
          <span className="rounded-full border border-border bg-bg/40 px-2 py-0.5">
            {chart.metricIds.length} metric{chart.metricIds.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {visibleRows.length > 0 ? (
        <div className="space-y-2">
          <div className="h-64 rounded-lg border border-border/80 bg-bg/30 p-2.5">
            <ResponsiveContainer width="100%" height="100%">
              {chart.chartType === 'line' ? (
                <LineChart
                  data={zoom.visibleRows}
                  onMouseDown={zoom.onMouseDown}
                  onMouseMove={zoom.onMouseMove}
                  onMouseUp={zoom.onMouseUp}
                  onMouseLeave={zoom.onMouseLeave}
                >
                  <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    stroke={CHART_AXIS_STROKE}
                    tickFormatter={formatDateBucketLabel}
                    tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                    tickMargin={8}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={CHART_AXIS_STROKE}
                    tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                    tickMargin={8}
                    width={58}
                  />
                  <Tooltip
                    cursor={CHART_TOOLTIP_CURSOR_LINE}
                    content={<AnalyticsChartTooltip unitsByKey={chartUnitsByMetricId} />}
                    wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                    isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                  />
                  {zoom.selectionDomain ? (
                    <ReferenceArea
                      x1={zoom.selectionDomain[0]}
                      x2={zoom.selectionDomain[1]}
                      fill={CHART_SELECTION_FILL}
                      fillOpacity={CHART_SELECTION_FILL_OPACITY}
                      stroke={CHART_SELECTION_STROKE}
                      strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                    />
                  ) : null}
                  {chart.metricIds.length > 1 ? (
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, lineHeight: '20px', paddingBottom: 4 }}
                    />
                  ) : null}
                  {chart.metricIds.slice(0, 1).map((metricId, index) => (
                    <Line
                      key={metricId}
                      type="monotone"
                      dataKey={metricId}
                      name={metricsById.get(metricId)?.name ?? metricId}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={CHART_LINE_STROKE_WIDTH}
                      dot={false}
                      connectNulls
                      activeDot={CHART_LINE_ACTIVE_DOT}
                      isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                    />
                  ))}
                </LineChart>
              ) : (
                <BarChart
                  data={zoom.visibleRows}
                  onMouseDown={zoom.onMouseDown}
                  onMouseMove={zoom.onMouseMove}
                  onMouseUp={zoom.onMouseUp}
                  onMouseLeave={zoom.onMouseLeave}
                >
                  <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="key"
                    stroke={CHART_AXIS_STROKE}
                    tickFormatter={formatDateBucketLabel}
                    tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                    tickMargin={8}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={CHART_AXIS_STROKE}
                    tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }}
                    tickMargin={8}
                    width={58}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    content={<AnalyticsChartTooltip unitsByKey={chartUnitsByMetricId} />}
                    wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                    isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                  />
                  {zoom.selectionDomain ? (
                    <ReferenceArea
                      x1={zoom.selectionDomain[0]}
                      x2={zoom.selectionDomain[1]}
                      fill={CHART_SELECTION_FILL}
                      fillOpacity={CHART_SELECTION_FILL_OPACITY}
                      stroke={CHART_SELECTION_STROKE}
                      strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                    />
                  ) : null}
                  {chart.metricIds.length > 1 ? (
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, lineHeight: '20px', paddingBottom: 4 }}
                    />
                  ) : null}
                  {chart.metricIds.map((metricId, index) => {
                    const isStacked = chart.chartType === 'stackedBar';
                    return (
                      <Bar
                        key={metricId}
                        dataKey={metricId}
                        name={metricsById.get(metricId)?.name ?? metricId}
                        stackId={isStacked ? 'stack' : undefined}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        radius={isStacked ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                        shape={
                          isStacked
                            ? ((shapeProps: unknown) => {
                                const props = shapeProps as { payload?: { key?: string } } & Record<string, unknown>;
                                const rowKey = props.payload?.key;
                                const roundTop =
                                  typeof rowKey === 'string' &&
                                  stackedTopMetricIdByRowKey.get(rowKey) === metricId;
                                return <Rectangle {...props} radius={roundTop ? [3, 3, 0, 0] : [0, 0, 0, 0]} />;
                              })
                            : undefined
                        }
                        isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                      />
                    );
                  })}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">
            Drag to zoom the x-axis. Click once to reset.
            {zoom.isZoomed ? ' Showing a zoomed range.' : ''}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">No chart points for this chart in the selected range.</p>
      )}

      <NoticeList title="Chart Errors" items={result?.errors ?? []} tone="error" />
      <NoticeList title="Chart Warnings" items={result?.warnings ?? []} />
    </section>
  );
}

export function AnalyticsPreview({
  selectedItem,
  metrics,
  streaks,
  charts,
  mode = 'selected',
  overviewMetricIds,
  response,
  overviewMetricResultsById,
  overviewStreakResultsById,
  overviewChartResultsById,
  onMetricTimeRangeChange,
  onStreakTimeRangeChange,
  onChartTimeRangeChange,
  loading,
  error
}: AnalyticsPreviewProps) {
  const metricsById = new Map(metrics.map((metric) => [metric.id, metric]));
  const metricResults = response?.metricResults ?? {};
  const streakResults = response?.streakResults ?? {};
  const chartResults = response?.chartResults ?? {};
  const resolvedOverviewMetricResults = overviewMetricResultsById ?? metricResults;
  const resolvedOverviewStreakResults = overviewStreakResultsById ?? streakResults;
  const resolvedOverviewChartResults = overviewChartResultsById ?? chartResults;
  const overviewMetricIdSet = overviewMetricIds ? new Set(overviewMetricIds) : null;
  const overviewMetrics =
    mode === 'overview'
      ? (overviewMetricIdSet
          ? metrics.filter((metric) => overviewMetricIdSet.has(metric.id))
          : metrics)
      : [];

  if (mode === 'overview') {
    const hasAnyItems = overviewMetrics.length > 0 || streaks.length > 0 || charts.length > 0;

    return (
      <div className="space-y-5">
        {loading ? <p className="text-sm text-muted">Recomputing analytics...</p> : null}
        {error ? (
          <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
            {error}
          </div>
        ) : null}
        {response?.globalWarnings?.length ? (
          <NoticeList title="Global Warnings" items={response.globalWarnings} />
        ) : null}

        {!hasAnyItems ? (
          <section className="rounded-xl border border-border bg-panel p-6">
            <h3 className="text-lg font-semibold text-foreground">View</h3>
            <p className="mt-2 text-sm text-muted">
              Create metrics, streaks, or chart views in Configure to see an overview here.
            </p>
          </section>
        ) : null}

        {overviewMetrics.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Metrics</h3>
              <p className="text-sm text-muted">
                Metrics enabled for the View tab. Charts appear only in Chart Views.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {overviewMetrics.map((metric) => (
                <MetricPreview
                  key={metric.id}
                  metric={metric}
                  result={resolvedOverviewMetricResults[metric.id]}
                  showChart={false}
                  showSamplePreview={false}
                />
              ))}
            </div>
          </section>
        ) : null}

        {streaks.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Streaks</h3>
              <p className="text-sm text-muted">Current streak statuses at a glance.</p>
            </div>
            {streaks.map((streak) => (
              <StreakPreview
                key={streak.id}
                streak={streak}
                result={resolvedOverviewStreakResults[streak.id]}
              />
            ))}
          </section>
        ) : null}

        {charts.length > 0 ? (
          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Charts</h3>
              <p className="text-sm text-muted">Saved chart views.</p>
            </div>
            {charts.map((chart) => (
              <ChartPreview
                key={chart.id}
                chart={chart}
                result={resolvedOverviewChartResults[chart.id]}
                metricsById={metricsById}
                metricResults={resolvedOverviewMetricResults}
              />
            ))}
          </section>
        ) : null}
      </div>
    );
  }

  if (!selectedItem) {
    return (
      <section className="rounded-xl border border-border bg-panel p-6">
        <h3 className="text-lg font-semibold text-foreground">Preview</h3>
        <p className="mt-2 text-sm text-muted">
          Select or create a metric, streak, or chart view to edit and preview it.
        </p>
      </section>
    );
  }

  const selectedMetric =
    selectedItem.kind === 'metric' ? metrics.find((metric) => metric.id === selectedItem.id) : undefined;
  const selectedStreak =
    selectedItem.kind === 'streak' ? streaks.find((streak) => streak.id === selectedItem.id) : undefined;
  const selectedChart =
    selectedItem.kind === 'chart' ? charts.find((chart) => chart.id === selectedItem.id) : undefined;

  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-muted">Recomputing analytics...</p> : null}
      {error ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          {error}
        </div>
      ) : null}
      {response?.globalWarnings?.length ? (
        <NoticeList title="Global Warnings" items={response.globalWarnings} />
      ) : null}

      {selectedMetric ? (
        <MetricPreview
          metric={selectedMetric}
          result={metricResults[selectedMetric.id]}
          onTimeRangeChange={
            onMetricTimeRangeChange
              ? (timeRange) => onMetricTimeRangeChange(selectedMetric.id, timeRange)
              : undefined
          }
        />
      ) : null}
      {selectedStreak ? (
        <StreakPreview
          streak={selectedStreak}
          result={streakResults[selectedStreak.id]}
          onTimeRangeChange={
            onStreakTimeRangeChange
              ? (timeRange) => onStreakTimeRangeChange(selectedStreak.id, timeRange)
              : undefined
          }
        />
      ) : null}
      {selectedChart ? (
        <ChartPreview
          chart={selectedChart}
          result={chartResults[selectedChart.id]}
          metricsById={metricsById}
          metricResults={metricResults}
          onTimeRangeChange={
            onChartTimeRangeChange
              ? (timeRange) => onChartTimeRangeChange(selectedChart.id, timeRange)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
