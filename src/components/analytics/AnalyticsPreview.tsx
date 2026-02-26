import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

import { formatAnalyticsValue, metricPreviewGranularity, metricResultUnit } from '@/lib/analytics/formatting';
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
        <div className="h-72 rounded-xl border border-border bg-panel p-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartPoints.map((point) => ({ key: point.key, label: point.label, value: point.value }))}
            >
              <CartesianGrid stroke="rgba(var(--color-border),0.65)" strokeDasharray="3 3" />
              <XAxis dataKey="key" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
              <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="rgb(var(--color-accent))"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
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
  metricsById
}: {
  chart: AdvancedAnalyticsChartDefinition;
  result?: AdvancedAnalyticsChartResult;
  metricsById: Map<string, AdvancedAnalyticsMetricDefinition>;
}) {
  const rows: Array<Record<string, string | number | null>> = (result?.points ?? []).map((point) => ({
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
        <div className="h-80 rounded-xl border border-border bg-panel p-3">
          <ResponsiveContainer width="100%" height="100%">
            {chart.chartType === 'line' ? (
              <LineChart data={visibleRows}>
                <CartesianGrid stroke="rgba(var(--color-border),0.65)" strokeDasharray="3 3" />
                <XAxis dataKey="key" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {chart.metricIds.slice(0, 1).map((metricId, index) => (
                  <Line
                    key={metricId}
                    type="monotone"
                    dataKey={metricId}
                    name={metricsById.get(metricId)?.name ?? metricId}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart data={visibleRows}>
                <CartesianGrid stroke="rgba(var(--color-border),0.65)" strokeDasharray="3 3" />
                <XAxis dataKey="key" tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
                <YAxis tick={{ fill: 'rgb(var(--color-muted))', fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {chart.metricIds.map((metricId, index) => (
                  <Bar
                    key={metricId}
                    dataKey={metricId}
                    name={metricsById.get(metricId)?.name ?? metricId}
                    stackId={chart.chartType === 'stackedBar' ? 'stack' : undefined}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
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
        <ChartPreview chart={selectedChart} result={chartResults[selectedChart.id]} metricsById={metricsById} />
      ) : null}
    </div>
  );
}
