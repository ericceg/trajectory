import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { FeatureCollection, LineString, Point } from 'geojson';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';

import { getActivity, getActivitySamples } from '@/lib/tauri';
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
import type { ActivityDetail, ActivitySample, TrackPoint } from '@/types';

const ACTIVITY_ROUTE_SOURCE_ID = 'activity-route-source';
const ACTIVITY_ROUTE_LAYER_ID = 'activity-route-layer';
const ACTIVITY_ROUTE_HOVER_SOURCE_ID = 'activity-route-hover-source';
const ACTIVITY_ROUTE_HOVER_OUTER_LAYER_ID = 'activity-route-hover-outer-layer';
const ACTIVITY_ROUTE_HOVER_INNER_LAYER_ID = 'activity-route-hover-inner-layer';
const ROUTE_HOVER_MARKER_SMOOTHING_MS = 10;
const CHART_GRID_STROKE = 'rgba(var(--color-border), 0.75)';
const CHART_AXIS_STROKE = 'rgb(var(--color-muted))';
const CHART_LINE_COLORS = {
  speed: '#2563EB', // blue
  pace: '#2563EB', // blue
  heartRate: '#DC2626', // red
  elevation: '#77C043', // alpine green
  cadence: '#F59E0B', // amber
  power: '#bd08ff', // violet
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
const COMBINED_CHART_SERIES_ORDER: ChartSeriesKey[] = [
  'power',
  'speed',
  'heartRate',
  'cadence',
  'pace',
  'elevation'
];
const COMBINED_CHART_OUTER_PADDING = 3;
const COMBINED_CHART_BAND_GAP = 4;
const CHART_DRAG_CLICK_THRESHOLD_PX = 4;
const CHART_MIN_ZOOM_SPAN_KM = 0.01;
const CHART_MIN_ZOOM_SPAN_SECONDS = 15;

type ChartSeriesKey = 'pace' | 'speed' | 'heartRate' | 'elevation' | 'cadence' | 'power';
type SplitMetricKey =
  | 'paceSecondsPerKm'
  | 'speedKmh'
  | 'heartRate'
  | 'elevationM'
  | 'cadence'
  | 'powerWatts';
type ChartMode = 'combined' | 'split';
type ChartXAxisMode = 'distance' | 'time';

type ChartSeriesVisibility = Record<ChartSeriesKey, boolean>;
type ChartBand = { min: number; max: number };
type ChartZoomDomain = [number, number];
type ChartPointer = { value: number; chartX: number };
type RouteHoverCoordinate = { lat: number; lon: number } | null;
type ActivityRouteMapHandle = {
  setHoverTarget: (coordinate: RouteHoverCoordinate) => void;
  clearHoverTarget: () => void;
};

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
      elevation: true,
      cadence: true,
      power: true
    };
  }

  if (isCycling) {
    return {
      pace: false,
      speed: true,
      heartRate: true,
      elevation: true,
      cadence: true,
      power: true
    };
  }

  return {
    pace: true,
    speed: true,
    heartRate: true,
    elevation: true,
    cadence: false,
    power: false
  };
}

interface CombinedChartPoint {
  distanceKm: number;
  distanceM: number;
  elapsedSeconds: number;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  paceSecondsPerKm: number | null;
  heartRate: number | null;
  cadence: number | null;
  powerWatts: number | null;
  elevationM: number | null;
  gradePct: number | null;
  pacePlot: number | null;
  speedPlot: number | null;
  heartRatePlot: number | null;
  cadencePlot: number | null;
  powerPlot: number | null;
  elevationPlot: number | null;
}

interface CombinedChartModel {
  data: CombinedChartPoint[];
  has: Record<ChartSeriesKey, boolean>;
  maxDistanceKm: number;
  maxElapsedSeconds: number;
}

function readChartPointer(event: unknown): ChartPointer | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const maybePointer = event as { activeLabel?: unknown; chartX?: unknown };
  const value = Number(maybePointer.activeLabel);
  const chartX = Number(maybePointer.chartX);

  if (!Number.isFinite(value) || !Number.isFinite(chartX)) {
    return null;
  }

  return { value, chartX };
}

function readHoveredRouteCoordinate(event: unknown): RouteHoverCoordinate {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const maybeHover = event as {
    isTooltipActive?: unknown;
    activePayload?: Array<{ payload?: CombinedChartPoint }>;
  };

  if (maybeHover.isTooltipActive === false) {
    return null;
  }

  if (!Array.isArray(maybeHover.activePayload) || maybeHover.activePayload.length === 0) {
    return null;
  }

  for (const entry of maybeHover.activePayload) {
    const point = entry?.payload;
    if (!point) {
      continue;
    }

    if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
      return { lat: point.lat as number, lon: point.lon as number };
    }
  }

  return null;
}

function routeHoverCoordinatesEqual(a: RouteHoverCoordinate, b: RouteHoverCoordinate): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
}

function chartDomainsEqual(a: ChartZoomDomain | null, b: ChartZoomDomain | null): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function buildSelectionDomain(
  anchor: ChartPointer | null,
  current: ChartPointer | null,
  maxDomainValue: number
): ChartZoomDomain | null {
  if (!anchor || !current) {
    return null;
  }

  const min = Math.max(0, Math.min(anchor.value, current.value));
  const max = Math.min(maxDomainValue, Math.max(anchor.value, current.value));

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null;
  }

  return [min, max];
}

