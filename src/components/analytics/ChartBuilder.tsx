import type {
  AdvancedAnalyticsChartDefinition,
  AdvancedAnalyticsMetricDefinition
} from '@/types';
import { TimeRangeControl } from '@/components/analytics/TimeRangeControl';

interface ChartBuilderProps {
  chart: AdvancedAnalyticsChartDefinition;
  metrics: AdvancedAnalyticsMetricDefinition[];
  onChange: (chart: AdvancedAnalyticsChartDefinition) => void;
  onDelete: () => void;
}

export function ChartBuilder({ chart, metrics, onChange, onDelete }: ChartBuilderProps) {
  const toggleMetric = (metricId: string, checked: boolean) => {
    const nextMetricIds = checked
      ? [...chart.metricIds, metricId]
      : chart.metricIds.filter((id) => id !== metricId);
    onChange({ ...chart, metricIds: nextMetricIds });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Chart View Builder</h3>
          <p className="text-sm text-muted">Time-bucketed chart views using saved metrics.</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm md:col-span-3">
          <span className="text-muted">Name</span>
          <input
            value={chart.name}
            onChange={(event) => onChange({ ...chart, name: event.target.value })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Chart type</span>
          <select
            value={chart.chartType}
            onChange={(event) =>
              onChange({
                ...chart,
                chartType: event.target.value as 'bar' | 'line' | 'stackedBar'
              })
            }
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="stackedBar">Stacked Bar</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Granularity</span>
          <select
            value={chart.granularity}
            onChange={(event) => onChange({ ...chart, granularity: event.target.value as 'day' | 'week' | 'month' })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
        <div className="rounded-md border border-border bg-bg/30 px-3 py-2 text-xs text-muted">
          {chart.chartType === 'stackedBar'
            ? 'Pick 2-5 metrics'
            : 'Pick exactly 1 metric'}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3">
        <p className="text-sm font-medium text-foreground">Card time range (View tab)</p>
        <TimeRangeControl
          value={chart.timeRange}
          onChange={(timeRange) => onChange({ ...chart, timeRange })}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3">
        <p className="text-sm font-medium text-foreground">Metrics</p>
        {metrics.length === 0 ? (
          <p className="text-xs text-muted">Create metrics first.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {metrics.map((metric) => (
              <label
                key={metric.id}
                className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={chart.metricIds.includes(metric.id)}
                  onChange={(event) => toggleMetric(metric.id, event.target.checked)}
                />
                <span className="truncate">{metric.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
