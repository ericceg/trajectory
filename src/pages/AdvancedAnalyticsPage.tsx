import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';

import { AnalyticsLibrary } from '@/components/analytics/AnalyticsLibrary';
import { AnalyticsPreview } from '@/components/analytics/AnalyticsPreview';
import { ChartBuilder } from '@/components/analytics/ChartBuilder';
import { MetricBuilder } from '@/components/analytics/MetricBuilder';
import { StreakBuilder } from '@/components/analytics/StreakBuilder';
import { runAdvancedAnalytics } from '@/lib/tauri';
import { validateAdvancedAnalyticsDefinitions } from '@/lib/analytics/validation';
import { useAdvancedAnalyticsStore } from '@/store/useAdvancedAnalyticsStore';
import { useAppStore } from '@/store/useAppStore';
import type { AdvancedAnalyticsRunRequest, AdvancedAnalyticsRunResponse } from '@/types';

type AdvancedAnalyticsTab = 'configure' | 'view';

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

export function AdvancedAnalyticsPage() {
  const settings = useAppStore((state) => state.settings);
  const metrics = useAdvancedAnalyticsStore((state) => state.metrics);
  const streaks = useAdvancedAnalyticsStore((state) => state.streaks);
  const charts = useAdvancedAnalyticsStore((state) => state.charts);
  const timeRangePreset = useAdvancedAnalyticsStore((state) => state.timeRangePreset);
  const customStartDate = useAdvancedAnalyticsStore((state) => state.customStartDate);
  const customEndDate = useAdvancedAnalyticsStore((state) => state.customEndDate);
  const autoRun = useAdvancedAnalyticsStore((state) => state.autoRun);
  const selectedItem = useAdvancedAnalyticsStore((state) => state.selectedItem);
  const setTimeRangePreset = useAdvancedAnalyticsStore((state) => state.setTimeRangePreset);
  const setCustomStartDate = useAdvancedAnalyticsStore((state) => state.setCustomStartDate);
  const setCustomEndDate = useAdvancedAnalyticsStore((state) => state.setCustomEndDate);
  const setAutoRun = useAdvancedAnalyticsStore((state) => state.setAutoRun);
  const setSelectedItem = useAdvancedAnalyticsStore((state) => state.setSelectedItem);
  const addMetric = useAdvancedAnalyticsStore((state) => state.addMetric);
  const updateMetric = useAdvancedAnalyticsStore((state) => state.updateMetric);
  const removeMetric = useAdvancedAnalyticsStore((state) => state.removeMetric);
  const addStreak = useAdvancedAnalyticsStore((state) => state.addStreak);
  const updateStreak = useAdvancedAnalyticsStore((state) => state.updateStreak);
  const removeStreak = useAdvancedAnalyticsStore((state) => state.removeStreak);
  const addChart = useAdvancedAnalyticsStore((state) => state.addChart);
  const updateChart = useAdvancedAnalyticsStore((state) => state.updateChart);
  const removeChart = useAdvancedAnalyticsStore((state) => state.removeChart);

  const [response, setResponse] = useState<AdvancedAnalyticsRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdvancedAnalyticsTab>('view');

  useEffect(() => {
    if (selectedItem) {
      return;
    }
    if (metrics[0]) {
      setSelectedItem({ kind: 'metric', id: metrics[0].id });
      return;
    }
    if (streaks[0]) {
      setSelectedItem({ kind: 'streak', id: streaks[0].id });
      return;
    }
    if (charts[0]) {
      setSelectedItem({ kind: 'chart', id: charts[0].id });
    }
  }, [charts, metrics, selectedItem, setSelectedItem, streaks]);

  const resolvedRange = useMemo(
    () => resolveTimeRange(timeRangePreset, customStartDate, customEndDate),
    [customEndDate, customStartDate, timeRangePreset]
  );

  const request = useMemo<AdvancedAnalyticsRunRequest>(
    () => ({
      startDate: resolvedRange.startDate,
      endDate: resolvedRange.endDate,
      metrics,
      streaks,
      charts
    }),
    [charts, metrics, resolvedRange.endDate, resolvedRange.startDate, streaks]
  );
  const requestKey = useMemo(() => JSON.stringify(request), [request]);

  const validationIssues = useMemo(
    () => validateAdvancedAnalyticsDefinitions({ metrics, streaks, charts }),
    [charts, metrics, streaks]
  );
  const viewTabMetrics = useMemo(
    () => metrics.filter((metric) => metric.showInView !== false),
    [metrics]
  );

  const selectedIssues = useMemo(() => {
    if (!selectedItem) {
      return validationIssues;
    }
    return validationIssues.filter(
      (issue) => issue.scope === 'global' || (issue.id != null && issue.id === selectedItem.id)
    );
  }, [selectedItem, validationIssues]);

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
  }, [autoRun, requestKey]);

  const selectedMetric =
    selectedItem?.kind === 'metric' ? metrics.find((metric) => metric.id === selectedItem.id) : undefined;
  const selectedStreak =
    selectedItem?.kind === 'streak' ? streaks.find((streak) => streak.id === selectedItem.id) : undefined;
  const selectedChart =
    selectedItem?.kind === 'chart' ? charts.find((chart) => chart.id === selectedItem.id) : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Analytics</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">Advanced Analytics</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Build custom metrics, formula metrics, streaks, and chart views from your local activity
            data.
          </p>
        </div>

        <section className="rounded-xl border border-border bg-panel p-4">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_auto_auto_auto_auto_1fr] lg:items-end">
            <label className="space-y-1 text-sm">
              <span className="text-muted">Time range</span>
              <select
                value={timeRangePreset}
                onChange={(event) =>
                  setTimeRangePreset(
                    event.target.value as 'all' | '30d' | '90d' | '365d' | 'custom'
                  )
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
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Recompute
            </button>

            <div className="text-xs text-muted lg:text-right">
              Using HR zones from Settings:
              <span className="ml-1 font-medium text-foreground">
                {(settings?.heartRateZoneUpperBoundsBpm ?? [120, 140, 160, 180]).join(' / ')} bpm
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-2">
          <div className="inline-flex rounded-lg border border-border bg-bg/40 p-1">
            {(['view', 'configure'] as const).map((tab) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    active
                      ? 'bg-accent text-white'
                      : 'text-muted hover:bg-bg hover:text-foreground'
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">
            {activeTab === 'configure'
              ? 'Create and edit analytics definitions. Metrics can be hidden from the View tab.'
              : 'See all analytics results at a glance. Only metrics marked for display appear in the metrics section.'}
          </p>
        </section>
      </header>

      {activeTab === 'configure' ? (
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <AnalyticsLibrary
            metrics={metrics}
            streaks={streaks}
            charts={charts}
            selectedItem={selectedItem}
            onSelect={setSelectedItem}
            onAddMetric={() => addMetric('base')}
            onAddFormulaMetric={() => addMetric('formula')}
            onAddStreak={addStreak}
            onAddChart={addChart}
          />

          <div className="space-y-4">
            {selectedIssues.length > 0 ? (
              <section className="rounded-xl border border-border bg-panel p-4">
                <h3 className="text-sm font-semibold text-foreground">Validation</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                  {selectedIssues.map((issue, index) => (
                    <li key={`${issue.scope}-${issue.id ?? 'global'}-${index}`}>{issue.message}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selectedMetric ? (
              <MetricBuilder
                metric={selectedMetric}
                allMetrics={metrics}
                onChange={(metric) => updateMetric(metric.id, () => metric)}
                onDelete={() => removeMetric(selectedMetric.id)}
              />
            ) : null}

            {selectedStreak ? (
              <StreakBuilder
                streak={selectedStreak}
                metrics={metrics}
                onChange={(streak) => updateStreak(streak.id, () => streak)}
                onDelete={() => removeStreak(selectedStreak.id)}
              />
            ) : null}

            {selectedChart ? (
              <ChartBuilder
                chart={selectedChart}
                metrics={metrics}
                onChange={(chart) => updateChart(chart.id, () => chart)}
                onDelete={() => removeChart(selectedChart.id)}
              />
            ) : null}

            <AnalyticsPreview
              selectedItem={selectedItem}
              metrics={metrics}
              streaks={streaks}
              charts={charts}
              response={response}
              loading={loading}
              error={runError}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {metrics.length > 0 && viewTabMetrics.length === 0 ? (
            <section className="rounded-xl border border-border bg-panel p-4 text-sm text-muted">
              No metrics are enabled for this tab. Open the Configure tab and enable{' '}
              <span className="font-medium text-foreground">Show in View tab</span> on any metric.
            </section>
          ) : null}

          <AnalyticsPreview
            mode="overview"
            overviewMetricIds={viewTabMetrics.map((metric) => metric.id)}
            selectedItem={selectedItem}
            metrics={metrics}
            streaks={streaks}
            charts={charts}
            response={response}
            loading={loading}
            error={runError}
          />
        </div>
      )}
    </div>
  );
}
