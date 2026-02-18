import { useEffect, useMemo, useState } from 'react';
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

import { getStats } from '@/lib/tauri';
import { formatDistanceKm, formatDuration } from '@/lib/format';
import { MetricCard } from '@/components/MetricCard';
import type { StatsRange, StatsResponse } from '@/types';

const ranges: StatsRange[] = ['week', 'month', 'year', 'all'];

export function StatisticsPage() {
  const [range, setRange] = useState<StatsRange>('week');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getStats(range);
        setStats(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [range]);

  const durationHistogramData = useMemo(
    () =>
      (stats?.durationHistogram ?? []).map((bin) => ({
        bucket: `${Math.round(bin.start / 60)}-${Math.round(bin.end / 60)}m`,
        count: bin.count
      })),
    [stats?.durationHistogram]
  );

  const distanceHistogramData = useMemo(
    () =>
      (stats?.distanceHistogram ?? []).map((bin) => ({
        bucket: `${(bin.start / 1000).toFixed(1)}-${(bin.end / 1000).toFixed(1)}k`,
        count: bin.count
      })),
    [stats?.distanceHistogram]
  );

  const trendData = useMemo(() => {
    const weekly = stats?.weeklyDistance ?? [];
    const monthly = stats?.monthlyDistance ?? [];

    const byLabel: Record<string, { label: string; weeklyDistanceKm?: number; monthlyDistanceKm?: number }> = {};

    for (const point of weekly) {
      byLabel[point.label] = {
        ...byLabel[point.label],
        label: point.label,
        weeklyDistanceKm: point.distanceM / 1000
      };
    }

    for (const point of monthly) {
      byLabel[point.label] = {
        ...byLabel[point.label],
        label: point.label,
        monthlyDistanceKm: point.distanceM / 1000
      };
    }

    return Object.values(byLabel).sort((a, b) => a.label.localeCompare(b.label));
  }, [stats?.weeklyDistance, stats?.monthlyDistance]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Statistics</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Aggregate Analysis</h2>
      </header>

      <div className="flex flex-wrap gap-2">
        {ranges.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              range === value ? 'bg-accent text-white' : 'border border-border text-muted'
            }`}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>

      {error ? <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading stats...</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Distance" value={formatDistanceKm(stats?.totalDistanceM ?? 0)} />
        <MetricCard label="Total Time" value={formatDuration(stats?.totalTimeS ?? 0)} />
        <MetricCard
          label="Total Elevation"
          value={`${Math.round(stats?.totalElevationM ?? 0)} m`}
        />
        <MetricCard label="Activity Count" value={`${stats?.activityCount ?? 0}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Workout Duration Histogram</h3>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={durationHistogramData}>
                <CartesianGrid stroke="#2B313A" />
                <XAxis dataKey="bucket" stroke="#9EA4AE" />
                <YAxis stroke="#9EA4AE" />
                <Tooltip />
                <Bar dataKey="count" fill="#FC4C02" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Distance Histogram</h3>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distanceHistogramData}>
                <CartesianGrid stroke="#2B313A" />
                <XAxis dataKey="bucket" stroke="#9EA4AE" />
                <YAxis stroke="#9EA4AE" />
                <Tooltip />
                <Bar dataKey="count" fill="#FF8C42" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
        <h3 className="text-lg font-semibold text-white">Weekly / Monthly Distance Trend</h3>
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid stroke="#2B313A" />
              <XAxis dataKey="label" stroke="#9EA4AE" />
              <YAxis stroke="#9EA4AE" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="weeklyDistanceKm" stroke="#FC4C02" dot={false} />
              <Line type="monotone" dataKey="monthlyDistanceKm" stroke="#77C043" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