function formatNumberTick(value: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits
  }).format(value);
}

function formatDistanceAxisTick(km: number): string {
  return `${formatNumberTick(km, km >= 10 ? 0 : 1)} km`;
}

function formatElapsedAxisTick(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00';
  }

  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}`;
  }

  return `${minutes}m`;
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

function metricRangeForVisibleDomain<T>(
  items: T[],
  xDomain: ChartZoomDomain,
  getX: (item: T) => number,
  getValue: (item: T) => number | null | undefined
): [number, number] | null {
  const visibleRange = metricRange(
    items.filter((item) => {
      const x = getX(item);
      return Number.isFinite(x) && x >= xDomain[0] && x <= xDomain[1];
    }).map(getValue)
  );

  return visibleRange ?? metricRange(items.map(getValue));
}

function normalizeToBand(
  value: number | null,
  range: [number, number] | null,
  band: ChartBand | null | undefined,
  invert = false
): number | null {
  if (value == null || range == null || band == null) {
    return null;
  }

  const [rangeMin, rangeMax] = range;
  const ratio = Math.min(1, Math.max(0, (value - rangeMin) / (rangeMax - rangeMin)));
  const adjustedRatio = invert ? 1 - ratio : ratio;
  return band.min + adjustedRatio * (band.max - band.min);
}

function buildCombinedChartBands(visibleSeries: ChartSeriesKey[]): Partial<Record<ChartSeriesKey, ChartBand>> {
  if (visibleSeries.length === 0) {
    return {};
  }

  const [domainMin, domainMax] = COMBINED_CHART_DOMAIN;
  const domainHeight = domainMax - domainMin;
  const outerPadding = visibleSeries.length === 1 ? 2 : COMBINED_CHART_OUTER_PADDING;
  const bandGap = visibleSeries.length <= 1 ? 0 : COMBINED_CHART_BAND_GAP;
  const totalGapHeight = bandGap * Math.max(0, visibleSeries.length - 1);
  const usableHeight = Math.max(visibleSeries.length, domainHeight - outerPadding * 2 - totalGapHeight);
  const bandHeight = usableHeight / visibleSeries.length;
  const bands: Partial<Record<ChartSeriesKey, ChartBand>> = {};
  let currentTop = domainMax - outerPadding;

  for (const key of visibleSeries) {
    const bandMax = currentTop;
    const bandMin = currentTop - bandHeight;
    bands[key] = { min: bandMin, max: bandMax };
    currentTop = bandMin - bandGap;
  }

  return bands;
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

function CombinedChartTooltip({
  active,
  payload,
  xAxisMode
}: {
  active?: boolean;
  payload?: Array<{ payload?: CombinedChartPoint }>;
  xAxisMode: ChartXAxisMode;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }

  const point = payload[0].payload;
  const metricRows = [
    point.paceSecondsPerKm == null
      ? null
      : { label: 'Pace', value: formatPaceSeconds(point.paceSecondsPerKm) },
    point.speedKmh == null ? null : { label: 'Speed', value: `${formatNumberTick(point.speedKmh, 1)} km/h` },
    point.heartRate == null ? null : { label: 'Heart rate', value: `${Math.round(point.heartRate)} bpm` },
    point.cadence == null ? null : { label: 'Cadence', value: `${Math.round(point.cadence)} rpm` },
    point.powerWatts == null ? null : { label: 'Power', value: `${Math.round(point.powerWatts)} W` },
    point.elevationM == null ? null : { label: 'Elevation', value: `${Math.round(point.elevationM)} m` },
    point.gradePct == null
      ? null
      : { label: 'Grade', value: `${point.gradePct >= 0 ? '+' : ''}${formatNumberTick(point.gradePct, 1)}%` }
  ].filter((row): row is { label: string; value: string } => row != null);

  return (
    <div style={CHART_TOOLTIP_STYLE} className="min-w-[13rem] p-3 text-sm leading-tight">
      <p className="font-semibold text-foreground">{formatElapsedTooltip(point.elapsedSeconds)}</p>
      <div className="mt-2 space-y-1 text-foreground">
        {xAxisMode === 'distance' ? (
          <p>
            Dist: <span className="font-semibold">{formatNumberTick(point.distanceKm, 2)} km</span>
          </p>
        ) : null}
        {metricRows.map((row) => (
          <p key={row.label}>
            {row.label}: <span className="font-semibold">{row.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function SplitMetricTooltip({
  active,
  payload,
  metricKey,
  metricLabel,
  formatValue,
  xAxisMode
}: {
  active?: boolean;
  payload?: Array<{ payload?: CombinedChartPoint }>;
  metricKey: SplitMetricKey;
  metricLabel: string;
  formatValue: (value: number | null) => string;
  xAxisMode: ChartXAxisMode;
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
        {xAxisMode === 'distance' ? (
          <p>
            Dist: <span className="font-semibold">{formatNumberTick(point.distanceKm, 2)} km</span>
          </p>
        ) : null}
        {rawValue == null ? null : (
          <p>
            {metricLabel}: <span className="font-semibold">{formatValue(rawValue)}</span>
          </p>
        )}
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
  xDomain,
  xAxisMode,
  syncId,
  selectionDomain,
  onChartMouseDown,
  onChartMouseMove,
  onChartMouseLeave,
  onChartMouseUp,
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
  xDomain: ChartZoomDomain;
  xAxisMode: ChartXAxisMode;
  syncId: string;
  selectionDomain?: ChartZoomDomain | null;
  onChartMouseDown?: (event: unknown) => void;
  onChartMouseMove?: (event: unknown) => void;
  onChartMouseLeave?: () => void;
  onChartMouseUp?: (event: unknown) => void;
  variant?: 'line' | 'area';
}) {
  const yDomain = useMemo<[number, number] | undefined>(() => {
    const range = metricRangeForVisibleDomain(
      data,
      xDomain,
      (point) => (xAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point[dataKey] as number | null
    );
    return range ?? undefined;
  }, [data, dataKey, xAxisMode, xDomain]);

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
              syncId={syncId}
              margin={{ top: 8, right: 8, left: -6, bottom: 2 }}
              onMouseDown={onChartMouseDown}
              onMouseMove={onChartMouseMove}
              onMouseLeave={onChartMouseLeave}
              onMouseUp={onChartMouseUp}
            >
              <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                dataKey={xAxisMode === 'distance' ? 'distanceKm' : 'elapsedSeconds'}
                stroke={CHART_AXIS_STROKE}
                tickFormatter={(value) =>
                  xAxisMode === 'distance'
                    ? formatDistanceAxisTick(Number(value))
                    : formatElapsedAxisTick(Number(value))
                }
                tickMargin={8}
                minTickGap={24}
                domain={xDomain}
                allowDataOverflow
              />
              <YAxis
                stroke={CHART_AXIS_STROKE}
                tickFormatter={(value) => yTickFormatter(Number(value))}
                tickMargin={8}
                width={58}
                domain={yDomain ?? ['auto', 'auto']}
                allowDataOverflow={Boolean(yDomain)}
              />
              <Tooltip
                cursor={{ stroke: '#000000', strokeWidth: 1 }}
                content={
                  <SplitMetricTooltip
                    metricKey={dataKey}
                    metricLabel={valueLabel}
                    formatValue={valueFormatter}
                    xAxisMode={xAxisMode}
                  />
                }
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                isAnimationActive={false}
              />
              {selectionDomain ? (
                <ReferenceArea
                  x1={selectionDomain[0]}
                  x2={selectionDomain[1]}
                  fill="rgba(var(--color-accent), 0.14)"
                  stroke="rgba(var(--color-accent), 0.5)"
                  strokeOpacity={0.9}
                  ifOverflow="extendDomain"
                />
              ) : null}
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

function toRouteHoverFeatureCollection(point: RouteHoverCoordinate): FeatureCollection<Point> {
  if (!point) {
    return { type: 'FeatureCollection', features: [] };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [point.lon, point.lat]
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

const ActivityRouteMap = forwardRef<
  ActivityRouteMapHandle,
  {
    track: TrackPoint[];
    reducedComplexity: boolean;
    routeLineColorHex: string;
  }
>(function ActivityRouteMap({ track, reducedComplexity, routeLineColorHex }, ref) {
  const { containerRef, mapRef } = useManagedMapLibre({
    reducedComplexity,
    initialCenter: US_DEFAULT_CENTER,
    initialZoom: US_DEFAULT_ZOOM
  });
  const trackSource = useMemo(() => toRouteFeatureCollection(track), [track]);
  const hoverTargetRef = useRef<RouteHoverCoordinate>(null);
  const hoverDisplayedRef = useRef<RouteHoverCoordinate>(null);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const hoverLastFrameTimeRef = useRef<number | null>(null);

  const setHoverPointSourceData = (point: RouteHoverCoordinate) => {
    const map = mapRef.current;
    if (!map || !map.getSource(ACTIVITY_ROUTE_HOVER_SOURCE_ID)) {
      return;
    }

    (map.getSource(ACTIVITY_ROUTE_HOVER_SOURCE_ID) as GeoJSONSource).setData(
      toRouteHoverFeatureCollection(point)
    );
  };

  const cancelHoverAnimation = () => {
    if (hoverAnimationFrameRef.current == null) {
      return;
    }

    cancelAnimationFrame(hoverAnimationFrameRef.current);
    hoverAnimationFrameRef.current = null;
  };

  const scheduleHoverAnimation = () => {
    if (hoverAnimationFrameRef.current != null) {
      return;
    }

    hoverAnimationFrameRef.current = requestAnimationFrame((timestamp) => {
      hoverAnimationFrameRef.current = null;

      const target = hoverTargetRef.current;
      const current = hoverDisplayedRef.current;

      if (!target) {
        hoverLastFrameTimeRef.current = null;
        if (current) {
          hoverDisplayedRef.current = null;
          setHoverPointSourceData(null);
        }
        return;
      }

      if (!current) {
        hoverDisplayedRef.current = { ...target };
        hoverLastFrameTimeRef.current = timestamp;
        setHoverPointSourceData(hoverDisplayedRef.current);
        return;
      }

      const previousTimestamp = hoverLastFrameTimeRef.current ?? timestamp;
      hoverLastFrameTimeRef.current = timestamp;
      const dt = Math.max(1, Math.min(64, timestamp - previousTimestamp));
      const alpha = 1 - Math.exp(-dt / ROUTE_HOVER_MARKER_SMOOTHING_MS);

      const nextPoint = {
        lat: current.lat + (target.lat - current.lat) * alpha,
        lon: current.lon + (target.lon - current.lon) * alpha
      };

      const closeToTarget =
        Math.abs(target.lat - nextPoint.lat) < 1e-6 && Math.abs(target.lon - nextPoint.lon) < 1e-6;
      hoverDisplayedRef.current = closeToTarget ? { ...target } : nextPoint;
      setHoverPointSourceData(hoverDisplayedRef.current);

      if (!routeHoverCoordinatesEqual(hoverDisplayedRef.current, hoverTargetRef.current)) {
        scheduleHoverAnimation();
      }
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      setHoverTarget: (coordinate) => {
        const normalized = coordinate ? { ...coordinate } : null;
        if (routeHoverCoordinatesEqual(hoverTargetRef.current, normalized)) {
          return;
        }

        hoverTargetRef.current = normalized;
        if (!normalized) {
          cancelHoverAnimation();
          hoverLastFrameTimeRef.current = null;
          hoverDisplayedRef.current = null;
          setHoverPointSourceData(null);
          return;
        }

        scheduleHoverAnimation();
      },
      clearHoverTarget: () => {
        hoverTargetRef.current = null;
        cancelHoverAnimation();
        hoverLastFrameTimeRef.current = null;
        hoverDisplayedRef.current = null;
        setHoverPointSourceData(null);
      }
    }),
    []
  );

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

    const syncHoverPointLayer = () => {
      if (!map.getSource(ACTIVITY_ROUTE_HOVER_SOURCE_ID)) {
        map.addSource(ACTIVITY_ROUTE_HOVER_SOURCE_ID, {
          type: 'geojson',
          data: toRouteHoverFeatureCollection(hoverDisplayedRef.current)
        });
      }

      if (!map.getLayer(ACTIVITY_ROUTE_HOVER_OUTER_LAYER_ID)) {
        map.addLayer({
          id: ACTIVITY_ROUTE_HOVER_OUTER_LAYER_ID,
          type: 'circle',
          source: ACTIVITY_ROUTE_HOVER_SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-opacity': 0.95,
            'circle-stroke-width': 2,
            'circle-stroke-color': 'rgba(15, 23, 42, 0.8)'
          }
        });
      }

      if (!map.getLayer(ACTIVITY_ROUTE_HOVER_INNER_LAYER_ID)) {
        map.addLayer({
          id: ACTIVITY_ROUTE_HOVER_INNER_LAYER_ID,
          type: 'circle',
          source: ACTIVITY_ROUTE_HOVER_SOURCE_ID,
          paint: {
            'circle-radius': 3.25,
            'circle-color': routeLineColorHex,
            'circle-opacity': 1
          }
        });
      }

      map.setPaintProperty(ACTIVITY_ROUTE_HOVER_INNER_LAYER_ID, 'circle-color', routeLineColorHex);
      map.moveLayer(ACTIVITY_ROUTE_HOVER_OUTER_LAYER_ID);
      map.moveLayer(ACTIVITY_ROUTE_HOVER_INNER_LAYER_ID);
      setHoverPointSourceData(hoverDisplayedRef.current);
    };

    if (map.isStyleLoaded()) {
      syncHoverPointLayer();
      return undefined;
    }

    map.once('load', syncHoverPointLayer);
    return () => {
      map.off('load', syncHoverPointLayer);
    };
  }, [routeLineColorHex]);

  useEffect(() => {
    hoverTargetRef.current = null;
    hoverDisplayedRef.current = null;
    hoverLastFrameTimeRef.current = null;
    cancelHoverAnimation();
    setHoverPointSourceData(null);
  }, [track]);

  useEffect(
    () => () => {
      cancelHoverAnimation();
    },
    []
  );

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
});

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
  const [chartSamples, setChartSamples] = useState<ActivitySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reducedMapComplexity, setReducedMapComplexity] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('combined');
  const [chartSeriesVisibility, setChartSeriesVisibility] = useState<ChartSeriesVisibility>(() =>
    defaultChartSeriesVisibility()
  );
  const [chartZoomDomain, setChartZoomDomain] = useState<ChartZoomDomain | null>(null);
  const [chartSelectionDomain, setChartSelectionDomain] = useState<ChartZoomDomain | null>(null);
  const chartDragAnchorRef = useRef<ChartPointer | null>(null);
  const chartDragCurrentRef = useRef<ChartPointer | null>(null);
  const chartSelectionFrameRef = useRef<number | null>(null);
  const chartSamplesRequestRef = useRef(0);
  const routeMapRef = useRef<ActivityRouteMapHandle | null>(null);
  const accentTheme = useAppStore((state) => state.settings?.accentTheme);
  const chartMaxSamples = useAppStore((state) => state.settings?.chartMaxSamples ?? 2000);
  const accentPalette = useMemo(() => getAccentThemePalette(accentTheme), [accentTheme]);
  const hasGpsTrack = Boolean(detail?.summary.hasGps && detail.track.length > 0);
  const chartXAxisMode: ChartXAxisMode = hasGpsTrack ? 'distance' : 'time';

  useEffect(() => {
    if (!id) {
      return;
    }

    chartSamplesRequestRef.current += 1;
    setChartSamples([]);

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
    setChartZoomDomain(null);
    setChartSelectionDomain(null);
    chartDragAnchorRef.current = null;
    chartDragCurrentRef.current = null;
    routeMapRef.current?.clearHoverTarget();
  }, [detail?.summary.id, detail?.summary.sportType]);

  const combinedChart = useMemo<CombinedChartModel>(() => {
    if (!detail) {
      return {
        data: [],
        has: { pace: false, speed: false, heartRate: false, elevation: false, cadence: false, power: false },
        maxDistanceKm: 0,
        maxElapsedSeconds: 0
      };
    }

    const totalDistanceM = Math.max(detail.summary.distanceM, 0);
    const totalDurationSeconds = Math.max(detail.summary.durationSeconds, 1);
    let lastDistanceM = 0;
    let previousElevationPoint: { distanceM: number; elevationM: number } | null = null;

    const basePoints: Array<
      Omit<
        CombinedChartPoint,
        'pacePlot' | 'speedPlot' | 'heartRatePlot' | 'cadencePlot' | 'powerPlot' | 'elevationPlot'
      >
    > =
      chartSamples.map((sample) => {
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
          lat: sample.lat,
          lon: sample.lon,
          speedKmh,
          paceSecondsPerKm,
          heartRate: sample.heartRate,
          cadence: sample.cadence,
          powerWatts: sample.powerWatts,
          elevationM: sample.altitudeM,
          gradePct
        };
      });

    const paceRange = metricRange(basePoints.map((point) => point.paceSecondsPerKm));
    const speedRange = metricRange(basePoints.map((point) => point.speedKmh));
    const heartRateRange = metricRange(basePoints.map((point) => point.heartRate));
    const cadenceRange = metricRange(basePoints.map((point) => point.cadence));
    const powerRange = metricRange(basePoints.map((point) => point.powerWatts));
    const elevationRange = metricRange(basePoints.map((point) => point.elevationM));
    const has = {
      pace: paceRange != null,
      speed: speedRange != null,
      heartRate: heartRateRange != null,
      cadence: cadenceRange != null,
      power: powerRange != null,
      elevation: elevationRange != null
    } satisfies Record<ChartSeriesKey, boolean>;
    const visibleSeries = COMBINED_CHART_SERIES_ORDER.filter(
      (key) => has[key] && chartSeriesVisibility[key]
    );
    const bands = buildCombinedChartBands(visibleSeries);

    const data: CombinedChartPoint[] = basePoints.map((point) => ({
      ...point,
      pacePlot: normalizeToBand(point.paceSecondsPerKm, paceRange, bands.pace, true),
      speedPlot: normalizeToBand(point.speedKmh, speedRange, bands.speed),
      heartRatePlot: normalizeToBand(point.heartRate, heartRateRange, bands.heartRate),
      cadencePlot: normalizeToBand(point.cadence, cadenceRange, bands.cadence),
      powerPlot: normalizeToBand(point.powerWatts, powerRange, bands.power),
      elevationPlot: normalizeToBand(point.elevationM, elevationRange, bands.elevation)
    }));

    const maxDistanceKm = Math.max(
      ...data.map((point) => point.distanceKm),
      totalDistanceM > 0 ? totalDistanceM / 1000 : 0
    );
    const maxElapsedSeconds = Math.max(
      ...data.map((point) => point.elapsedSeconds),
      totalDurationSeconds
    );

    return {
      data,
      has,
      maxDistanceKm,
      maxElapsedSeconds
    };
  }, [chartSamples, detail, chartSeriesVisibility]);

  const fullChartXAxisDomain = useMemo<ChartZoomDomain>(() => {
    if (chartXAxisMode === 'time') {
      const summaryDurationSeconds = detail ? Math.max(0, detail.summary.durationSeconds) : 0;
      return [0, Math.max(60, summaryDurationSeconds, combinedChart.maxElapsedSeconds)];
    }

    const summaryDistanceKm = detail ? Math.max(0, detail.summary.distanceM) / 1000 : 0;
    return [0, Math.max(0.1, summaryDistanceKm, combinedChart.maxDistanceKm)];
  }, [chartXAxisMode, combinedChart.maxDistanceKm, combinedChart.maxElapsedSeconds, detail]);

  useEffect(() => {
    if (!chartZoomDomain) {
      return;
    }

    const [, zoomMax] = chartZoomDomain;
    if (zoomMax <= fullChartXAxisDomain[1]) {
      return;
    }

    setChartZoomDomain(null);
  }, [chartZoomDomain, fullChartXAxisDomain]);

  const activeChartXAxisDomain = chartZoomDomain ?? fullChartXAxisDomain;
  const chartSampleDistanceZoomDomain = chartXAxisMode === 'distance' ? chartZoomDomain : null;

  useEffect(() => {
    if (!detail) {
      return;
    }

    const query = {
      distanceMinKm: chartSampleDistanceZoomDomain?.[0],
      distanceMaxKm: chartSampleDistanceZoomDomain?.[1],
      maxSamples: chartMaxSamples
    };
    const requestId = chartSamplesRequestRef.current + 1;
    chartSamplesRequestRef.current = requestId;

    const loadSamples = async () => {
      try {
        const response = await getActivitySamples(detail.summary.id, query);
        if (chartSamplesRequestRef.current !== requestId) {
          return;
        }

        setChartSamples(response.samples);
      } catch (err) {
        if (chartSamplesRequestRef.current !== requestId) {
          return;
        }
        console.error('Failed to refresh chart samples', err);
      }
    };

    void loadSamples();
  }, [chartMaxSamples, chartSampleDistanceZoomDomain, detail?.summary.id]);

  const combinedChartDisplayData = useMemo<CombinedChartPoint[]>(() => {
    if (combinedChart.data.length === 0) {
      return combinedChart.data;
    }

    const visibleSeries = COMBINED_CHART_SERIES_ORDER.filter(
      (key) => combinedChart.has[key] && chartSeriesVisibility[key]
    );
    const bands = buildCombinedChartBands(visibleSeries);

    const paceRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.paceSecondsPerKm
    );
    const speedRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.speedKmh
    );
    const heartRateRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.heartRate
    );
    const cadenceRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.cadence
    );
    const powerRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.powerWatts
    );
    const elevationRange = metricRangeForVisibleDomain(
      combinedChart.data,
      activeChartXAxisDomain,
      (point) => (chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds),
      (point) => point.elevationM
    );

    return combinedChart.data.map((point) => ({
      ...point,
      pacePlot: normalizeToBand(point.paceSecondsPerKm, paceRange, bands.pace, true),
      speedPlot: normalizeToBand(point.speedKmh, speedRange, bands.speed),
      heartRatePlot: normalizeToBand(point.heartRate, heartRateRange, bands.heartRate),
      cadencePlot: normalizeToBand(point.cadence, cadenceRange, bands.cadence),
      powerPlot: normalizeToBand(point.powerWatts, powerRange, bands.power),
      elevationPlot: normalizeToBand(point.elevationM, elevationRange, bands.elevation)
    }));
  }, [activeChartXAxisDomain, chartSeriesVisibility, chartXAxisMode, combinedChart.data, combinedChart.has]);

  const cancelChartSelectionFrame = () => {
    if (chartSelectionFrameRef.current == null) {
      return;
    }
    cancelAnimationFrame(chartSelectionFrameRef.current);
    chartSelectionFrameRef.current = null;
  };

  useEffect(() => () => cancelChartSelectionFrame(), []);

  const syncChartSelectionDomain = () => {
    const nextDomain = buildSelectionDomain(
      chartDragAnchorRef.current,
      chartDragCurrentRef.current,
      fullChartXAxisDomain[1]
    );

    setChartSelectionDomain((current) => (chartDomainsEqual(current, nextDomain) ? current : nextDomain));
  };

  const scheduleChartSelectionSync = () => {
    if (chartSelectionFrameRef.current != null) {
      return;
    }

    chartSelectionFrameRef.current = requestAnimationFrame(() => {
      chartSelectionFrameRef.current = null;
      syncChartSelectionDomain();
    });
  };

  const clearChartSelection = () => {
    chartDragAnchorRef.current = null;
    chartDragCurrentRef.current = null;
    cancelChartSelectionFrame();
    setChartSelectionDomain(null);
  };

  const handleChartMouseDown = (event: unknown) => {
    const pointer = readChartPointer(event);
    if (!pointer) {
      clearChartSelection();
      return;
    }

    chartDragAnchorRef.current = pointer;
    chartDragCurrentRef.current = pointer;
    setChartSelectionDomain(null);
  };

  const handleChartMouseMove = (event: unknown) => {
    const hoveredCoordinate = readHoveredRouteCoordinate(event);
    routeMapRef.current?.setHoverTarget(hoveredCoordinate);

    if (!chartDragAnchorRef.current) {
      return;
    }

    const pointer = readChartPointer(event);
    if (!pointer) {
      return;
    }

    const previousPointer = chartDragCurrentRef.current;
    if (
      previousPointer &&
      Math.abs(previousPointer.chartX - pointer.chartX) < 1 &&
      Math.abs(previousPointer.value - pointer.value) < 1e-6
    ) {
      return;
    }

    chartDragCurrentRef.current = pointer;
    scheduleChartSelectionSync();
  };

  const handleChartMouseLeave = () => {
    routeMapRef.current?.clearHoverTarget();
  };

  const handleChartMouseUp = (event: unknown) => {
    const anchor = chartDragAnchorRef.current;
    if (!anchor) {
      return;
    }

    const pointer = readChartPointer(event) ?? chartDragCurrentRef.current ?? anchor;
    const pixelDelta = Math.abs(pointer.chartX - anchor.chartX);
    const min = Math.max(0, Math.min(anchor.value, pointer.value));
    const max = Math.min(fullChartXAxisDomain[1], Math.max(anchor.value, pointer.value));

    clearChartSelection();

    if (pixelDelta < CHART_DRAG_CLICK_THRESHOLD_PX) {
      if (chartZoomDomain) {
        setChartZoomDomain(null);
      }
      return;
    }

    const minZoomSpan = chartXAxisMode === 'distance' ? CHART_MIN_ZOOM_SPAN_KM : CHART_MIN_ZOOM_SPAN_SECONDS;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < minZoomSpan) {
      return;
    }

    const currentMin = activeChartXAxisDomain[0];
    const currentMax = activeChartXAxisDomain[1];
    const sameAsCurrent =
      Math.abs(min - currentMin) < Number.EPSILON * 100 &&
      Math.abs(max - currentMax) < Number.EPSILON * 100;

    if (!sameAsCurrent) {
      setChartZoomDomain([min, max]);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading activity...</p>;
  }

  if (error) {
    return <p className="rounded-lg bg-accent/20 p-3 text-sm text-accent">{error}</p>;
  }

  if (!detail) {
    return <p className="text-sm text-muted">Activity not found.</p>;
  }

  const showDistance = detail.summary.distanceM > 0;
  const showElevationGain = detail.summary.elevationGainM > 0;
  const showAvgSpeedPace = detail.summary.avgSpeedMps != null && detail.summary.avgSpeedMps > 0;
  const hasAnyHeartRate =
    detail.summary.avgHr != null || detail.summary.minHr != null || detail.summary.maxHr != null;

  let heartRateValue: string | null = null;
  let heartRateSubLabel: string | undefined;

  if (hasAnyHeartRate) {
    if (detail.summary.avgHr != null) {
      heartRateValue = `Avg ${Math.round(detail.summary.avgHr)} bpm`;
      const heartRateDetails = [
        detail.summary.minHr != null ? `Min ${Math.round(detail.summary.minHr)} bpm` : null,
        detail.summary.maxHr != null ? `Max ${Math.round(detail.summary.maxHr)} bpm` : null
      ].filter((part): part is string => part != null);
      heartRateSubLabel = heartRateDetails.length > 0 ? heartRateDetails.join(' · ') : undefined;
    } else if (detail.summary.minHr != null && detail.summary.maxHr != null) {
      heartRateValue = `${Math.round(detail.summary.minHr)}-${Math.round(detail.summary.maxHr)} bpm`;
    } else if (detail.summary.minHr != null) {
      heartRateValue = `Min ${Math.round(detail.summary.minHr)} bpm`;
    } else if (detail.summary.maxHr != null) {
      heartRateValue = `Max ${Math.round(detail.summary.maxHr)} bpm`;
    }
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
          {hasGpsTrack ? (
            <section className="overflow-hidden rounded-xl border border-border bg-panel">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-lg font-semibold text-foreground">Route</h3>
              </div>
              <MaximizableMapFrame
                label="route map"
                collapsedHeightClassName="h-96"
                topLeftActions={
                  <ReducedComplexityMapToggle
                    enabled={reducedMapComplexity}
                    onChange={setReducedMapComplexity}
                  />
                }
              >
                <ActivityRouteMap
                  ref={routeMapRef}
                  track={detail.track}
                  reducedComplexity={reducedMapComplexity}
                  routeLineColorHex={accentPalette.routeLineHex}
                />
              </MaximizableMapFrame>
            </section>
          ) : null}

          <section className="select-none rounded-xl border border-border bg-panel p-4">
            <div className="space-y-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-foreground">
                  {chartXAxisMode === 'distance' ? 'Performance vs Distance' : 'Performance vs Time'}
                </h3>
                <p className="mt-1 text-xs text-muted">
                  {chartXAxisMode === 'distance'
                    ? 'X-axis uses kilometers.'
                    : 'X-axis uses elapsed time.'}{' '}
                  Drag across a region to zoom. Y-scales auto-resize to the visible range. Click once on a chart to reset the zoom.
                </p>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                {chartMode === 'combined' ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <SeriesToggle
                      label="Power"
                      color={CHART_LINE_COLORS.power}
                      enabled={chartSeriesVisibility.power}
                      disabled={!combinedChart.has.power}
                      onToggle={() => setChartSeriesVisibility((current) => ({ ...current, power: !current.power }))}
                    />
                    <SeriesToggle
                      label="Cadence"
                      color={CHART_LINE_COLORS.cadence}
                      enabled={chartSeriesVisibility.cadence}
                      disabled={!combinedChart.has.cadence}
                      onToggle={() =>
                        setChartSeriesVisibility((current) => ({ ...current, cadence: !current.cadence }))
                      }
                    />
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
                  </div>
                ) : null}
                <div className="shrink-0">
                  <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                </div>
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
                        data={combinedChartDisplayData}
                        margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                        onMouseDown={handleChartMouseDown}
                        onMouseMove={handleChartMouseMove}
                        onMouseLeave={handleChartMouseLeave}
                        onMouseUp={handleChartMouseUp}
                      >
                        <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                        <XAxis
                          type="number"
                          dataKey={chartXAxisMode === 'distance' ? 'distanceKm' : 'elapsedSeconds'}
                          stroke={CHART_AXIS_STROKE}
                          tickFormatter={(value) =>
                            chartXAxisMode === 'distance'
                              ? formatDistanceAxisTick(Number(value))
                              : formatElapsedAxisTick(Number(value))
                          }
                          tickMargin={8}
                          minTickGap={24}
                          domain={activeChartXAxisDomain}
                          allowDataOverflow
                        />
                        <YAxis hide type="number" domain={COMBINED_CHART_DOMAIN} />
                        <Tooltip
                          cursor={{ stroke: '#000000', strokeWidth: 1 }}
                          content={<CombinedChartTooltip xAxisMode={chartXAxisMode} />}
                          wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                          isAnimationActive={false}
                        />
                        {chartSelectionDomain ? (
                          <ReferenceArea
                            x1={chartSelectionDomain[0]}
                            x2={chartSelectionDomain[1]}
                            fill="rgba(var(--color-accent), 0.14)"
                            stroke="rgba(var(--color-accent), 0.5)"
                            strokeOpacity={0.9}
                            ifOverflow="extendDomain"
                          />
                        ) : null}

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

                        {chartSeriesVisibility.cadence && combinedChart.has.cadence ? (
                          <Line
                            type="monotone"
                            dataKey="cadencePlot"
                            stroke={CHART_LINE_COLORS.cadence}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 3, strokeWidth: 0 }}
                            isAnimationActive={false}
                          />
                        ) : null}

                        {chartSeriesVisibility.power && combinedChart.has.power ? (
                          <Line
                            type="monotone"
                            dataKey="powerPlot"
                            stroke={CHART_LINE_COLORS.power}
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
                  Visible series are normalized into adaptive visual bands and re-scaled to the current zoom window; hover to view exact values.
                </p>
              </>
            ) : (
              <div className="mt-4 space-y-4">
                {combinedChart.has.pace ? (
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
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                  />
                ) : null}
                {combinedChart.has.speed ? (
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
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                  />
                ) : null}
                {combinedChart.has.heartRate ? (
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
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                  />
                ) : null}
                {combinedChart.has.cadence ? (
                  <SplitMetricChart
                    title="Cadence"
                    unitLabel="rpm"
                    data={combinedChart.data}
                    hasData={combinedChart.has.cadence}
                    dataKey="cadence"
                    color={CHART_LINE_COLORS.cadence}
                    valueLabel="Cadence"
                    valueFormatter={(value) => (value == null ? 'n/a' : `${Math.round(value)} rpm`)}
                    yTickFormatter={(value) => `${Math.round(value)}`}
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                  />
                ) : null}
                {combinedChart.has.power ? (
                  <SplitMetricChart
                    title="Power"
                    unitLabel="W"
                    data={combinedChart.data}
                    hasData={combinedChart.has.power}
                    dataKey="powerWatts"
                    color={CHART_LINE_COLORS.power}
                    valueLabel="Power"
                    valueFormatter={(value) => (value == null ? 'n/a' : `${Math.round(value)} W`)}
                    yTickFormatter={(value) => `${Math.round(value)}`}
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                  />
                ) : null}
                {combinedChart.has.elevation ? (
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
                    xDomain={activeChartXAxisDomain}
                    xAxisMode={chartXAxisMode}
                    syncId={`activity-${chartXAxisMode}-split-charts`}
                    selectionDomain={chartSelectionDomain}
                    onChartMouseDown={handleChartMouseDown}
                    onChartMouseMove={handleChartMouseMove}
                    onChartMouseLeave={handleChartMouseLeave}
                    onChartMouseUp={handleChartMouseUp}
                    variant="area"
                  />
                ) : null}
                {!combinedChart.has.pace &&
                !combinedChart.has.speed &&
                !combinedChart.has.heartRate &&
                !combinedChart.has.cadence &&
                !combinedChart.has.power &&
                !combinedChart.has.elevation ? (
                  <p className="rounded-lg border border-border/70 bg-bg/30 p-4 text-sm text-muted">
                    No chart samples available.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside className="order-1 xl:order-2">
          <div className="space-y-4 xl:sticky xl:top-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <MetricCard label="Duration" value={formatDuration(detail.summary.durationSeconds)} />
              <MetricCard
                label="Moving Time"
                value={formatDuration(detail.summary.movingDurationSeconds)}
              />
              {showDistance ? (
                <MetricCard label="Distance" value={formatDistanceKm(detail.summary.distanceM)} />
              ) : null}
              {showAvgSpeedPace ? (
                <MetricCard
                  label="Avg Speed / Pace"
                  value={`${formatSpeedKmh(detail.summary.avgSpeedMps)} · ${formatPaceMinKm(detail.summary.avgSpeedMps)}`}
                />
              ) : null}
              {showElevationGain ? (
                <MetricCard
                  label="Elevation Gain"
                  value={`${Math.round(detail.summary.elevationGainM)} m`}
                />
              ) : null}
              {heartRateValue ? (
                <MetricCard label="Heart Rate" value={heartRateValue} subLabel={heartRateSubLabel} />
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
