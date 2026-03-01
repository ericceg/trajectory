import {
  createBlankActivityCondition,
  createBlankSampleCondition
} from '@/store/useAdvancedAnalyticsStore';
import type {
  AdvancedAnalyticsActivityCondition,
  AdvancedAnalyticsActivityConditionField,
  AdvancedAnalyticsActivityConditionOperator,
  AdvancedAnalyticsBaseMeasure,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsSampleCondition,
  AdvancedAnalyticsSampleConditionField,
  AdvancedAnalyticsSampleConditionOperator
} from '@/types';

const BASE_MEASURE_OPTIONS: Array<{ value: AdvancedAnalyticsBaseMeasure; label: string }> = [
  { value: 'activitiesCount', label: 'Activities count' },
  { value: 'activeDaysCount', label: 'Active days count' },
  { value: 'distanceSum', label: 'Distance sum' },
  { value: 'durationSum', label: 'Duration sum' },
  { value: 'movingTimeSum', label: 'Moving time sum' },
  { value: 'elevationGainSum', label: 'Elevation gain sum' },
  { value: 'sampleTime', label: 'Sample time' }
];

const UNIT_DISPLAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'None' },
  { value: 'count', label: 'Count' },
  { value: '%', label: 'Percent (%)' },
  { value: 's', label: 'Seconds (s)' },
  { value: 'min', label: 'Minutes (min)' },
  { value: 'h', label: 'Hours (h)' },
  { value: 'km', label: 'Kilometers (km)' },
  { value: 'm', label: 'Meters (m)' },
  { value: 'mi', label: 'Miles (mi)' },
  { value: 'km/h', label: 'Speed (km/h)' },
  { value: 'm/s', label: 'Speed (m/s)' },
  { value: 'bpm', label: 'Heart rate (bpm)' },
  { value: 'W', label: 'Power (W)' },
  { value: 'rpm', label: 'Cadence (rpm)' }
];

const ACTIVITY_FIELD_OPTIONS: Array<{ value: AdvancedAnalyticsActivityConditionField; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'category', label: 'Category' },
  { value: 'sportType', label: 'Sport Type' },
  { value: 'distanceM', label: 'Distance (m)' },
  { value: 'durationSeconds', label: 'Duration (s)' },
  { value: 'movingDurationSeconds', label: 'Moving Time (s)' },
  { value: 'elevationGainM', label: 'Elevation Gain (m)' },
  { value: 'avgHr', label: 'Avg HR' },
  { value: 'maxHr', label: 'Max HR' },
  { value: 'hasGps', label: 'Has GPS' },
  { value: 'weekday', label: 'Weekday' }
];

const SAMPLE_FIELD_OPTIONS: Array<{ value: AdvancedAnalyticsSampleConditionField; label: string }> = [
  { value: 'heartRateZone', label: 'Heart Rate Zone' },
  { value: 'heartRate', label: 'Heart Rate' },
  { value: 'powerWatts', label: 'Power (W)' },
  { value: 'cadence', label: 'Cadence' },
  { value: 'speedMps', label: 'Speed (m/s)' }
];

const TEXT_OPERATORS: AdvancedAnalyticsActivityConditionOperator[] = [
  'contains',
  'containsAny',
  'containsAll',
  'equals',
  'startsWith'
];
const NUM_OPERATORS: AdvancedAnalyticsActivityConditionOperator[] = [
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'numberEquals',
  'notEquals'
];
const BOOL_OPERATORS: AdvancedAnalyticsActivityConditionOperator[] = ['is', 'isNot'];

const SAMPLE_NUM_OPERATORS: AdvancedAnalyticsSampleConditionOperator[] = [
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'numberEquals',
  'notEquals'
];

function activityFieldKind(field: AdvancedAnalyticsActivityConditionField): 'text' | 'number' | 'bool' {
  if (field === 'hasGps') {
    return 'bool';
  }
  if (field === 'title' || field === 'category' || field === 'sportType' || field === 'weekday') {
    return 'text';
  }
  return 'number';
}

