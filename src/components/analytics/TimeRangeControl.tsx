import {
  ADVANCED_ANALYTICS_TIME_RANGE_OPTIONS,
  normalizeAdvancedAnalyticsTimeRange
} from '@/lib/analytics/timeRange';
import type { AdvancedAnalyticsTimeRangeConfig, AdvancedAnalyticsTimeRangePreset } from '@/types';

interface TimeRangeControlProps {
  value: AdvancedAnalyticsTimeRangeConfig | undefined;
  onChange: (next: AdvancedAnalyticsTimeRangeConfig) => void;
  compact?: boolean;
}

export function TimeRangeControl({ value, onChange, compact = false }: TimeRangeControlProps) {
  const normalized = normalizeAdvancedAnalyticsTimeRange(value);
  const showCustomDates = normalized.preset === 'custom';
  const wrapperClassName = compact
    ? showCustomDates
      ? 'grid gap-2 md:grid-cols-3'
      : 'grid gap-2 md:grid-cols-1'
    : showCustomDates
      ? 'grid gap-3 md:grid-cols-3'
      : 'grid gap-3 md:grid-cols-1';
  const inputClassName = compact
    ? 'w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs'
    : 'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm';
  const labelClassName = compact ? 'space-y-1 text-xs' : 'space-y-1 text-sm';

  return (
    <div className={wrapperClassName}>
      <label className={labelClassName}>
        <span className="text-muted">Time range</span>
        <select
          value={normalized.preset}
          onChange={(event) =>
            onChange({
              ...normalized,
              preset: event.target.value as AdvancedAnalyticsTimeRangePreset
            })
          }
          className={inputClassName}
        >
          {ADVANCED_ANALYTICS_TIME_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {showCustomDates ? (
        <>
          <label className={labelClassName}>
            <span className="text-muted">Start</span>
            <input
              type="date"
              value={normalized.customStartDate}
              onChange={(event) => onChange({ ...normalized, customStartDate: event.target.value })}
              className={inputClassName}
            />
          </label>

          <label className={labelClassName}>
            <span className="text-muted">End</span>
            <input
              type="date"
              value={normalized.customEndDate}
              onChange={(event) => onChange({ ...normalized, customEndDate: event.target.value })}
              className={inputClassName}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
