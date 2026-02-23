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
import type { FeatureCollection, LineString } from 'geojson';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';

import { getActivity } from '@/lib/tauri';
import {
  formatDateTime,
  formatDistanceKm,
  formatDuration,
  formatPaceMinKm,
  formatSpeedKmh
} from '@/lib/format';
import { US_DEFAULT_CENTER, US_DEFAULT_ZOOM } from '@/lib/mapStyles';
import { getAccentThemePalette } from '@/lib/theme';
import { useManagedMapLibre } from '@/lib/useManagedMapLibre';
import { MaximizableMapFrame } from '@/components/MaximizableMapFrame';
import { MetricCard } from '@/components/MetricCard';
import { useAppStore } from '@/store/useAppStore';
import type { ActivityDetail, TrackPoint } from '@/types';

const ACTIVITY_ROUTE_SOURCE_ID = 'activity-route-source';
const ACTIVITY_ROUTE_LAYER_ID = 'activity-route-layer';
const CHART_GRID_STROKE = 'rgba(var(--color-border), 0.75)';
const CHART_AXIS_STROKE = 'rgb(var(--color-muted))';
const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid rgba(var(--color-border), 0.9)',
  background: 'rgba(var(--color-panel), 0.96)',
  color: 'rgb(var(--color-foreground))',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
};

function formatElapsedTick(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatNumberTick(value: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits
  }).format(value);
}

function toRouteFeatureCollection(track: TrackPoint[]): FeatureCollection<LineString> {
  const coordinates = track.map((point) => [point.lon, point.lat] as [number, number]);
  if (coordinates.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates
        }
      }
    ]
  };
}

