import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
const CHART_LINE_COLORS = {
  speed: '#0B1F5E', // navy blue
  pace: '#2563EB', // blue
  heartRate: '#DC2626', // red
  elevation: '#77C043' // alpine green
} as const;
const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid rgba(var(--color-border), 0.9)',
  background: 'rgb(var(--color-panel))',
  color: 'rgb(var(--color-foreground))',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
};
const CHART_TOOLTIP_WRAPPER_STYLE = {
  zIndex: 20,
  pointerEvents: 'none'
} as const;
const COMBINED_CHART_DOMAIN: [number, number] = [0, 100];
const COMBINED_CHART_BANDS = {
  elevation: { min: 0, max: 14 },
  pace: { min: 18, max: 46 },
  heartRate: { min: 50, max: 78 },
  speed: { min: 82, max: 98 }
} as const;

type ChartSeriesKey = 'pace' | 'speed' | 'heartRate' | 'elevation';
type SplitMetricKey = 'paceSecondsPerKm' | 'speedKmh' | 'heartRate' | 'elevationM';
type ChartMode = 'combined' | 'split';

type ChartSeriesVisibility = Record<ChartSeriesKey, boolean>;

function defaultChartSeriesVisibility(sportType?: string): ChartSeriesVisibility {
  const normalizedSport = (sportType ?? '').trim().toLowerCase();

  const isRunning =
    normalizedSport.includes('run') || normalizedSport.includes('jog') || normalizedSport.includes('trail run');
  const isCycling =
    normalizedSport.includes('bike') ||
    normalizedSport.includes('cycle') ||
    normalizedSport.includes('ride') ||
    normalizedSport.includes('cycling');

  if (isRunning) {
    return {
      pace: true,
      speed: false,
      heartRate: true,
      elevation: true
    };
  }

  if (isCycling) {
    return {
      pace: false,
      speed: true,
      heartRate: true,
      elevation: true
    };
  }

  return {
    pace: true,
    speed: true,
    heartRate: true,
    elevation: true
  };
}

interface CombinedChartPoint {
  distanceKm: number;
  distanceM: number;
  elapsedSeconds: number;
  speedKmh: number | null;
  paceSecondsPerKm: number | null;
  heartRate: number | null;
  elevationM: number | null;
  gradePct: number | null;
  pacePlot: number | null;
  speedPlot: number | null;
  heartRatePlot: number | null;
  elevationPlot: number | null;
}

interface CombinedChartModel {
  data: CombinedChartPoint[];
  has: Record<ChartSeriesKey, boolean>;
  maxDistanceKm: number;
}

function formatNumberTick(value: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits
  }).format(value);
}

function formatDistanceAxisTick(km: number): string {
  return `${formatNumberTick(km, km >= 10 ? 0 : 1)} km`;
}

function formatElapsedTooltip(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatPaceSeconds(secondsPerKm: number | null): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return 'n/a';
  }

  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`;
}

function formatPaceTick(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return 'n/a';
  }

  const rounded = Math.round(secondsPerKm);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function metricRange(values: Array<number | null | undefined>): [number, number] | null {
  const numeric = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (numeric.length === 0) {
    return null;
  }

  let min = Math.min(...numeric);
  let max = Math.max(...numeric);
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.08, 1);
    return [min - pad, max + pad];
  }

  const padding = (max - min) * 0.08;
  min -= padding;
  max += padding;
  return [min, max];
}

function normalizeToBand(
  value: number | null,
  range: [number, number] | null,
  band: { min: number; max: number },
  invert = false
): number | null {
  if (value == null || range == null) {
    return null;
  }

  const [rangeMin, rangeMax] = range;
  const ratio = Math.min(1, Math.max(0, (value - rangeMin) / (rangeMax - rangeMin)));
  const adjustedRatio = invert ? 1 - ratio : ratio;
  return band.min + adjustedRatio * (band.max - band.min);
}

function SeriesToggle({
  label,
  color,
  enabled,
  disabled,
  onToggle
}: {
  label: string;
  color: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={enabled}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        disabled
          ? 'cursor-not-allowed border-border/60 text-muted/60'
          : enabled
            ? 'border-accent/50 bg-accent/10 text-foreground'
            : 'border-border text-muted hover:text-foreground'
      }`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          backgroundColor: color,
          opacity: disabled ? 0.35 : 1
        }}
      />
      {label}
    </button>
  );
}

