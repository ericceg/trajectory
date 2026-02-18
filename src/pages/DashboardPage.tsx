import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek
} from 'date-fns';

import { getStats, listActivities } from '@/lib/tauri';
import { formatDateTime, formatDistanceKm, formatDuration } from '@/lib/format';
import { MetricCard } from '@/components/MetricCard';
import { MonthCalendar } from '@/components/MonthCalendar';
import { ScanStatusCard } from '@/components/ScanStatusCard';
import { useAppStore } from '@/store/useAppStore';
import type { ActivitySummary, StatsResponse } from '@/types';

export function DashboardPage() {
  const scanning = useAppStore((state) => state.scanning);
  const scanProgress = useAppStore((state) => state.scanProgress);
  const scanDone = useAppStore((state) => state.scanDone);

  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [monthActivities, setMonthActivities] = useState<ActivitySummary[]>([]);
  const [dayActivities, setDayActivities] = useState<ActivitySummary[]>([]);
  const [recentActivities, setRecentActivities] = useState<ActivitySummary[]>([]);
  const [weekStats, setWeekStats] = useState<StatsResponse | null>(null);
  const [yearStats, setYearStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setError(null);
        const [week, year, recent] = await Promise.all([
          getStats('week'),
          getStats('year'),
          listActivities()
        ]);
        setWeekStats(week);
        setYearStats(year);
        setRecentActivities(recent.slice(0, 8));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void load();
  }, [scanDone]);

  useEffect(() => {
    const loadMonth = async () => {
      try {
        const startDate = format(startOfMonth(month), 'yyyy-MM-dd');
        const endDate = format(endOfMonth(month), 'yyyy-MM-dd');
        const activities = await listActivities({ startDate, endDate });
        setMonthActivities(activities);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadMonth();
  }, [month, scanDone]);

  useEffect(() => {
    if (!selectedDay) {
      setDayActivities([]);
      return;
    }

    const loadDay = async () => {
      try {
        const activities = await listActivities({ day: selectedDay });
        setDayActivities(activities);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    void loadDay();
  }, [selectedDay]);

  const weeklyRollups = useMemo(() => {
    const byWeek: Record<string, { distance: number; duration: number }> = {};

    for (const activity of monthActivities) {
      const weekKey = format(
        startOfWeek(parseISO(activity.activityStart), { weekStartsOn: 1 }),
        'yyyy-MM-dd'
      );

      if (!byWeek[weekKey]) {
        byWeek[weekKey] = { distance: 0, duration: 0 };
      }

      byWeek[weekKey].distance += activity.distanceM;
      byWeek[weekKey].duration += activity.durationSeconds;
    }

    return Object.entries(byWeek)
      .map(([weekStart, values]) => ({ weekStart, ...values }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [monthActivities]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Dashboard</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Training Overview</h2>
      </header>

      {error ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Weekly Distance"
          value={formatDistanceKm(weekStats?.totalDistanceM ?? 0)}
          subLabel={`${weekStats?.activityCount ?? 0} activities`}
        />
        <MetricCard
          label="Weekly Time"
          value={formatDuration(weekStats?.totalTimeS ?? 0)}
          subLabel="Last 7 days"
        />
        <MetricCard
          label="Year-to-Date Distance"
          value={formatDistanceKm(yearStats?.totalDistanceM ?? 0)}
          subLabel={`${yearStats?.activityCount ?? 0} activities`}
        />
        <MetricCard
          label="Year-to-Date Elevation"
          value={`${Math.round(yearStats?.totalElevationM ?? 0)} m`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <MonthCalendar
          month={month}
          activities={monthActivities}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onMonthChange={setMonth}
        />

        <div className="space-y-4">
          <ScanStatusCard scanning={scanning} progress={scanProgress} done={scanDone} />
          <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
            <h3 className="text-lg font-semibold text-white">Weekly Rollups</h3>
            <div className="mt-3 space-y-2 text-sm text-muted">
              {weeklyRollups.slice(0, 6).map((rollup) => (
                <div key={rollup.weekStart} className="rounded-md border border-border bg-bg/40 p-3">
                  <p className="text-xs uppercase tracking-[0.12em]">
                    Week of {rollup.weekStart}
                  </p>
                  <p className="mt-1 text-white">{formatDistanceKm(rollup.distance)}</p>
                  <p>{formatDuration(rollup.duration)}</p>
                </div>
              ))}
              {weeklyRollups.length === 0 ? <p>No activities in this month.</p> : null}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">
            {selectedDay ? `Activities on ${selectedDay}` : 'Select a day in calendar'}
          </h3>
          <div className="mt-3 space-y-2 text-sm text-muted">
            {dayActivities.map((activity) => (
              <Link
                key={activity.id}
                to={`/activities/${activity.id}`}
                className="block rounded-md border border-border bg-bg/40 p-3 hover:border-accent/50"
              >
                <p className="text-white">{activity.sportType}</p>
                <p>{formatDateTime(activity.activityStart)}</p>
                <p>
                  {formatDistanceKm(activity.distanceM)} · {formatDuration(activity.durationSeconds)}
                </p>
              </Link>
            ))}
            {selectedDay && dayActivities.length === 0 ? <p>No activities for this day.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Recent Activities</h3>
          <div className="mt-3 space-y-2 text-sm text-muted">
            {recentActivities.map((activity) => (
              <Link
                key={activity.id}
                to={`/activities/${activity.id}`}
                className="block rounded-md border border-border bg-bg/40 p-3 hover:border-accent/50"
              >
                <p className="text-white">{activity.sportType}</p>
                <p>{formatDateTime(activity.activityStart)}</p>
                <p>
                  {formatDistanceKm(activity.distanceM)} · {formatDuration(activity.durationSeconds)}
                </p>
              </Link>
            ))}
            {recentActivities.length === 0 ? <p>No indexed activities yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
