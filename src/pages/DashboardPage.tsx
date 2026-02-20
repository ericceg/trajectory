import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfToday,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays
} from 'date-fns';

import { listActivities } from '@/lib/tauri';
import { formatDateTime, formatDistanceKm, formatDuration } from '@/lib/format';
import { MetricCard } from '@/components/MetricCard';
import { useAppStore } from '@/store/useAppStore';
import type { ActivitySummary } from '@/types';

type CalendarMode = 'year' | 'month';
type CalendarBarMetric = 'durationHours' | 'distanceKm' | 'activities';

interface AggregateTotals {
  durationHours: number;
  distanceKm: number;
  activities: number;
}

interface MonthBucket {
  totals: AggregateTotals;
  dailyTotals: Map<string, AggregateTotals>;
  activitiesByDay: Map<string, ActivitySummary[]>;
}

interface SummaryTotals {
  totalDistanceM: number;
  totalTimeS: number;
  totalElevationM: number;
  activityCount: number;
}

const ZERO_TOTALS: AggregateTotals = {
  durationHours: 0,
  distanceKm: 0,
  activities: 0
};

const CALENDAR_METRIC_OPTIONS: Array<{ metric: CalendarBarMetric; label: string }> = [
  { metric: 'durationHours', label: 'Hours' },
  { metric: 'distanceKm', label: 'Kilometers' },
  { metric: 'activities', label: 'Activities' }
];

const WEEKDAY_HEADERS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const createTotals = (): AggregateTotals => ({
  durationHours: 0,
  distanceKm: 0,
  activities: 0
});

const addToTotals = (target: AggregateTotals, activity: ActivitySummary) => {
  target.durationHours += activity.durationSeconds / 3600;
  target.distanceKm += activity.distanceM / 1000;
  target.activities += 1;
};

const summarizeActivities = (activities: ActivitySummary[]): SummaryTotals =>
  activities.reduce(
    (totals, activity) => {
      totals.totalDistanceM += activity.distanceM;
      totals.totalTimeS += activity.durationSeconds;
      totals.totalElevationM += activity.elevationGainM;
      totals.activityCount += 1;
      return totals;
    },
    {
      totalDistanceM: 0,
      totalTimeS: 0,
      totalElevationM: 0,
      activityCount: 0
    }
  );

const metricValue = (totals: AggregateTotals, metric: CalendarBarMetric) => totals[metric];

const formatCalendarMetric = (metric: CalendarBarMetric, value: number) => {
  switch (metric) {
    case 'durationHours':
      return value.toFixed(1);
    case 'distanceKm':
      return value.toFixed(1);
    case 'activities':
      return `${Math.round(value)}`;
    default:
      return `${value}`;
  }
};

const formatCalendarMetricWithUnit = (metric: CalendarBarMetric, value: number) => {
  switch (metric) {
    case 'durationHours':
      return `${value.toFixed(1)} h`;
    case 'distanceKm':
      return `${value.toFixed(1)} km`;
    case 'activities':
      return `${Math.round(value)} act`;
    default:
      return `${value}`;
  }
};

const activityScoreForMetric = (activity: ActivitySummary, metric: CalendarBarMetric) => {
  switch (metric) {
    case 'durationHours':
      return activity.durationSeconds;
    case 'distanceKm':
      return activity.distanceM;
    case 'activities':
      return activity.durationSeconds;
    default:
      return 0;
  }
};

const selectPrimaryActivity = (activities: ActivitySummary[], metric: CalendarBarMetric) => {
  if (!activities.length) {
    return null;
  }

  return activities.reduce((best, current) =>
    activityScoreForMetric(current, metric) > activityScoreForMetric(best, metric) ? current : best
  );
};

const weekLabel = (weekStart: Date) => {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
};

