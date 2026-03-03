import {
  createBlankActivityCondition,
  createBlankActivityConditionGroup,
  createBlankSampleCondition,
  createBlankSampleConditionGroup
} from '@/store/useAdvancedAnalyticsStore';
import type {
  AdvancedAnalyticsActivityCondition,
  AdvancedAnalyticsActivityConditionField,
  AdvancedAnalyticsActivityConditionGroup,
  AdvancedAnalyticsActivityConditionOperator,
  AdvancedAnalyticsBaseMeasure,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsSampleCondition,
  AdvancedAnalyticsSampleConditionField,
  AdvancedAnalyticsSampleConditionGroup,
  AdvancedAnalyticsSampleConditionOperator
} from '@/types';

const BASE_MEASURE_OPTIONS: Array<{ value: AdvancedAnalyticsBaseMeasure; label: string }> = [
  { value: 'activitiesCount', label: 'Activities count' },
  { value: 'activeDaysCount', label: 'Active days count' },
  { value: 'distanceSum', label: 'Distance sum' },
  { value: 'durationSum', label: 'Duration sum' },
  { value: 'movingTimeSum', label: 'Moving time sum' },
  { value: 'elevationGainSum', label: 'Elevation gain sum' },
  { value: 'sampleTime', label: 'Sample time (time spent while ...)' }
];

const UNIT_DISPLAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Auto' },
  { value: 'count', label: 'Count' },
  { value: '%', label: 'Percent (%)' },
  { value: 's', label: 'Seconds (s)' },
  { value: 'min', label: 'Minutes (min)' },
  { value: 'h', label: 'Hours (h)' },
  { value: 'km', label: 'Kilometers (km)' },
  { value: 'm', label: 'Meters (m)' },
  { value: 'mi', label: 'Miles (mi)' },
  { value: 'bpm', label: 'Heart rate (bpm)' },
  { value: 'W', label: 'Power (W)' }
];

const ACTIVITY_FIELD_OPTIONS: Array<{ value: AdvancedAnalyticsActivityConditionField; label: string }> = [
  { value: 'title', label: 'Title' },
  { value: 'category', label: 'Category' },
  { value: 'sportType', label: 'Sport type' },
  { value: 'weekday', label: 'Weekday' },
  { value: 'distanceM', label: 'Distance (m)' },
  { value: 'durationSeconds', label: 'Duration (s)' },
  { value: 'movingDurationSeconds', label: 'Moving duration (s)' },
  { value: 'elevationGainM', label: 'Elevation gain (m)' },
  { value: 'avgHr', label: 'Average HR' },
  { value: 'maxHr', label: 'Max HR' },
  { value: 'hasGps', label: 'Has GPS' }
];

const SAMPLE_FIELD_OPTIONS: Array<{ value: AdvancedAnalyticsSampleConditionField; label: string }> = [
  { value: 'heartRateZone', label: 'Heart-rate zone' },
  { value: 'heartRate', label: 'Heart rate' },
  { value: 'powerWatts', label: 'Power (W)' },
  { value: 'cadence', label: 'Cadence' },
  { value: 'speedMps', label: 'Speed (m/s)' }
];

const WEEKDAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function activityFieldKind(field: AdvancedAnalyticsActivityConditionField): 'text' | 'number' | 'bool' {
  if (field === 'hasGps') {
    return 'bool';
  }
  if (field === 'weekday' || field === 'title' || field === 'category' || field === 'sportType') {
    return 'text';
  }
  return 'number';
}

function activityOperatorsForField(
  field: AdvancedAnalyticsActivityConditionField
): AdvancedAnalyticsActivityConditionOperator[] {
  const kind = activityFieldKind(field);
  if (kind === 'text') {
    if (field === 'weekday') {
      return ['equals', 'notEquals'];
    }
    return ['contains', 'equals', 'startsWith', 'notEquals'];
  }
  if (kind === 'bool') {
    return ['is', 'isNot'];
  }
  return ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'numberEquals'];
}

function sampleOperatorsForField(
  field: AdvancedAnalyticsSampleConditionField
): AdvancedAnalyticsSampleConditionOperator[] {
  if (field === 'heartRateZone') {
    return ['is'];
  }
  return ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'numberEquals', 'notEquals'];
}

