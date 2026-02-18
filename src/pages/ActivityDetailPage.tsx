import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';

import { getActivity } from '@/lib/tauri';
import {
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  formatPaceMinKm,
  formatSpeedKmh
} from '@/lib/format';
import { MetricCard } from '@/components/MetricCard';
import type { ActivityDetail, TrackPoint } from '@/types';

function FitBounds({ track }: { track: TrackPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (track.length === 0) {
      return;
    }

    const bounds = track.map((point) => [point.lat, point.lon] as [number, number]);
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [track, map]);

  return null;
}

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getActivity(Number(id));
        setDetail(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  const speedData = useMemo(
    () =>
      (detail?.samples ?? [])
        .filter((sample) => sample.speedMps != null)
        .map((sample) => ({
          elapsedMin: sample.elapsedSeconds / 60,
          speedKmh: (sample.speedMps ?? 0) * 3.6
        })),
    [detail?.samples]
  );

  const heartRateData = useMemo(
    () =>
      (detail?.samples ?? [])
        .filter((sample) => sample.heartRate != null)
        .map((sample) => ({
          elapsedMin: sample.elapsedSeconds / 60,
          heartRate: sample.heartRate ?? 0
        })),
    [detail?.samples]
  );

  const elevationData = useMemo(
    () =>
      (detail?.samples ?? [])
        .filter((sample) => sample.altitudeM != null)
        .map((sample) => ({
          x: sample.distanceM ? sample.distanceM / 1000 : sample.elapsedSeconds / 60,
          elevationM: sample.altitudeM ?? 0
        })),
    [detail?.samples]
  );

  if (loading) {
    return <p className="text-sm text-muted">Loading activity...</p>;
  }

  if (error) {
    return <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p>;
  }

  if (!detail) {
    return <p className="text-sm text-muted">Activity not found.</p>;
  }

  const positions = detail.track.map((point) => [point.lat, point.lon] as [number, number]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Activity Detail</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">{detail.summary.sportType}</h2>
          <p className="mt-1 text-sm text-muted">{formatDateTime(detail.summary.activityStart)}</p>
        </div>
        <Link
          to="/activities"
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-white"
        >
          Back to Activities
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Distance" value={formatDistanceKm(detail.summary.distanceM)} />
        <MetricCard label="Duration" value={formatDuration(detail.summary.durationSeconds)} />
        <MetricCard
          label="Avg Speed / Pace"
          value={`${formatSpeedKmh(detail.summary.avgSpeedMps)} · ${formatPaceMinKm(detail.summary.avgSpeedMps)}`}
        />
        <MetricCard
          label="Elevation Gain"
          value={`${Math.round(detail.summary.elevationGainM)} m`}
          subLabel={`Avg HR ${detail.summary.avgHr ? Math.round(detail.summary.avgHr) : 'n/a'} · Max HR ${
            detail.summary.maxHr ? Math.round(detail.summary.maxHr) : 'n/a'
          }`}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-panel shadow-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-lg font-semibold text-white">Route</h3>
        </div>
        <div className="h-80">
          {positions.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No GPS track available
            </div>
          ) : (
            <MapContainer center={positions[0]} zoom={13} scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={positions} pathOptions={{ color: '#FC4C02', weight: 4 }} />
              <FitBounds track={detail.track} />
            </MapContainer>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Speed vs Time</h3>
          <div className="mt-3 h-64">
            {speedData.length === 0 ? (
              <p className="text-sm text-muted">No speed samples available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={speedData}>
                  <CartesianGrid stroke="#2B313A" />
                  <XAxis dataKey="elapsedMin" stroke="#9EA4AE" />
                  <YAxis stroke="#9EA4AE" />
                  <Tooltip />
                  <Line type="monotone" dataKey="speedKmh" stroke="#FC4C02" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Heart Rate vs Time</h3>
          <div className="mt-3 h-64">
            {heartRateData.length === 0 ? (
              <p className="text-sm text-muted">No heart rate data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={heartRateData}>
                  <CartesianGrid stroke="#2B313A" />
                  <XAxis dataKey="elapsedMin" stroke="#9EA4AE" />
                  <YAxis stroke="#9EA4AE" />
                  <Tooltip />
                  <Line type="monotone" dataKey="heartRate" stroke="#FF8C42" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-white">Elevation</h3>
          <div className="mt-3 h-64">
            {elevationData.length === 0 ? (
              <p className="text-sm text-muted">No elevation data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={elevationData}>
                  <CartesianGrid stroke="#2B313A" />
                  <XAxis dataKey="x" stroke="#9EA4AE" />
                  <YAxis stroke="#9EA4AE" />
                  <Tooltip />
                  <Line type="monotone" dataKey="elevationM" stroke="#77C043" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <p className="text-xs text-muted">
        Samples shown: {detail.samples.length} / original {detail.originalSampleCount}
      </p>
    </div>
  );
}