const SparkBars = ({
  values,
  ariaLabel,
  tone = 'strong',
  interactive = false,
  activeIndex = null,
  activeIndices,
  pulseTick = 0,
  onActiveIndexChange,
  renderActivePopover
}: {
  values: number[];
  ariaLabel: string;
  tone?: 'strong' | 'muted';
  interactive?: boolean;
  activeIndex?: number | null;
  activeIndices?: number[];
  pulseTick?: number;
  onActiveIndexChange?: (index: number | null) => void;
  renderActivePopover?: (index: number) => ReactNode;
}) => {
  const maxValue = values.reduce((max, value) => Math.max(max, value), 0);
  const barClass = tone === 'strong' ? 'bg-accent' : 'bg-foreground/70';
  const activePopClass = pulseTick % 2 === 0 ? 'calendar-pop-a' : 'calendar-pop-b';
  const popoverLeft = activeIndex == null || values.length === 0 ? '0%' : `${((activeIndex + 0.5) / values.length) * 100}%`;
  const activeIndicesSet = useMemo(() => new Set(activeIndices ?? []), [activeIndices]);

  return (
    <div
      className="relative"
      onMouseLeave={() => onActiveIndexChange?.(null)}
      role={interactive ? 'group' : 'img'}
      aria-label={ariaLabel}
    >
      <div className="flex h-12 items-end gap-px">
        {values.map((value, index) => {
          const ratio = maxValue > 0 ? value / maxValue : 0;
          const height = value > 0 ? Math.max(ratio * 100, 10) : 6;
          const active = activeIndex === index || activeIndicesSet.has(index);
          const sharedClass = `min-w-[2px] flex-1 rounded-sm transition-all duration-200 ${barClass} ${
            value > 0 ? 'opacity-100' : 'opacity-20'
          } ${active ? `${activePopClass} -translate-y-0.5 scale-x-[1.06] shadow-[0_10px_18px_-12px_rgba(252,76,2,0.95)]` : ''}`;

          if (interactive) {
            return (
              <button
                key={`${ariaLabel}-${index}`}
                type="button"
                onMouseEnter={() => onActiveIndexChange?.(index)}
                onFocus={() => onActiveIndexChange?.(index)}
                onBlur={() => onActiveIndexChange?.(null)}
                className={`${sharedClass} appearance-none cursor-pointer border-0 p-0 focus-visible:outline-none`}
                style={{ height: `${height}%` }}
                aria-label={`${ariaLabel} bar ${index + 1}`}
              />
            );
          }

          return (
            <span
              key={`${ariaLabel}-${index}`}
              className={sharedClass}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      {interactive && activeIndex != null && renderActivePopover ? (
        <div
          className="pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full"
          style={{ left: popoverLeft }}
        >
          <div className={`calendar-hover-popover ${activePopClass}`}>{renderActivePopover(activeIndex)}</div>
        </div>
      ) : null}
    </div>
  );
};

export function DashboardPage() {
  const scanDone = useAppStore((state) => state.scanDone);

  const [mode, setMode] = useState<CalendarMode>('year');
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => new Date().getMonth());
  const [barMetric, setBarMetric] = useState<CalendarBarMetric>('durationHours');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoverPulseTick, setHoverPulseTick] = useState(0);

  const [yearActivities, setYearActivities] = useState<ActivitySummary[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const [weeklySummary, setWeeklySummary] = useState<SummaryTotals | null>(null);
  const [yearlySummary, setYearlySummary] = useState<SummaryTotals | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const selectedMonthDate = useMemo(
    () => new Date(selectedYear, selectedMonthIndex, 1),
    [selectedYear, selectedMonthIndex]
  );

  useEffect(() => {
    setHoveredBarIndex(null);
  }, [mode, selectedYear, selectedMonthIndex, barMetric]);

  useEffect(() => {
    let cancelled = false;

    const loadSummaryCards = async () => {
      try {
        setSummaryError(null);
        const today = startOfToday();
        const weekStart = subDays(today, 6);
        const yearStart = new Date(today.getFullYear(), 0, 1);
        const [weekActivities, yearActivities] = await Promise.all([
          listActivities({
            startDate: format(weekStart, 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
          }),
          listActivities({
            startDate: format(yearStart, 'yyyy-MM-dd'),
            endDate: format(today, 'yyyy-MM-dd')
          })
        ]);

        if (!cancelled) {
          setWeeklySummary(summarizeActivities(weekActivities));
          setYearlySummary(summarizeActivities(yearActivities));
        }
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void loadSummaryCards();

    return () => {
      cancelled = true;
    };
  }, [scanDone]);

  useEffect(() => {
    let cancelled = false;

    const loadYearActivities = async () => {
      try {
        setCalendarLoading(true);
        setCalendarError(null);
        setYearActivities([]);
        const startDate = `${selectedYear}-01-01`;
        const endDate = `${selectedYear}-12-31`;
        const activities = await listActivities({ startDate, endDate });

        if (!cancelled) {
          setYearActivities(activities);
        }
      } catch (err) {
        if (!cancelled) {
          setCalendarError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setCalendarLoading(false);
        }
      }
    };

    void loadYearActivities();

    return () => {
      cancelled = true;
    };
  }, [selectedYear, scanDone]);

  const calendarData = useMemo(() => {
    const monthBuckets: MonthBucket[] = Array.from({ length: 12 }, () => ({
      totals: createTotals(),
      dailyTotals: new Map<string, AggregateTotals>(),
      activitiesByDay: new Map<string, ActivitySummary[]>()
    }));
    const weeklyTotals = new Map<string, AggregateTotals>();
    const weeklyActivities = new Map<string, ActivitySummary[]>();
    const yearTotals = createTotals();

    for (const activity of yearActivities) {
      const activityDate = parseISO(activity.activityStart);
      const monthIndex = activityDate.getMonth();
      const dayKey = format(activityDate, 'yyyy-MM-dd');
      const weekKey = format(startOfWeek(activityDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      addToTotals(yearTotals, activity);

      const monthBucket = monthBuckets[monthIndex];
      addToTotals(monthBucket.totals, activity);

      const dayTotals = monthBucket.dailyTotals.get(dayKey) ?? createTotals();
      addToTotals(dayTotals, activity);
      monthBucket.dailyTotals.set(dayKey, dayTotals);

      const dayActivities = monthBucket.activitiesByDay.get(dayKey) ?? [];
      dayActivities.push(activity);
      monthBucket.activitiesByDay.set(dayKey, dayActivities);

      const weekTotals = weeklyTotals.get(weekKey) ?? createTotals();
      addToTotals(weekTotals, activity);
      weeklyTotals.set(weekKey, weekTotals);

      const weekActivities = weeklyActivities.get(weekKey) ?? [];
      weekActivities.push(activity);
      weeklyActivities.set(weekKey, weekActivities);
    }

    for (const monthBucket of monthBuckets) {
      for (const [dayKey, dayActivities] of monthBucket.activitiesByDay.entries()) {
        monthBucket.activitiesByDay.set(
          dayKey,
          dayActivities.sort((a, b) => a.activityStart.localeCompare(b.activityStart))
        );
      }
    }

    for (const [weekKey, weekActivities] of weeklyActivities.entries()) {
      weeklyActivities.set(
        weekKey,
        weekActivities.sort((a, b) => a.activityStart.localeCompare(b.activityStart))
      );
    }

    return { monthBuckets, weeklyTotals, weeklyActivities, yearTotals };
  }, [yearActivities]);

  const monthSummaries = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const monthDate = new Date(selectedYear, monthIndex, 1);
        const monthEnd = endOfMonth(monthDate);
        const daysInMonth = Number(format(monthEnd, 'd'));
        const monthBucket = calendarData.monthBuckets[monthIndex];

        const dayValues = Array.from({ length: daysInMonth }, (_, dayOffset) => {
          const day = new Date(selectedYear, monthIndex, dayOffset + 1);
          const dayKey = format(day, 'yyyy-MM-dd');
          return metricValue(monthBucket.dailyTotals.get(dayKey) ?? ZERO_TOTALS, barMetric);
        });

        return {
          monthIndex,
          totals: monthBucket.totals,
          dayValues,
          activeDays: monthBucket.activitiesByDay.size
        };
      }),
    [barMetric, calendarData.monthBuckets, selectedYear]
  );

  const yearWeekStarts = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = new Date(selectedYear, 11, 31);
    return eachWeekOfInterval(
      {
        start: startOfWeek(yearStart, { weekStartsOn: 1 }),
        end: endOfWeek(yearEnd, { weekStartsOn: 1 })
      },
      { weekStartsOn: 1 }
    );
  }, [selectedYear]);

  const yearBarValues = useMemo(
    () =>
      yearWeekStarts.map((weekStart) => {
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        return metricValue(calendarData.weeklyTotals.get(weekKey) ?? ZERO_TOTALS, barMetric);
      }),
    [barMetric, calendarData.weeklyTotals, yearWeekStarts]
  );

  const selectedMonthBucket = calendarData.monthBuckets[selectedMonthIndex];
  const selectedMonthTotals = selectedMonthBucket?.totals ?? ZERO_TOTALS;
  const selectedMonthBars = monthSummaries[selectedMonthIndex]?.dayValues ?? [];
  const activeTotals = mode === 'year' ? calendarData.yearTotals : selectedMonthTotals;
  const activeBars = mode === 'year' ? yearBarValues : selectedMonthBars;
  const activityMap = selectedMonthBucket?.activitiesByDay ?? new Map<string, ActivitySummary[]>();
  const seriesLabel = mode === 'year' ? `${activeBars.length} weeks` : `${activeBars.length} days`;
  const hoveredWeekStart = mode === 'year' && hoveredBarIndex != null ? yearWeekStarts[hoveredBarIndex] ?? null : null;
  const hoveredWeekDaysByMonth = useMemo(() => {
    if (mode !== 'year' || !hoveredWeekStart) {
      return new Map<number, number[]>();
    }

    const weekDays = eachDayOfInterval({
      start: hoveredWeekStart,
      end: endOfWeek(hoveredWeekStart, { weekStartsOn: 1 })
    });
    const indicesByMonth = new Map<number, number[]>();

    for (const day of weekDays) {
      if (day.getFullYear() !== selectedYear) {
        continue;
      }
      const monthIndex = day.getMonth();
      const dayIndex = day.getDate() - 1;
      const existing = indicesByMonth.get(monthIndex) ?? [];
      existing.push(dayIndex);
      indicesByMonth.set(monthIndex, existing);
    }

    return indicesByMonth;
  }, [hoveredWeekStart, mode, selectedYear]);
  const hoveredDayKey =
    mode === 'month' && hoveredBarIndex != null
      ? format(new Date(selectedYear, selectedMonthIndex, hoveredBarIndex + 1), 'yyyy-MM-dd')
      : null;

  const monthGridDays = useMemo(() => {
    const monthStart = startOfMonth(selectedMonthDate);
    const monthEnd = endOfMonth(selectedMonthDate);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 })
    });
  }, [selectedMonthDate]);

  const shiftYear = (direction: -1 | 1) => {
    setSelectedYear((value) => value + direction);
    setMode('year');
  };

  const shiftMonth = (direction: -1 | 1) => {
    const shifted = addMonths(selectedMonthDate, direction);
    setSelectedYear(shifted.getFullYear());
    setSelectedMonthIndex(shifted.getMonth());
    setMode('month');
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">Training Overview</h2>
      </header>

      {summaryError ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{summaryError}</p> : null}
      {calendarError ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{calendarError}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Weekly Distance"
          value={formatDistanceKm(weeklySummary?.totalDistanceM ?? 0)}
          subLabel={`${weeklySummary?.activityCount ?? 0} activities`}
        />
        <MetricCard
          label="Weekly Time"
          value={formatDuration(weeklySummary?.totalTimeS ?? 0)}
          subLabel="Last 7 days"
        />
        <MetricCard
          label="Year-to-Date Distance"
          value={formatDistanceKm(yearlySummary?.totalDistanceM ?? 0)}
          subLabel={`${yearlySummary?.activityCount ?? 0} activities`}
        />
        <MetricCard
          label="Year-to-Date Elevation"
          value={`${Math.round(yearlySummary?.totalElevationM ?? 0)} m`}
        />
      </div>

      <section className="rounded-xl border border-border bg-panel p-5 shadow-card">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-3xl font-semibold text-foreground">Training Calendar</h3>
            {mode === 'year' ? (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-muted hover:text-foreground"
                  onClick={() => shiftYear(-1)}
                >
                  &lt;
                </button>
                <span className="font-semibold text-foreground">{selectedYear}</span>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-muted hover:text-foreground"
                  onClick={() => shiftYear(1)}
                >
                  &gt;
                </button>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-muted hover:text-foreground"
                  onClick={() => setMode('year')}
                >
                  {selectedYear}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-muted hover:text-foreground"
                  onClick={() => shiftMonth(-1)}
                >
                  &lt;
                </button>
                <span className="font-semibold uppercase text-foreground">
                  {format(selectedMonthDate, 'MMM')}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-muted hover:text-foreground"
                  onClick={() => shiftMonth(1)}
                >
                  &gt;
                </button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-2xl">
            <div className="flex min-h-16 items-end gap-3">
              <div className="min-w-0 flex-1">
                <SparkBars
                  values={activeBars}
                  ariaLabel={`Calendar bars for ${
                    mode === 'year' ? `${selectedYear}` : format(selectedMonthDate, 'MMMM yyyy')
                  }`}
                  interactive
                  activeIndex={hoveredBarIndex}
                  pulseTick={hoverPulseTick}
                  onActiveIndexChange={(index) => {
                    if (index == null) {
                      setHoveredBarIndex(null);
                      return;
                    }
                    setHoveredBarIndex(index);
                    setHoverPulseTick((tick) => tick + 1);
                  }}
                  renderActivePopover={(index) => {
                    const hoverValue = activeBars[index] ?? 0;

                    if (mode === 'year') {
                      const weekStart = yearWeekStarts[index];
                      if (!weekStart) {
                        return null;
                      }
                      const weekKey = format(weekStart, 'yyyy-MM-dd');
                      const weekActivities = calendarData.weeklyActivities.get(weekKey) ?? [];
                      const topActivity = selectPrimaryActivity(weekActivities, barMetric);

                      return (
                        <>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                            Week · {weekLabel(weekStart)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {formatCalendarMetricWithUnit(barMetric, hoverValue)}
                          </p>
                          {topActivity ? (
                            <p className="mt-1 text-[11px] text-muted">
                              {topActivity.category} · {formatDateTime(topActivity.activityStart)}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] text-muted">No workouts</p>
                          )}
                        </>
                      );
                    }

                    const hoverDate = new Date(selectedYear, selectedMonthIndex, index + 1);
                    const hoverKey = format(hoverDate, 'yyyy-MM-dd');
                    const hoverActivities = activityMap.get(hoverKey) ?? [];
                    const topActivity = selectPrimaryActivity(hoverActivities, barMetric);

                    return (
                      <>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">
                          {format(hoverDate, 'EEE, MMM d')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {formatCalendarMetricWithUnit(barMetric, hoverValue)}
                        </p>
                        {topActivity ? (
                          <p className="mt-1 text-[11px] text-muted">
                            {topActivity.category} · {formatDuration(topActivity.durationSeconds)} ·{' '}
                            {formatDistanceKm(topActivity.distanceM)}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted">No workouts</p>
                        )}
                      </>
                    );
                  }}
                />
              </div>
              <p className="whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-muted">
                {seriesLabel}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {CALENDAR_METRIC_OPTIONS.map((option) => {
                const active = barMetric === option.metric;
                const value = formatCalendarMetric(option.metric, metricValue(activeTotals, option.metric));

                return (
                  <button
                    key={option.metric}
                    type="button"
                    onClick={() => setBarMetric(option.metric)}
                    className={`rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border bg-bg/30 text-muted hover:text-foreground'
                    }`}
                  >
                    <p className={`text-2xl font-semibold ${active ? 'text-accent' : 'text-foreground'}`}>
                      {value}
                    </p>
                    <p className="text-xs uppercase tracking-[0.14em]">{option.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {calendarLoading ? <p className="mt-4 text-sm text-muted">Loading calendar...</p> : null}

        {mode === 'year' ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {monthSummaries.map((monthSummary) => {
              const monthDate = new Date(selectedYear, monthSummary.monthIndex, 1);
              const monthLabel = format(monthDate, 'MMM');
              const metricDisplay = formatCalendarMetric(
                barMetric,
                metricValue(monthSummary.totals, barMetric)
              );
              const hoveredWeekIndices = hoveredWeekDaysByMonth.get(monthSummary.monthIndex) ?? [];
              const yearHoveredMonth = mode === 'year' && hoveredWeekIndices.length > 0;
              const yearPopClass = hoverPulseTick % 2 === 0 ? 'calendar-pop-a' : 'calendar-pop-b';

              return (
                <button
                  key={monthSummary.monthIndex}
                  type="button"
                  onClick={() => {
                    setSelectedMonthIndex(monthSummary.monthIndex);
                    setMode('month');
                  }}
                  className={`rounded-lg border border-border bg-bg/30 p-3 text-left transition hover:border-accent/40 hover:bg-accent/5 ${
                    yearHoveredMonth
                      ? `relative z-10 -translate-y-0.5 border-accent bg-accent/10 shadow-[0_14px_26px_-20px_rgba(252,76,2,0.9)] ${yearPopClass}`
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-base font-semibold uppercase text-foreground">{monthLabel}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted">
                      {monthSummary.activeDays} days
                    </p>
                  </div>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{metricDisplay}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted">
                    {CALENDAR_METRIC_OPTIONS.find((option) => option.metric === barMetric)?.label}
                  </p>
                  <div className="mt-3">
                    <SparkBars
                      values={monthSummary.dayValues}
                      ariaLabel={`${monthLabel} daily bars`}
                      tone="muted"
                      activeIndices={yearHoveredMonth ? hoveredWeekIndices : undefined}
                      pulseTick={hoverPulseTick}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5">
            <div className="grid grid-cols-7 rounded-t-lg border border-border bg-bg/40">
              {WEEKDAY_HEADERS.map((day) => (
                <p
                  key={day}
                  className="border-r border-border px-2 py-2 text-center text-[10px] uppercase tracking-[0.14em] text-muted last:border-r-0"
                >
                  {day}
                </p>
              ))}
            </div>
            <div className="grid grid-cols-7 border-x border-b border-border">
              {monthGridDays.map((day) => {
                const inCurrentMonth = isSameMonth(day, selectedMonthDate);
                const dayKey = format(day, 'yyyy-MM-dd');
                const dayActivities = inCurrentMonth ? activityMap.get(dayKey) ?? [] : [];
                const hoveredDay = inCurrentMonth && hoveredDayKey === dayKey;
                const popClass = hoverPulseTick % 2 === 0 ? 'calendar-pop-a' : 'calendar-pop-b';
                const visibleActivities = dayActivities.slice(0, 3);
                const hiddenCount = Math.max(0, dayActivities.length - visibleActivities.length);

                return (
                  <div
                    key={dayKey}
                    className={`min-h-[140px] border-r border-t border-border p-2 text-xs transition-[background-color,box-shadow,transform] duration-200 last:border-r-0 ${
                      inCurrentMonth ? 'bg-bg/20' : 'bg-bg/10 text-muted/40'
                    } ${
                      hoveredDay
                        ? `relative z-10 -translate-y-0.5 bg-accent/10 shadow-[0_12px_24px_-18px_rgba(252,76,2,0.95)] ${popClass}`
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={inCurrentMonth ? 'text-muted' : 'text-muted/40'}>
                        {format(day, 'd')}
                      </span>
                      {dayActivities.length ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            hoveredDay ? 'bg-accent text-white' : 'bg-accent/15 text-accent'
                          }`}
                        >
                          {dayActivities.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 space-y-1">
                      {visibleActivities.map((activity) => {
                        return (
                          <Link
                            key={activity.id}
                            to={`/activities/${activity.id}`}
                            title={`${formatDateTime(activity.activityStart)} · ${formatDistanceKm(
                              activity.distanceM
                            )} · ${formatDuration(activity.durationSeconds)}`}
                            className={`block truncate rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                              hoveredDay
                                ? `${popClass} bg-accent text-white shadow-[0_10px_18px_-14px_rgba(252,76,2,0.95)]`
                                : 'bg-accent/10 text-accent hover:bg-accent/20'
                            }`}
                          >
                            {activity.category}
                          </Link>
                        );
                      })}
                      {hiddenCount > 0 ? (
                        <p className="text-[10px] text-muted">+{hiddenCount} more</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
