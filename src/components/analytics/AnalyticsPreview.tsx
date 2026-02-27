import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  type TooltipProps,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { formatAnalyticsValue, metricPreviewGranularity, metricResultUnit } from '@/lib/analytics/formatting';
import {
  CHART_IS_ANIMATION_ACTIVE,
  CHART_LINE_ACTIVE_DOT,
  CHART_LINE_STROKE_WIDTH,
  CHART_SELECTION_FILL,
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
import type { AdvancedAnalyticsSelection } from '@/store/useAdvancedAnalyticsStore';
import type {
  AdvancedAnalyticsChartDefinition,
  AdvancedAnalyticsChartResult,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsMetricResult,
  AdvancedAnalyticsRunResponse,
  AdvancedAnalyticsStreakDefinition,
  AdvancedAnalyticsStreakResult
} from '@/types';

const CHART_COLORS = ['#2563eb', '#dc2626', '#10b981', '#f59e0b', '#7c3aed'];
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
  loading: boolean;
  error: string | null;
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

function AnalyticsChartTooltip({
  active,
  label,
  payload,
  unitsByKey
}: TooltipProps<number, string> & { unitsByKey?: Record<string, string> }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[13rem] p-3 text-sm leading-tight">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-2 space-y-1 text-foreground">
        {payload.map((entry) => {
          const seriesKey = String(entry.dataKey ?? '');
          const numericValue = typeof entry.value === 'number' ? entry.value : Number(entry.value);
          const valueLabel = Number.isFinite(numericValue)
            ? formatTooltipNumber(numericValue)
            : String(entry.value ?? 'n/a');
          const unit = unitsByKey?.[seriesKey];

          return (
            <p key={`${seriesKey}-${entry.name ?? 'value'}`}>
              <span className="font-medium">{entry.name ?? seriesKey}</span>:{' '}
              <span className="font-semibold">{valueLabel}</span>
              {unit ? ` ${unit}` : ''}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function MetricPreview({
  metric,
  result
}: {
  metric: AdvancedAnalyticsMetricDefinition;
  result?: AdvancedAnalyticsMetricResult;
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
        <p className="mt-3 text-3xl font-semibold text-foreground">
          {formatAnalyticsValue(result?.scalarValue, unit)}
        </p>
        <p className="mt-1 text-xs text-muted">Preview granularity: {granularity}</p>
      </div>

      {chartPoints.length > 0 ? (
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
      ) : (
        <p className="text-sm text-muted">No series points for this metric in the selected range.</p>
      )}

      <NoticeList title="Metric Errors" items={result?.errors ?? []} tone="error" />
      <NoticeList title="Metric Warnings" items={result?.warnings ?? []} />
    </div>
  );
}

function StreakPreview({
  streak,
  result
}: {
  streak: AdvancedAnalyticsStreakDefinition;
  result?: AdvancedAnalyticsStreakResult;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Streak Result</p>
        <h3 className="mt-1 text-xl font-semibold text-foreground">{streak.name || 'Untitled streak'}</h3>
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
  metricResults
}: {
  chart: AdvancedAnalyticsChartDefinition;
  result?: AdvancedAnalyticsChartResult;
  metricsById: Map<string, AdvancedAnalyticsMetricDefinition>;
  metricResults: Record<string, AdvancedAnalyticsMetricResult>;
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Chart Preview</p>
        <h3 className="mt-1 text-xl font-semibold text-foreground">{chart.name || 'Untitled chart'}</h3>
        <p className="text-sm text-muted">
          {chart.chartType} · {chart.granularity} · {chart.metricIds.length} metric(s)
        </p>
      </div>

      {visibleRows.length > 0 ? (
        <div className="space-y-2">
          <div className="h-80 rounded-lg border border-border/80 bg-bg/30 p-3">
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
                      stroke={CHART_SELECTION_STROKE}
                      strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
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
                      stroke={CHART_SELECTION_STROKE}
                      strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                    />
                  ) : null}
                  {chart.metricIds.map((metricId, index) => (
                    <Bar
                      key={metricId}
                      dataKey={metricId}
                      name={metricsById.get(metricId)?.name ?? metricId}
                      stackId={chart.chartType === 'stackedBar' ? 'stack' : undefined}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                    />
                  ))}
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
    </div>
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
  loading,
  error
}: AnalyticsPreviewProps) {
  const metricsById = new Map(metrics.map((metric) => [metric.id, metric]));
  const metricResults = response?.metricResults ?? {};
  const streakResults = response?.streakResults ?? {};
  const chartResults = response?.chartResults ?? {};
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
      <div className="space-y-6">
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
              <p className="text-sm text-muted">Metrics enabled for the View tab.</p>
            </div>
            {overviewMetrics.map((metric) => (
              <MetricPreview key={metric.id} metric={metric} result={metricResults[metric.id]} />
            ))}
          </section>
        ) : null}

        {streaks.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Streaks</h3>
              <p className="text-sm text-muted">Current streak statuses at a glance.</p>
            </div>
            {streaks.map((streak) => (
              <StreakPreview key={streak.id} streak={streak} result={streakResults[streak.id]} />
            ))}
          </section>
        ) : null}

        {charts.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Charts</h3>
              <p className="text-sm text-muted">Saved chart views for the selected time range.</p>
            </div>
            {charts.map((chart) => (
              <ChartPreview
                key={chart.id}
                chart={chart}
                result={chartResults[chart.id]}
                metricsById={metricsById}
                metricResults={metricResults}
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
        <MetricPreview metric={selectedMetric} result={metricResults[selectedMetric.id]} />
      ) : null}
      {selectedStreak ? (
        <StreakPreview streak={selectedStreak} result={streakResults[selectedStreak.id]} />
      ) : null}
      {selectedChart ? (
        <ChartPreview
          chart={selectedChart}
          result={chartResults[selectedChart.id]}
          metricsById={metricsById}
          metricResults={metricResults}
        />
      ) : null}
    </div>
  );
}
