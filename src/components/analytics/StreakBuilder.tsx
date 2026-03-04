import type {
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsStreakDefinition
} from '@/types';
import { TimeRangeControl } from '@/components/analytics/TimeRangeControl';

interface StreakBuilderProps {
  streak: AdvancedAnalyticsStreakDefinition;
  metrics: AdvancedAnalyticsMetricDefinition[];
  onChange: (streak: AdvancedAnalyticsStreakDefinition) => void;
  onDelete: () => void;
}

export function StreakBuilder({ streak, metrics, onChange, onDelete }: StreakBuilderProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Streak Builder</h3>
          <p className="text-sm text-muted">
            Consecutive daily or weekly periods where a metric meets a threshold.
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-muted">Name</span>
          <input
            value={streak.name}
            onChange={(event) => onChange({ ...streak, name: event.target.value })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Metric</span>
          <select
            value={streak.metricId}
            onChange={(event) => onChange({ ...streak, metricId: event.target.value })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="">Select metric</option>
            {metrics.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Period</span>
          <select
            value={streak.period}
            onChange={(event) => onChange({ ...streak, period: event.target.value as 'day' | 'week' })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Threshold operator</span>
          <select
            value={streak.thresholdOperator}
            onChange={(event) =>
              onChange({
                ...streak,
                thresholdOperator: event.target.value as
                  | 'greaterThan'
                  | 'greaterThanOrEqual'
                  | 'lessThan'
                  | 'lessThanOrEqual'
                  | 'equals'
              })
            }
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="greaterThan">{'>'}</option>
            <option value="greaterThanOrEqual">{'>='}</option>
            <option value="lessThan">{'<'}</option>
            <option value="lessThanOrEqual">{'<='}</option>
            <option value="equals">=</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Threshold value</span>
          <input
            type="number"
            value={streak.thresholdValue}
            onChange={(event) => onChange({ ...streak, thresholdValue: Number(event.target.value) })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3">
        <p className="text-sm font-medium text-foreground">Card time range (View tab)</p>
        <TimeRangeControl
          value={streak.timeRange}
          onChange={(timeRange) => onChange({ ...streak, timeRange })}
        />
      </div>
    </section>
  );
}