function activityOperatorsForField(
  field: AdvancedAnalyticsActivityConditionField
): AdvancedAnalyticsActivityConditionOperator[] {
  const kind = activityFieldKind(field);
  if (kind === 'text') {
    return field === 'weekday'
      ? ['equals', 'is', 'isNot']
      : TEXT_OPERATORS;
  }
  if (kind === 'bool') {
    return BOOL_OPERATORS;
  }
  return NUM_OPERATORS;
}

function displayOperator(label: string) {
  return label
    .replace(/[A-Z]/g, (ch) => ` ${ch.toLowerCase()}`)
    .replace(/^./, (ch) => ch.toUpperCase());
}

function unitDisplayOptionsForValue(value?: string | null): Array<{ value: string; label: string }> {
  const currentValue = value ?? '';
  if (!currentValue || UNIT_DISPLAY_OPTIONS.some((option) => option.value === currentValue)) {
    return UNIT_DISPLAY_OPTIONS;
  }
  return [{ value: currentValue, label: `Custom (${currentValue})` }, ...UNIT_DISPLAY_OPTIONS];
}

interface MetricBuilderProps {
  metric: AdvancedAnalyticsMetricDefinition;
  allMetrics: AdvancedAnalyticsMetricDefinition[];
  onChange: (metric: AdvancedAnalyticsMetricDefinition) => void;
  onDelete: () => void;
}

