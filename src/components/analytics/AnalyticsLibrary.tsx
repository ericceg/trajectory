import type {
  AdvancedAnalyticsChartDefinition,
  AdvancedAnalyticsMetricDefinition,
  AdvancedAnalyticsStreakDefinition
} from '@/types';
import type { AdvancedAnalyticsSelection } from '@/store/useAdvancedAnalyticsStore';

interface AnalyticsLibraryProps {
  metrics: AdvancedAnalyticsMetricDefinition[];
  streaks: AdvancedAnalyticsStreakDefinition[];
  charts: AdvancedAnalyticsChartDefinition[];
  selectedItem: AdvancedAnalyticsSelection;
  onSelect: (selection: AdvancedAnalyticsSelection) => void;
  showActions?: boolean;
  onAddMetric: () => void;
  onAddFormulaMetric: () => void;
  onAddStreak: () => void;
  onAddChart: () => void;
}

function LibrarySection({
  title,
  children,
  actionLabel,
  onAction
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-panel p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-foreground hover:border-accent"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function LibraryItem({
  label,
  sublabel,
  active,
  onClick
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? 'border-accent bg-accent/10 text-foreground'
          : 'border-border bg-bg/30 text-foreground hover:border-accent/50'
      }`}
    >
      <div className="truncate text-sm font-medium">{label || 'Untitled'}</div>
      {sublabel ? <div className="truncate text-xs text-muted">{sublabel}</div> : null}
    </button>
  );
}

export function AnalyticsLibrary({
  metrics,
  streaks,
  charts,
  selectedItem,
  onSelect,
  showActions = true,
  onAddMetric,
  onAddFormulaMetric,
  onAddStreak,
  onAddChart
}: AnalyticsLibraryProps) {
  const baseMetrics = metrics.filter((metric) => metric.kind === 'base');
  const formulaMetrics = metrics.filter((metric) => metric.kind === 'formula');

  return (
    <div className="space-y-4">
      <LibrarySection
        title="Metrics"
        actionLabel={showActions ? '+ Metric' : undefined}
        onAction={showActions ? onAddMetric : undefined}
      >
        {baseMetrics.length === 0 ? (
          <p className="text-xs text-muted">No custom metrics yet.</p>
        ) : (
          baseMetrics.map((metric) => (
            <LibraryItem
              key={metric.id}
              label={metric.name}
              sublabel={metric.base?.measure}
              active={selectedItem?.kind === 'metric' && selectedItem.id === metric.id}
              onClick={() => onSelect({ kind: 'metric', id: metric.id })}
            />
          ))
        )}
      </LibrarySection>

      <LibrarySection
        title="Formula Metrics"
        actionLabel={showActions ? '+ Formula' : undefined}
        onAction={showActions ? onAddFormulaMetric : undefined}
      >
        {formulaMetrics.length === 0 ? (
          <p className="text-xs text-muted">No formula metrics yet.</p>
        ) : (
          formulaMetrics.map((metric) => (
            <LibraryItem
              key={metric.id}
              label={metric.name}
              sublabel={metric.formula?.operator}
              active={selectedItem?.kind === 'metric' && selectedItem.id === metric.id}
              onClick={() => onSelect({ kind: 'metric', id: metric.id })}
            />
          ))
        )}
      </LibrarySection>

      <LibrarySection
        title="Streaks"
        actionLabel={showActions ? '+ Streak' : undefined}
        onAction={showActions ? onAddStreak : undefined}
      >
        {streaks.length === 0 ? (
          <p className="text-xs text-muted">No streaks yet.</p>
        ) : (
          streaks.map((streak) => (
            <LibraryItem
              key={streak.id}
              label={streak.name}
              sublabel={`${streak.period} ${streak.thresholdOperator} ${streak.thresholdValue}`}
              active={selectedItem?.kind === 'streak' && selectedItem.id === streak.id}
              onClick={() => onSelect({ kind: 'streak', id: streak.id })}
            />
          ))
        )}
      </LibrarySection>

      <LibrarySection
        title="Chart Views"
        actionLabel={showActions ? '+ Chart' : undefined}
        onAction={showActions ? onAddChart : undefined}
      >
        {charts.length === 0 ? (
          <p className="text-xs text-muted">No chart views yet.</p>
        ) : (
          charts.map((chart) => (
            <LibraryItem
              key={chart.id}
              label={chart.name}
              sublabel={`${chart.chartType} · ${chart.granularity}`}
              active={selectedItem?.kind === 'chart' && selectedItem.id === chart.id}
              onClick={() => onSelect({ kind: 'chart', id: chart.id })}
            />
          ))
        )}
      </LibrarySection>
    </div>
  );
}