function fitMapToTrack(map: maplibregl.Map, track: TrackPoint[]) {
  if (track.length === 0) {
    map.jumpTo({
      center: US_DEFAULT_CENTER,
      zoom: US_DEFAULT_ZOOM
    });
    return;
  }

  if (track.length === 1) {
    map.jumpTo({
      center: [track[0].lon, track[0].lat],
      zoom: 14
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds(
    [track[0].lon, track[0].lat],
    [track[0].lon, track[0].lat]
  );
  for (const point of track) {
    bounds.extend([point.lon, point.lat]);
  }

  map.fitBounds(bounds, {
    padding: 40,
    duration: 0,
    maxZoom: 15
  });
}

function ActivityRouteMap({
  track,
  reducedComplexity,
  routeLineColorHex
}: {
  track: TrackPoint[];
  reducedComplexity: boolean;
  routeLineColorHex: string;
}) {
  const { containerRef, mapRef } = useManagedMapLibre({
    reducedComplexity,
    initialCenter: US_DEFAULT_CENTER,
    initialZoom: US_DEFAULT_ZOOM
  });
  const trackSource = useMemo(() => toRouteFeatureCollection(track), [track]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return undefined;
    }

    const syncTrack = () => {
      if (!map.getSource(ACTIVITY_ROUTE_SOURCE_ID)) {
        map.addSource(ACTIVITY_ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: trackSource
        });
      } else {
        (map.getSource(ACTIVITY_ROUTE_SOURCE_ID) as GeoJSONSource).setData(trackSource);
      }

      if (!map.getLayer(ACTIVITY_ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ACTIVITY_ROUTE_LAYER_ID,
          type: 'line',
          source: ACTIVITY_ROUTE_SOURCE_ID,
          paint: {
            'line-color': routeLineColorHex,
            'line-width': 4,
            'line-opacity': 0.95
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
      }

      map.setPaintProperty(ACTIVITY_ROUTE_LAYER_ID, 'line-color', routeLineColorHex);
    };

    if (map.isStyleLoaded()) {
      syncTrack();
      return undefined;
    }

    map.once('load', syncTrack);
    return () => {
      map.off('load', syncTrack);
    };
  }, [track, trackSource, reducedComplexity, routeLineColorHex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return undefined;
    }

    const fitTrack = () => {
      fitMapToTrack(map, track);
    };

    if (map.isStyleLoaded()) {
      fitTrack();
      return undefined;
    }

    map.once('load', fitTrack);
    return () => {
      map.off('load', fitTrack);
    };
  }, [track]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function ReducedComplexityMapToggle({
  enabled,
  onChange
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs backdrop-blur transition-colors ${
        enabled
          ? 'border-accent/60 bg-panel/90 text-foreground'
          : 'border-border bg-panel/80 text-muted hover:text-foreground'
      }`}
    >
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[10px] leading-none ${
          enabled ? 'border-accent bg-accent text-white' : 'border-border bg-bg/90 text-transparent'
        }`}
      >
        ✓
      </span>
      Reduced complexity
    </button>
  );
}

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reducedMapComplexity, setReducedMapComplexity] = useState(false);
  const accentTheme = useAppStore((state) => state.settings?.accentTheme);
  const accentPalette = useMemo(() => getAccentThemePalette(accentTheme), [accentTheme]);

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
          elapsedSeconds: sample.elapsedSeconds,
          speedKmh: (sample.speedMps ?? 0) * 3.6
        })),
    [detail?.samples]
  );

  const heartRateData = useMemo(
    () =>
      (detail?.samples ?? [])
        .filter((sample) => sample.heartRate != null)
        .map((sample) => ({
          elapsedSeconds: sample.elapsedSeconds,
          heartRate: sample.heartRate ?? 0
        })),
    [detail?.samples]
  );

  const elevationChart = useMemo(
    () => ({
      data: (detail?.samples ?? [])
        .filter((sample) => sample.altitudeM != null)
        .map((sample) => ({
          elapsedSeconds: sample.elapsedSeconds,
          elevationM: sample.altitudeM ?? 0
        }))
    }),
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Activity Detail</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">{detail.summary.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {detail.summary.category} · {detail.summary.sportType} · {formatDateTime(detail.summary.activityStart)}
          </p>
        </div>
        <Link
          to="/activities"
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
        >
          Back to Activities
        </Link>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="order-2 space-y-6 xl:order-1">
          <section className="overflow-hidden rounded-xl border border-border bg-panel">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-lg font-semibold text-foreground">Route</h3>
            </div>
            <MaximizableMapFrame
              label="route map"
              collapsedHeightClassName="h-96"
              topLeftActions={
                detail.track.length > 0 ? (
                  <ReducedComplexityMapToggle
                    enabled={reducedMapComplexity}
                    onChange={setReducedMapComplexity}
                  />
                ) : null
              }
            >
              {detail.track.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted">
                  No GPS track available
                </div>
              ) : (
                <ActivityRouteMap
                  track={detail.track}
                  reducedComplexity={reducedMapComplexity}
                  routeLineColorHex={accentPalette.routeLineHex}
                />
              )}
            </MaximizableMapFrame>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Speed vs Time</h3>
              <p className="text-xs text-muted">km/h</p>
            </div>
            <div className="mt-3 h-56">
              {speedData.length === 0 ? (
                <p className="text-sm text-muted">No speed samples available.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={speedData} syncId="activity-time-charts" margin={{ top: 8, right: 8, left: -8, bottom: 2 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="elapsedSeconds"
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={formatElapsedTick}
                      tickMargin={8}
                      minTickGap={28}
                    />
                    <YAxis
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={(value) => formatNumberTick(value, 1)}
                      tickMargin={8}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ stroke: 'rgba(var(--color-border), 0.95)', strokeWidth: 1 }}
                      labelFormatter={(value) => `Time ${formatElapsedTick(Number(value))}`}
                      formatter={(value) => [`${formatNumberTick(Number(value), 1)} km/h`, 'Speed']}
                    />
                    <Line
                      type="monotone"
                      dataKey="speedKmh"
                      stroke={accentPalette.speedChartLineHex}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Heart Rate vs Time</h3>
              <p className="text-xs text-muted">bpm</p>
            </div>
            <div className="mt-3 h-56">
              {heartRateData.length === 0 ? (
                <p className="text-sm text-muted">No heart rate data available.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={heartRateData} syncId="activity-time-charts" margin={{ top: 8, right: 8, left: -8, bottom: 2 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="elapsedSeconds"
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={formatElapsedTick}
                      tickMargin={8}
                      minTickGap={28}
                    />
                    <YAxis
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={(value) => formatNumberTick(value, 0)}
                      tickMargin={8}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ stroke: 'rgba(var(--color-border), 0.95)', strokeWidth: 1 }}
                      labelFormatter={(value) => `Time ${formatElapsedTick(Number(value))}`}
                      formatter={(value) => [`${Math.round(Number(value))} bpm`, 'Heart rate']}
                    />
                    <Line
                      type="monotone"
                      dataKey="heartRate"
                      stroke="#FF8C42"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">Elevation</h3>
              <p className="text-xs text-muted">x-axis: time</p>
            </div>
            <div className="mt-3 h-56">
              {elevationChart.data.length === 0 ? (
                <p className="text-sm text-muted">No elevation data available.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={elevationChart.data}
                    syncId="activity-time-charts"
                    margin={{ top: 8, right: 8, left: -8, bottom: 2 }}
                  >
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      type="number"
                      dataKey="elapsedSeconds"
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={(value) => formatElapsedTick(Number(value))}
                      tickMargin={8}
                      minTickGap={28}
                    />
                    <YAxis
                      stroke={CHART_AXIS_STROKE}
                      tickFormatter={(value) => formatNumberTick(value, 0)}
                      tickMargin={8}
                      width={52}
                    />
                    <Tooltip
                      contentStyle={CHART_TOOLTIP_STYLE}
                      cursor={{ stroke: 'rgba(var(--color-border), 0.95)', strokeWidth: 1 }}
                      labelFormatter={(value) => `Time ${formatElapsedTick(Number(value))}`}
                      formatter={(value) => [`${Math.round(Number(value))} m`, 'Elevation']}
                    />
                    <Line
                      type="monotone"
                      dataKey="elevationM"
                      stroke="#77C043"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>

        <aside className="order-1 xl:order-2">
          <div className="space-y-4 xl:sticky xl:top-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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

            <section className="rounded-xl border border-border bg-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Samples</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {detail.samples.length}
                <span className="ml-1 text-base font-medium text-muted">shown</span>
              </p>
              <p className="mt-1 text-xs text-muted">Original samples: {detail.originalSampleCount}</p>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