export function MetricBuilder({ metric, allMetrics, onChange, onDelete }: MetricBuilderProps) {
  const base = metric.base ?? {
    measure: 'activitiesCount',
    activityConditions: [],
    sampleConditions: [],
    defaultChartGranularity: 'week',
    displayUnit: ''
  };
  const formula = metric.formula ?? {
    leftMetricId: allMetrics.find((candidate) => candidate.id !== metric.id)?.id ?? '',
    operator: 'divide',
    rightMetricId: allMetrics.find((candidate) => candidate.id !== metric.id)?.id ?? '',
    displayUnit: '%'
  };
  const baseDisplayUnitOptions = unitDisplayOptionsForValue(base.displayUnit);
  const formulaDisplayUnitOptions = unitDisplayOptionsForValue(formula.displayUnit);

  const updateActivityCondition = (
    conditionId: string,
    updater: (condition: AdvancedAnalyticsActivityCondition) => AdvancedAnalyticsActivityCondition
  ) => {
    onChange({
      ...metric,
      kind: 'base',
      base: {
        ...base,
        activityConditions: base.activityConditions.map((condition) =>
          condition.id === conditionId ? updater(condition) : condition
        )
      }
    });
  };

  const updateSampleCondition = (
    conditionId: string,
    updater: (condition: AdvancedAnalyticsSampleCondition) => AdvancedAnalyticsSampleCondition
  ) => {
    onChange({
      ...metric,
      kind: 'base',
      base: {
        ...base,
        sampleConditions: base.sampleConditions.map((condition) =>
          condition.id === conditionId ? updater(condition) : condition
        )
      }
    });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Metric Builder</h3>
          <p className="text-sm text-muted">Define a base metric or combine two existing metrics.</p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-foreground"
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted">Name</span>
          <input
            value={metric.name}
            onChange={(event) => onChange({ ...metric, name: event.target.value })}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Type</span>
          <select
            value={metric.kind}
            onChange={(event) => {
              const kind = event.target.value as 'base' | 'formula';
              onChange(
                kind === 'base'
                  ? {
                      ...metric,
                      kind,
                      base,
                      formula: undefined
                    }
                  : {
                      ...metric,
                      kind,
                      formula,
                      base: undefined
                    }
              );
            }}
            className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
          >
            <option value="base">Base metric</option>
            <option value="formula">Formula metric</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 rounded-md border border-border bg-bg/30 px-3 py-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={metric.showInView !== false}
          onChange={(event) => onChange({ ...metric, showInView: event.target.checked })}
        />
        Show in View tab
      </label>

      {metric.kind === 'base' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-muted">Measure</span>
              <select
                value={base.measure}
                onChange={(event) =>
                  onChange({
                    ...metric,
                    kind: 'base',
                    base: {
                      ...base,
                      measure: event.target.value as AdvancedAnalyticsBaseMeasure
                    }
                  })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                {BASE_MEASURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Preview granularity</span>
              <select
                value={base.defaultChartGranularity ?? 'week'}
                onChange={(event) =>
                  onChange({
                    ...metric,
                    kind: 'base',
                    base: {
                      ...base,
                      defaultChartGranularity: event.target.value as 'day' | 'week' | 'month'
                    }
                  })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-muted">Unit display (optional override)</span>
            <select
              value={base.displayUnit ?? ''}
              onChange={(event) =>
                onChange({
                  ...metric,
                  kind: 'base',
                  base: {
                    ...base,
                    displayUnit: event.target.value
                  }
                })
              }
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              {baseDisplayUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Where (AND conditions)</p>
                <p className="text-xs text-muted">All conditions must match the activity.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...metric,
                    kind: 'base',
                    base: {
                      ...base,
                      activityConditions: [...base.activityConditions, createBlankActivityCondition()]
                    }
                  })
                }
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                + Condition
              </button>
            </div>
            {base.activityConditions.length === 0 ? (
              <p className="text-xs text-muted">No activity conditions (matches all activities).</p>
            ) : (
              base.activityConditions.map((condition) => {
                const kind = activityFieldKind(condition.field);
                const operators = activityOperatorsForField(condition.field);
                return (
                  <div key={condition.id} className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-12">
                    <select
                      value={condition.field}
                      onChange={(event) => {
                        const nextField = event.target.value as AdvancedAnalyticsActivityConditionField;
                        const nextOperator = activityOperatorsForField(nextField)[0];
                        updateActivityCondition(condition.id, (current) => ({
                          ...current,
                          field: nextField,
                          operator: nextOperator,
                          value:
                            activityFieldKind(nextField) === 'text'
                              ? current.value ?? ''
                              : activityFieldKind(nextField) === 'bool'
                                ? 'true'
                                : '',
                          numberValue:
                            activityFieldKind(nextField) === 'number'
                              ? Number.isFinite(current.numberValue) ? current.numberValue : 0
                              : undefined,
                          boolValue:
                            activityFieldKind(nextField) === 'bool'
                              ? current.boolValue ?? true
                              : undefined
                        }));
                      }}
                      className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-3"
                    >
                      {ACTIVITY_FIELD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(event) =>
                        updateActivityCondition(condition.id, (current) => ({
                          ...current,
                          operator: event.target.value as AdvancedAnalyticsActivityConditionOperator
                        }))
                      }
                      className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-3"
                    >
                      {operators.map((operator) => (
                        <option key={operator} value={operator}>
                          {displayOperator(operator)}
                        </option>
                      ))}
                    </select>
                    {kind === 'text' ? (
                      <input
                        value={condition.value ?? ''}
                        onChange={(event) =>
                          updateActivityCondition(condition.id, (current) => ({
                            ...current,
                            value: event.target.value
                          }))
                        }
                        placeholder={condition.operator === 'containsAny' || condition.operator === 'containsAll' ? 'comma-separated' : 'value'}
                        className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-5"
                      />
                    ) : kind === 'bool' ? (
                      <select
                        value={String(condition.boolValue ?? true)}
                        onChange={(event) =>
                          updateActivityCondition(condition.id, (current) => ({
                            ...current,
                            boolValue: event.target.value === 'true',
                            value: event.target.value
                          }))
                        }
                        className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-5"
                      >
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={condition.numberValue ?? 0}
                        onChange={(event) =>
                          updateActivityCondition(condition.id, (current) => ({
                            ...current,
                            numberValue: Number(event.target.value)
                          }))
                        }
                        className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-5"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...metric,
                          kind: 'base',
                          base: {
                            ...base,
                            activityConditions: base.activityConditions.filter((item) => item.id !== condition.id)
                          }
                        })
                      }
                      className="rounded-md border border-border px-2 py-2 text-xs text-muted md:col-span-1"
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {base.measure === 'sampleTime' ? (
            <div className="space-y-2 rounded-lg border border-border bg-bg/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Sample conditions (AND)</p>
                  <p className="text-xs text-muted">
                    Time is accumulated over matching sample intervals (previous sample semantics).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...metric,
                      kind: 'base',
                      base: {
                        ...base,
                        sampleConditions: [...base.sampleConditions, createBlankSampleCondition()]
                      }
                    })
                  }
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  + Sample Condition
                </button>
              </div>
              {base.sampleConditions.length === 0 ? (
                <p className="text-xs text-muted">No sample conditions: all tracked sample intervals count.</p>
              ) : (
                base.sampleConditions.map((condition) => {
                  const isZone = condition.field === 'heartRateZone';
                  const operators = isZone ? (['is'] as const) : SAMPLE_NUM_OPERATORS;
                  return (
                    <div key={condition.id} className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-12">
                      <select
                        value={condition.field}
                        onChange={(event) => {
                          const field = event.target.value as AdvancedAnalyticsSampleConditionField;
                          updateSampleCondition(condition.id, (current) => ({
                            ...current,
                            field,
                            operator: field === 'heartRateZone' ? 'is' : 'greaterThanOrEqual',
                            zone: field === 'heartRateZone' ? current.zone ?? 2 : undefined,
                            numberValue: field === 'heartRateZone' ? undefined : current.numberValue ?? 0
                          }));
                        }}
                        className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-4"
                      >
                        {SAMPLE_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={condition.operator}
                        onChange={(event) =>
                          updateSampleCondition(condition.id, (current) => ({
                            ...current,
                            operator: event.target.value as AdvancedAnalyticsSampleConditionOperator
                          }))
                        }
                        className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-3"
                      >
                        {operators.map((operator) => (
                          <option key={operator} value={operator}>
                            {displayOperator(operator)}
                          </option>
                        ))}
                      </select>
                      {isZone ? (
                        <select
                          value={String(condition.zone ?? 2)}
                          onChange={(event) =>
                            updateSampleCondition(condition.id, (current) => ({
                              ...current,
                              zone: Number(event.target.value)
                            }))
                          }
                          className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-4"
                        >
                          {[1, 2, 3, 4, 5].map((zone) => (
                            <option key={zone} value={zone}>
                              Z{zone}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          value={condition.numberValue ?? 0}
                          onChange={(event) =>
                            updateSampleCondition(condition.id, (current) => ({
                              ...current,
                              numberValue: Number(event.target.value)
                            }))
                          }
                          className="rounded-md border border-border bg-bg px-2 py-2 text-sm md:col-span-4"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...metric,
                            kind: 'base',
                            base: {
                              ...base,
                              sampleConditions: base.sampleConditions.filter((item) => item.id !== condition.id)
                            }
                          })
                        }
                        className="rounded-md border border-border px-2 py-2 text-xs text-muted md:col-span-1"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-muted">Metric A</span>
              <select
                value={formula.leftMetricId}
                onChange={(event) =>
                  onChange({
                    ...metric,
                    kind: 'formula',
                    formula: { ...formula, leftMetricId: event.target.value }
                  })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="">Select metric</option>
                {allMetrics
                  .filter((candidate) => candidate.id !== metric.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Operator</span>
              <select
                value={formula.operator}
                onChange={(event) =>
                  onChange({
                    ...metric,
                    kind: 'formula',
                    formula: {
                      ...formula,
                      operator: event.target.value as 'add' | 'subtract' | 'divide' | 'percent'
                    }
                  })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="add">+</option>
                <option value="subtract">-</option>
                <option value="divide">/</option>
                <option value="percent">%</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted">Metric B</span>
              <select
                value={formula.rightMetricId}
                onChange={(event) =>
                  onChange({
                    ...metric,
                    kind: 'formula',
                    formula: { ...formula, rightMetricId: event.target.value }
                  })
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="">Select metric</option>
                {allMetrics
                  .filter((candidate) => candidate.id !== metric.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-muted">Unit display</span>
            <select
              value={formula.displayUnit ?? ''}
              onChange={(event) =>
                onChange({
                  ...metric,
                  kind: 'formula',
                  formula: { ...formula, displayUnit: event.target.value }
                })
              }
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              {formulaDisplayUnitOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