function ChartModeToggle({
  mode,
  onChange
}: {
  mode: ChartMode;
  onChange: (mode: ChartMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-bg/40 p-1">
      <button
        type="button"
        onClick={() => onChange('combined')}
        aria-pressed={mode === 'combined'}
        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
          mode === 'combined' ? 'bg-panel text-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
      >
        Combined
      </button>
      <button
        type="button"
        onClick={() => onChange('split')}
        aria-pressed={mode === 'split'}
        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
          mode === 'split' ? 'bg-panel text-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
      >
        Split
      </button>
    </div>
  );
}

function CombinedChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: CombinedChartPoint }> }) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[13rem] p-3 text-sm leading-tight">
      <p className="font-semibold text-foreground">{formatElapsedTooltip(point.elapsedSeconds)}</p>
      <div className="mt-2 space-y-1 text-foreground">
        <p>
          Dist: <span className="font-semibold">{formatNumberTick(point.distanceKm, 2)} km</span>
        </p>
        <p>
          Pace: <span className="font-semibold">{formatPaceSeconds(point.paceSecondsPerKm)}</span>
        </p>
        <p>
          Speed:{' '}
          <span className="font-semibold">
            {point.speedKmh == null ? 'n/a' : `${formatNumberTick(point.speedKmh, 1)} km/h`}
          </span>
        </p>
        <p>
          Heart rate:{' '}
          <span className="font-semibold">{point.heartRate == null ? 'n/a' : `${Math.round(point.heartRate)} bpm`}</span>
        </p>
        <p>
          Elevation:{' '}
          <span className="font-semibold">{point.elevationM == null ? 'n/a' : `${Math.round(point.elevationM)} m`}</span>
        </p>
        <p>
          Grade:{' '}
          <span className="font-semibold">
            {point.gradePct == null ? 'n/a' : `${point.gradePct >= 0 ? '+' : ''}${formatNumberTick(point.gradePct, 1)}%`}
          </span>
        </p>
      </div>
    </div>
  );
}

function SplitMetricTooltip({
  active,
  payload,
  metricKey,
  metricLabel,
  formatValue
}: {
  active?: boolean;
  payload?: Array<{ payload?: CombinedChartPoint }>;
  metricKey: SplitMetricKey;
  metricLabel: string;
  formatValue: (value: number | null) => string;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const point = payload[0].payload;
  const rawValue = point[metricKey] as number | null;

  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[12rem] p-3 text-sm leading-tight">
      <p className="font-semibold text-foreground">{formatElapsedTooltip(point.elapsedSeconds)}</p>
      <div className="mt-2 space-y-1 text-foreground">
        <p>
          Dist: <span className="font-semibold">{formatNumberTick(point.distanceKm, 2)} km</span>
        </p>
        <p>
          {metricLabel}: <span className="font-semibold">{formatValue(rawValue)}</span>
        </p>
      </div>
    </div>
  );
}