function displayOperator(value: string) {
  return value
    .replace(/[A-Z]/g, (char) => ` ${char.toLowerCase()}`)
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeMetric(metric: AdvancedAnalyticsMetricDefinition): AdvancedAnalyticsMetricDefinition {
  const base = metric.base ?? {
    measure: 'activitiesCount',
    activityConditions: [],
    activityConditionGroups: [],
    sampleConditions: [],
    sampleConditionGroups: [],
    defaultChartGranularity: 'week',
    displayUnit: ''
  };

  const activityConditionGroups =
    base.activityConditionGroups && base.activityConditionGroups.length > 0
      ? base.activityConditionGroups
      : base.activityConditions.length > 0
        ? [
            {
              id: `legacy_activity_${metric.id}`,
              conditions: base.activityConditions
            }
          ]
        : [];

  const sampleConditionGroups =
    base.sampleConditionGroups && base.sampleConditionGroups.length > 0
      ? base.sampleConditionGroups
      : base.sampleConditions.length > 0
        ? [
            {
              id: `legacy_sample_${metric.id}`,
              conditions: base.sampleConditions
            }
          ]
        : [];

  return {
    ...metric,
    kind: 'base',
    formula: undefined,
    base: {
      ...base,
      activityConditions: [],
      sampleConditions: [],
      activityConditionGroups,
      sampleConditionGroups
    }
  };
}

interface MetricEditorSheetProps {
  metric: AdvancedAnalyticsMetricDefinition;
  onChange: (metric: AdvancedAnalyticsMetricDefinition) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MetricEditorSheet({ metric, onChange, onDelete, onClose }: MetricEditorSheetProps) {
  const normalizedMetric = normalizeMetric(metric);
  const base = normalizedMetric.base!;
  const activityGroups = base.activityConditionGroups ?? [];
  const sampleGroups = base.sampleConditionGroups ?? [];

  const updateBase = (
    updater: (current: NonNullable<AdvancedAnalyticsMetricDefinition['base']>) => NonNullable<AdvancedAnalyticsMetricDefinition['base']>
  ) => {
    onChange({
      ...normalizedMetric,
      kind: 'base',
      formula: undefined,
      base: updater(base)
    });
  };

  const setActivityGroups = (groups: AdvancedAnalyticsActivityConditionGroup[]) => {
    updateBase((current) => ({
      ...current,
      activityConditionGroups: groups,
      activityConditions: []
    }));
  };

  const setSampleGroups = (groups: AdvancedAnalyticsSampleConditionGroup[]) => {
    updateBase((current) => ({
      ...current,
      sampleConditionGroups: groups,
      sampleConditions: []
    }));
  };

  const updateActivityCondition = (
    groupId: string,
    conditionId: string,
    updater: (condition: AdvancedAnalyticsActivityCondition) => AdvancedAnalyticsActivityCondition
  ) => {
    setActivityGroups(
      activityGroups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        return {
          ...group,
          conditions: group.conditions.map((condition) =>
            condition.id === conditionId ? updater(condition) : condition
          )
        };
      })
    );
  };

  const updateSampleCondition = (
    groupId: string,
    conditionId: string,
    updater: (condition: AdvancedAnalyticsSampleCondition) => AdvancedAnalyticsSampleCondition
  ) => {
    setSampleGroups(
      sampleGroups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }
        return {
          ...group,
          conditions: group.conditions.map((condition) =>
            condition.id === conditionId ? updater(condition) : condition
          )
        };
      })
    );
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/35"
        onClick={onClose}
        aria-label="Close metric editor"
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-border bg-panel p-5">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Metric</p>
            <h3 className="mt-1 text-xl font-semibold text-foreground">Edit metric</h3>
            <p className="mt-1 text-sm text-muted">AND inside each group, OR between groups.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
          >
            Done
          </button>
        </header>

        <div className="space-y-5">
          <section className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-muted">Name</span>
              <input
                value={normalizedMetric.name}
                onChange={(event) => onChange({ ...normalizedMetric, name: event.target.value })}
                className="w-full rounded-md border border-border bg-bg px-3 py-2"
                placeholder="e.g. Time in Z2"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted">Measure</span>
              <select
                value={base.measure}
                onChange={(event) => {
                  const nextMeasure = event.target.value as AdvancedAnalyticsBaseMeasure;
                  updateBase((current) => ({
                    ...current,
                    measure: nextMeasure,
                    sampleConditionGroups:
                      nextMeasure === 'sampleTime' && (current.sampleConditionGroups ?? []).length === 0
                        ? [createBlankSampleConditionGroup()]
                        : current.sampleConditionGroups
                  }));
                }}
                className="w-full rounded-md border border-border bg-bg px-3 py-2"
              >
                {BASE_MEASURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-muted">Plot granularity</span>
              <select
                value={base.defaultChartGranularity ?? 'week'}
                onChange={(event) =>
                  updateBase((current) => ({
                    ...current,
                    defaultChartGranularity: event.target.value as 'day' | 'week' | 'month'
                  }))
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-muted">Display unit</span>
              <select
                value={base.displayUnit ?? ''}
                onChange={(event) =>
                  updateBase((current) => ({
                    ...current,
                    displayUnit: event.target.value
                  }))
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2"
              >
                {UNIT_DISPLAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-bg/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Activity rules</p>
                <p className="text-xs text-muted">Any matching group includes the activity.</p>
              </div>
              <button
                type="button"
                onClick={() => setActivityGroups([...activityGroups, createBlankActivityConditionGroup()])}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                + Group
              </button>
            </div>

            {activityGroups.length === 0 ? (
              <p className="text-xs text-muted">No activity rules. All activities are included.</p>
            ) : (
              activityGroups.map((group, groupIndex) => (
                <div key={group.id} className="space-y-2 rounded-md border border-border bg-bg p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      Group {groupIndex + 1} (AND)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setActivityGroups(
                            activityGroups.map((candidate) =>
                              candidate.id === group.id
                                ? {
                                    ...candidate,
                                    conditions: [...candidate.conditions, createBlankActivityCondition()]
                                  }
                                : candidate
                            )
                          )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                      >
                        + Rule
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActivityGroups(activityGroups.filter((candidate) => candidate.id !== group.id))
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs text-muted"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {group.conditions.map((condition) => {
                    const kind = activityFieldKind(condition.field);
                    const operators = activityOperatorsForField(condition.field);

                    return (
                      <div key={condition.id} className="grid gap-2 md:grid-cols-12">
                        <select
                          value={condition.field}
                          onChange={(event) => {
                            const field = event.target.value as AdvancedAnalyticsActivityConditionField;
                            const nextKind = activityFieldKind(field);
                            const operator = activityOperatorsForField(field)[0];
                            updateActivityCondition(group.id, condition.id, (current) => ({
                              ...current,
                              field,
                              operator,
                              value: field === 'weekday' ? 'monday' : nextKind === 'text' ? '' : undefined,
                              numberValue: nextKind === 'number' ? current.numberValue ?? 0 : undefined,
                              boolValue: nextKind === 'bool' ? current.boolValue ?? true : undefined
                            }));
                          }}
                          className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
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
                            updateActivityCondition(group.id, condition.id, (current) => ({
                              ...current,
                              operator: event.target.value as AdvancedAnalyticsActivityConditionOperator
                            }))
                          }
                          className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-3"
                        >
                          {operators.map((operator) => (
                            <option key={operator} value={operator}>
                              {displayOperator(operator)}
                            </option>
                          ))}
                        </select>

                        {kind === 'number' ? (
                          <input
                            type="number"
                            value={condition.numberValue ?? 0}
                            onChange={(event) =>
                              updateActivityCondition(group.id, condition.id, (current) => ({
                                ...current,
                                numberValue: Number(event.target.value)
                              }))
                            }
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
                          />
                        ) : condition.field === 'weekday' ? (
                          <select
                            value={condition.value ?? 'monday'}
                            onChange={(event) =>
                              updateActivityCondition(group.id, condition.id, (current) => ({
                                ...current,
                                value: event.target.value
                              }))
                            }
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
                          >
                            {WEEKDAY_VALUES.map((weekday) => (
                              <option key={weekday} value={weekday}>
                                {weekday[0].toUpperCase() + weekday.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : kind === 'bool' ? (
                          <select
                            value={String(condition.boolValue ?? true)}
                            onChange={(event) =>
                              updateActivityCondition(group.id, condition.id, (current) => ({
                                ...current,
                                boolValue: event.target.value === 'true',
                                value: event.target.value
                              }))
                            }
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
                          >
                            <option value="true">True</option>
                            <option value="false">False</option>
                          </select>
                        ) : (
                          <input
                            value={condition.value ?? ''}
                            onChange={(event) =>
                              updateActivityCondition(group.id, condition.id, (current) => ({
                                ...current,
                                value: event.target.value
                              }))
                            }
                            placeholder="value"
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
                          />
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setActivityGroups(
                              activityGroups
                                .map((candidate) =>
                                  candidate.id === group.id
                                    ? {
                                        ...candidate,
                                        conditions: candidate.conditions.filter((item) => item.id !== condition.id)
                                      }
                                    : candidate
                                )
                                .filter((candidate) => candidate.conditions.length > 0)
                            )
                          }
                          className="rounded-md border border-border px-2 py-2 text-xs text-muted md:col-span-1"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>

          {base.measure === 'sampleTime' ? (
            <section className="space-y-3 rounded-lg border border-border bg-bg/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Sample rules</p>
                  <p className="text-xs text-muted">Any matching group adds sample-time intervals.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSampleGroups([...sampleGroups, createBlankSampleConditionGroup()])}
                  className="rounded-md border border-border px-2 py-1 text-xs"
                >
                  + Group
                </button>
              </div>

              {sampleGroups.length === 0 ? (
                <p className="text-xs text-muted">No sample rules. All sample intervals are counted.</p>
              ) : (
                sampleGroups.map((group, groupIndex) => (
                  <div key={group.id} className="space-y-2 rounded-md border border-border bg-bg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                        Group {groupIndex + 1} (AND)
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSampleGroups(
                              sampleGroups.map((candidate) =>
                                candidate.id === group.id
                                  ? {
                                      ...candidate,
                                      conditions: [...candidate.conditions, createBlankSampleCondition()]
                                    }
                                  : candidate
                              )
                            )
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                          + Rule
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSampleGroups(sampleGroups.filter((candidate) => candidate.id !== group.id))
                          }
                          className="rounded-md border border-border px-2 py-1 text-xs text-muted"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {group.conditions.map((condition) => {
                      const operators = sampleOperatorsForField(condition.field);

                      return (
                        <div key={condition.id} className="grid gap-2 md:grid-cols-12">
                          <select
                            value={condition.field}
                            onChange={(event) => {
                              const field = event.target.value as AdvancedAnalyticsSampleConditionField;
                              updateSampleCondition(group.id, condition.id, (current) => ({
                                ...current,
                                field,
                                operator: sampleOperatorsForField(field)[0],
                                zone: field === 'heartRateZone' ? current.zone ?? 2 : undefined,
                                numberValue: field === 'heartRateZone' ? undefined : current.numberValue ?? 0
                              }));
                            }}
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
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
                              updateSampleCondition(group.id, condition.id, (current) => ({
                                ...current,
                                operator: event.target.value as AdvancedAnalyticsSampleConditionOperator
                              }))
                            }
                            className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-3"
                          >
                            {operators.map((operator) => (
                              <option key={operator} value={operator}>
                                {displayOperator(operator)}
                              </option>
                            ))}
                          </select>

                          {condition.field === 'heartRateZone' ? (
                            <select
                              value={String(condition.zone ?? 2)}
                              onChange={(event) =>
                                updateSampleCondition(group.id, condition.id, (current) => ({
                                  ...current,
                                  zone: Number(event.target.value)
                                }))
                              }
                              className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
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
                                updateSampleCondition(group.id, condition.id, (current) => ({
                                  ...current,
                                  numberValue: Number(event.target.value)
                                }))
                              }
                              className="rounded-md border border-border bg-panel px-2 py-2 text-sm md:col-span-4"
                            />
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setSampleGroups(
                                sampleGroups
                                  .map((candidate) =>
                                    candidate.id === group.id
                                      ? {
                                          ...candidate,
                                          conditions: candidate.conditions.filter((item) => item.id !== condition.id)
                                        }
                                      : candidate
                                  )
                                  .filter((candidate) => candidate.conditions.length > 0)
                              )
                            }
                            className="rounded-md border border-border px-2 py-2 text-xs text-muted md:col-span-1"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </section>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
            >
              Delete metric
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Save
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