function SplitMetricChart({
  title,
  unitLabel,
  data,
  hasData,
  dataKey,
  color,
  valueLabel,
  valueFormatter,
  yTickFormatter,
  maxDistanceKm,
  variant = 'line'
}: {
  title: string;
  unitLabel: string;
  data: CombinedChartPoint[];
  hasData: boolean;
  dataKey: SplitMetricKey;
  color: string;
  valueLabel: string;
  valueFormatter: (value: number | null) => string;
  yTickFormatter: (value: number) => string;
  maxDistanceKm: number;
  variant?: 'line' | 'area';
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-bg/30 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-[11px] text-muted">{unitLabel}</p>
      </div>
      <div className="mt-2 h-40">
        {!hasData ? (
          <p className="text-sm text-muted">No {title.toLowerCase()} data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              syncId="activity-distance-split-charts"
              margin={{ top: 8, right: 8, left: -6, bottom: 2 }}
            >
              <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                dataKey="distanceKm"
                stroke={CHART_AXIS_STROKE}
                tickFormatter={(value) => formatDistanceAxisTick(Number(value))}
                tickMargin={8}
                minTickGap={24}
                domain={[0, Math.max(0.1, maxDistanceKm)]}
              />
              <YAxis
                stroke={CHART_AXIS_STROKE}
                tickFormatter={(value) => yTickFormatter(Number(value))}
                tickMargin={8}
                width={58}
              />
              <Tooltip
                cursor={{ stroke: '#000000', strokeWidth: 1 }}
                content={
                  <SplitMetricTooltip
                    metricKey={dataKey}
                    metricLabel={valueLabel}
                    formatValue={valueFormatter}
                  />
                }
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                isAnimationActive={false}
              />
              {variant === 'area' ? (
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.18}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
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
  const [chartMode, setChartMode] = useState<ChartMode>('combined');
  const [chartSeriesVisibility, setChartSeriesVisibility] = useState<ChartSeriesVisibility>(() =>
    defaultChartSeriesVisibility()
  );
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

  useEffect(() => {
    if (!detail) {
      return;
    }

    setChartSeriesVisibility(defaultChartSeriesVisibility(detail.summary.sportType));
  }, [detail?.summary.id, detail?.summary.sportType]);

  const combinedChart = useMemo<CombinedChartModel>(() => {
    if (!detail) {
      return {
        data: [],
        has: { pace: false, speed: false, heartRate: false, elevation: false },
        maxDistanceKm: 0
      };
    }

    const totalDistanceM = Math.max(detail.summary.distanceM, 0);
    const totalDurationSeconds = Math.max(detail.summary.durationSeconds, 1);
    let lastDistanceM = 0;
    let previousElevationPoint: { distanceM: number; elevationM: number } | null = null;

    const basePoints: Array<Omit<CombinedChartPoint, 'pacePlot' | 'speedPlot' | 'heartRatePlot' | 'elevationPlot'>> =
      detail.samples.map((sample) => {
        const estimatedDistanceM =
          totalDistanceM > 0 ? (sample.elapsedSeconds / totalDurationSeconds) * totalDistanceM : lastDistanceM;
        const distanceM = Math.max(lastDistanceM, sample.distanceM ?? estimatedDistanceM);
        lastDistanceM = distanceM;

        const speedKmh = sample.speedMps != null ? sample.speedMps * 3.6 : null;
        const paceSecondsPerKm =
          sample.speedMps != null && sample.speedMps > 0 ? 1000 / sample.speedMps : null;

        let gradePct: number | null = null;
        if (
          sample.altitudeM != null &&
          previousElevationPoint != null &&
          distanceM - previousElevationPoint.distanceM >= 5
        ) {
          gradePct = ((sample.altitudeM - previousElevationPoint.elevationM) / (distanceM - previousElevationPoint.distanceM)) * 100;
        }
        if (sample.altitudeM != null) {
          previousElevationPoint = { distanceM, elevationM: sample.altitudeM };
        }

        return {
          distanceKm: distanceM / 1000,
          distanceM,
          elapsedSeconds: sample.elapsedSeconds,
          speedKmh,
          paceSecondsPerKm,
          heartRate: sample.heartRate,
          elevationM: sample.altitudeM,
          gradePct
        };
      });

    const paceRange = metricRange(basePoints.map((point) => point.paceSecondsPerKm));
    const speedRange = metricRange(basePoints.map((point) => point.speedKmh));
    const heartRateRange = metricRange(basePoints.map((point) => point.heartRate));
    const elevationRange = metricRange(basePoints.map((point) => point.elevationM));

    const data: CombinedChartPoint[] = basePoints.map((point) => ({
      ...point,
      pacePlot: normalizeToBand(point.paceSecondsPerKm, paceRange, COMBINED_CHART_BANDS.pace, true),
      speedPlot: normalizeToBand(point.speedKmh, speedRange, COMBINED_CHART_BANDS.speed),
      heartRatePlot: normalizeToBand(point.heartRate, heartRateRange, COMBINED_CHART_BANDS.heartRate),
      elevationPlot: normalizeToBand(point.elevationM, elevationRange, COMBINED_CHART_BANDS.elevation)
    }));

    const maxDistanceKm = Math.max(
      ...data.map((point) => point.distanceKm),
      totalDistanceM > 0 ? totalDistanceM / 1000 : 0
    );

    return {
      data,
      has: {
        pace: paceRange != null,
        speed: speedRange != null,
        heartRate: heartRateRange != null,
        elevation: elevationRange != null
      },
      maxDistanceKm
    };
  }, [detail]);

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Performance vs Distance</h3>
                <p className="mt-1 text-xs text-muted">
                  X-axis uses kilometers. Switch between a combined overlay and synchronized split plots.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                {chartMode === 'combined' ? (
                  <>
                    <SeriesToggle
                      label="Elevation"
                      color={CHART_LINE_COLORS.elevation}
                      enabled={chartSeriesVisibility.elevation}
                      disabled={!combinedChart.has.elevation}
                      onToggle={() =>
                        setChartSeriesVisibility((current) => ({ ...current, elevation: !current.elevation }))
                      }
                    />
                    <SeriesToggle
                      label="Pace"
                      color={CHART_LINE_COLORS.pace}
                      enabled={chartSeriesVisibility.pace}
                      disabled={!combinedChart.has.pace}
                      onToggle={() => setChartSeriesVisibility((current) => ({ ...current, pace: !current.pace }))}
                    />
                    <SeriesToggle
                      label="Heart Rate"
                      color={CHART_LINE_COLORS.heartRate}
                      enabled={chartSeriesVisibility.heartRate}
                      disabled={!combinedChart.has.heartRate}
                      onToggle={() =>
                        setChartSeriesVisibility((current) => ({ ...current, heartRate: !current.heartRate }))
                      }
                    />
                    <SeriesToggle
                      label="Speed"
                      color={CHART_LINE_COLORS.speed}
                      enabled={chartSeriesVisibility.speed}
                      disabled={!combinedChart.has.speed}
                      onToggle={() => setChartSeriesVisibility((current) => ({ ...current, speed: !current.speed }))}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {chartMode === 'combined' ? (
              <>
                <div className="mt-3 h-72">
                  {combinedChart.data.length === 0 ? (
                    <p className="text-sm text-muted">No chart samples available.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={combinedChart.data}
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          dataKey="distanceKm"
                          stroke={CHART_AXIS_STROKE}
                          tickFormatter={(value) => formatDistanceAxisTick(Number(value))}
                          tickMargin={8}
                          minTickGap={24}
                          domain={[0, Math.max(0.1, combinedChart.maxDistanceKm)]}
                        />
                        <YAxis hide type="number" domain={COMBINED_CHART_DOMAIN} />
                        <Tooltip
                          cursor={{ stroke: '#000000', strokeWidth: 1 }}
                          content={<CombinedChartTooltip />}
                          wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                          isAnimationActive={false}
                        />

                        {chartSeriesVisibility.elevation && combinedChart.has.elevation ? (
                          <Area
                            type="monotone"
                            dataKey="elevationPlot"
                            stroke="rgba(119, 192, 67, 0.45)"
                            fill="rgba(148, 163, 184, 0.24)"
                            fillOpacity={1}
                            strokeWidth={1}
                            dot={false}
                            activeDot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        ) : null}

                        {chartSeriesVisibility.pace && combinedChart.has.pace ? (
                          <Line
                            type="monotone"
                            dataKey="pacePlot"
                            stroke={CHART_LINE_COLORS.pace}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 3, strokeWidth: 0 }}
                            isAnimationActive={false}
                          />
                        ) : null}

                        {chartSeriesVisibility.heartRate && combinedChart.has.heartRate ? (
                          <Line
                            type="monotone"
                            dataKey="heartRatePlot"
                            stroke={CHART_LINE_COLORS.heartRate}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 3, strokeWidth: 0 }}
                            isAnimationActive={false}
                          />
                        ) : null}

                        {chartSeriesVisibility.speed && combinedChart.has.speed ? (
                          <Line
                            type="monotone"
                            dataKey="speedPlot"
                            stroke={CHART_LINE_COLORS.speed}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 3, strokeWidth: 0 }}
                            isAnimationActive={false}
                          />
                        ) : null}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <p className="mt-3 text-xs text-muted">
                  Series are normalized into visual bands for overlay plotting; hover to view exact values.
                </p>
              </>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-muted">
                  Split charts are synchronized by distance, so hovering one chart aligns the cursor across the others.
                </p>
                <SplitMetricChart
                  title="Pace"
                  unitLabel="min/km"
                  data={combinedChart.data}
                  hasData={combinedChart.has.pace}
                  dataKey="paceSecondsPerKm"
                  color={CHART_LINE_COLORS.pace}
                  valueLabel="Pace"
                  valueFormatter={formatPaceSeconds}
                  yTickFormatter={formatPaceTick}
                  maxDistanceKm={combinedChart.maxDistanceKm}
                />
                <SplitMetricChart
                  title="Speed"
                  unitLabel="km/h"
                  data={combinedChart.data}
                  hasData={combinedChart.has.speed}
                  dataKey="speedKmh"
                  color={CHART_LINE_COLORS.speed}
                  valueLabel="Speed"
                  valueFormatter={(value) =>
                    value == null ? 'n/a' : `${formatNumberTick(value, 1)} km/h`
                  }
                  yTickFormatter={(value) => formatNumberTick(value, 1)}
                  maxDistanceKm={combinedChart.maxDistanceKm}
                />
                <SplitMetricChart
                  title="Heart Rate"
                  unitLabel="bpm"
                  data={combinedChart.data}
                  hasData={combinedChart.has.heartRate}
                  dataKey="heartRate"
                  color={CHART_LINE_COLORS.heartRate}
                  valueLabel="Heart rate"
                  valueFormatter={(value) => (value == null ? 'n/a' : `${Math.round(value)} bpm`)}
                  yTickFormatter={(value) => `${Math.round(value)}`}
                  maxDistanceKm={combinedChart.maxDistanceKm}
                />
                <SplitMetricChart
                  title="Elevation"
                  unitLabel="m"
                  data={combinedChart.data}
                  hasData={combinedChart.has.elevation}
                  dataKey="elevationM"
                  color={CHART_LINE_COLORS.elevation}
                  valueLabel="Elevation"
                  valueFormatter={(value) => (value == null ? 'n/a' : `${Math.round(value)} m`)}
                  yTickFormatter={(value) => `${Math.round(value)}`}
                  maxDistanceKm={combinedChart.maxDistanceKm}
                  variant="area"
                />
              </div>
            )}
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
