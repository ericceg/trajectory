import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
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
import {
  CHART_IS_ANIMATION_ACTIVE,
  CHART_LINE_ACTIVE_DOT,
  CHART_LINE_STROKE_WIDTH,
  CHART_SELECTION_FILL,
  CHART_SELECTION_STROKE,
  CHART_SELECTION_STROKE_OPACITY,
  CHART_AXIS_STROKE,
  CHART_GRID_STROKE,
  CHART_TOOLTIP_CURSOR_LINE,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_WRAPPER_STYLE,
  areDomainsEqual,
  parseNumberChartLabel,
  usePlotDragZoom
} from '@/lib/charts/plottingEngine';
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
const CHART_LINE_COLORS = {
  speed: '#2563EB', // blue
  pace: '#2563EB', // blue
  heartRate: '#DC2626', // red
  elevation: '#77C043', // alpine green
  cadence: '#F59E0B', // amber
  power: '#bd08ff', // violet
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
const CHART_MIN_ZOOM_SPAN_KM = 0.01;
const CHART_MIN_ZOOM_SPAN_SECONDS = 15;
const DEFAULT_HEART_RATE_ZONE_UPPER_BOUNDS_BPM = [120, 140, 160, 180] as const;
const HEART_RATE_ZONE_COLORS = ['#FEE2E2', '#FCA5A5', '#F87171', '#DC2626', '#7F1D1D'] as const;

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
type RouteHoverCoordinate = { lat: number; lon: number } | null;
type ActivityRouteMapHandle = {
  setHoverTarget: (coordinate: RouteHoverCoordinate) => void;
  clearHoverTarget: () => void;
};
type HeartRateZoneSlice = {
  zoneIndex: number;
  label: string;
  rangeLabel: string;
  color: string;
  seconds: number;
  percent: number;
};
type ZoneHighlightSegment = { start: number; end: number };

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

function normalizeHeartRateZoneUpperBounds(rawBounds: number[] | undefined): number[] {
  if (!Array.isArray(rawBounds) || rawBounds.length !== 4) {
    return [...DEFAULT_HEART_RATE_ZONE_UPPER_BOUNDS_BPM];
  }

  const parsed = rawBounds.map((value) => Math.round(Number(value)));
  if (parsed.some((value) => !Number.isFinite(value) || value < 40 || value > 260)) {
    return [...DEFAULT_HEART_RATE_ZONE_UPPER_BOUNDS_BPM];
  }

  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index] <= parsed[index - 1]) {
      return [...DEFAULT_HEART_RATE_ZONE_UPPER_BOUNDS_BPM];
    }
  }

  return parsed;
}

function heartRateZoneIndexForBpm(bpm: number, upperBoundsBpm: number[]): number {
  for (let index = 0; index < upperBoundsBpm.length; index += 1) {
    if (bpm <= upperBoundsBpm[index]) {
      return index;
    }
  }

  return upperBoundsBpm.length;
}

function heartRateZoneRangeLabel(zoneIndex: number, upperBoundsBpm: number[]): string {
  if (zoneIndex === 0) {
    return `≤ ${upperBoundsBpm[0]} bpm`;
  }

  if (zoneIndex < upperBoundsBpm.length) {
    return `${upperBoundsBpm[zoneIndex - 1] + 1}-${upperBoundsBpm[zoneIndex]} bpm`;
  }

  return `≥ ${upperBoundsBpm[upperBoundsBpm.length - 1] + 1} bpm`;
}

function buildHeartRateZoneBreakdown(
  samples: ActivitySample[],
  upperBoundsBpm: number[]
): { slices: HeartRateZoneSlice[]; trackedSeconds: number } | null {
  if (samples.length < 2) {
    return null;
  }

  const zoneSeconds = [0, 0, 0, 0, 0];
  let previousHrSample: { elapsedSeconds: number; heartRate: number } | null = null;

  for (const sample of samples) {
    const elapsedSeconds = Number(sample.elapsedSeconds);
    const heartRate = sample.heartRate == null ? NaN : Number(sample.heartRate);

    if (!Number.isFinite(elapsedSeconds)) {
      continue;
    }

    if (previousHrSample != null && elapsedSeconds > previousHrSample.elapsedSeconds) {
      const deltaSeconds = elapsedSeconds - previousHrSample.elapsedSeconds;
      if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        const zoneIndex = heartRateZoneIndexForBpm(previousHrSample.heartRate, upperBoundsBpm);
        zoneSeconds[zoneIndex] += deltaSeconds;
      }
    }

    if (Number.isFinite(heartRate) && heartRate > 0) {
      previousHrSample = { elapsedSeconds, heartRate };
    }
  }

  const trackedSeconds = zoneSeconds.reduce((sum, seconds) => sum + seconds, 0);
  if (trackedSeconds <= 0) {
    return null;
  }

  const slices: HeartRateZoneSlice[] = zoneSeconds.map((seconds, zoneIndex) => ({
    zoneIndex,
    label: `Z${zoneIndex + 1}`,
    rangeLabel: heartRateZoneRangeLabel(zoneIndex, upperBoundsBpm),
    color: HEART_RATE_ZONE_COLORS[zoneIndex],
    seconds,
    percent: seconds / trackedSeconds
  }));

  return { slices, trackedSeconds };
}

function buildHeartRateZoneHighlightSegments(
  points: CombinedChartPoint[],
  xAxisMode: ChartXAxisMode,
  xDomain: ChartZoomDomain,
  hoveredZoneIndex: number | null,
  upperBoundsBpm: number[]
): ZoneHighlightSegment[] {
  if (hoveredZoneIndex == null || points.length < 2) {
    return [];
  }

  const segments: ZoneHighlightSegment[] = [];
  let openStart: number | null = null;
  let previousX: number | null = null;

  for (const point of points) {
    const x = xAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds;
    const hr = point.heartRate;
    const inHoveredZone =
      hr != null && Number.isFinite(hr) && heartRateZoneIndexForBpm(hr, upperBoundsBpm) === hoveredZoneIndex;

    if (inHoveredZone) {
      if (openStart == null) {
        openStart = x;
      }
      previousX = x;
      continue;
    }

    if (openStart != null && previousX != null && previousX > openStart) {
      segments.push({ start: openStart, end: previousX });
    }
    openStart = null;
    previousX = null;
  }

  if (openStart != null && previousX != null && previousX > openStart) {
    segments.push({ start: openStart, end: previousX });
  }

  return segments
    .map((segment) => ({
      start: Math.max(segment.start, xDomain[0]),
      end: Math.min(segment.end, xDomain[1])
    }))
    .filter((segment) => segment.end > segment.start);
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
  zoneHighlightSegments,
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
  zoneHighlightSegments?: ZoneHighlightSegment[];
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
                cursor={CHART_TOOLTIP_CURSOR_LINE}
                content={
                  <SplitMetricTooltip
                    metricKey={dataKey}
                    metricLabel={valueLabel}
                    formatValue={valueFormatter}
                    xAxisMode={xAxisMode}
                  />
                }
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
              />
              {selectionDomain ? (
                <ReferenceArea
                  x1={selectionDomain[0]}
                  x2={selectionDomain[1]}
                  fill={CHART_SELECTION_FILL}
                            stroke={CHART_SELECTION_STROKE}
                            strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                  ifOverflow="extendDomain"
                />
              ) : null}
              {zoneHighlightSegments?.map((segment, index) => (
                <ReferenceArea
                  key={`zone-highlight-${segment.start}-${segment.end}-${index}`}
                  x1={segment.start}
                  x2={segment.end}
                  fill="rgba(220, 38, 38, 0.12)"
                  stroke="rgba(220, 38, 38, 0.2)"
                  ifOverflow="extendDomain"
                />
              ))}
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
                  activeDot={CHART_LINE_ACTIVE_DOT}
                  isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                />
              ) : (
                <Line
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  activeDot={CHART_LINE_ACTIVE_DOT}
                  isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function HeartRateZonesCard({
  slices,
  trackedSeconds,
  hoveredZoneIndex,
  onHoverZoneChange
}: {
  slices: HeartRateZoneSlice[];
  trackedSeconds: number;
  hoveredZoneIndex: number | null;
  onHoverZoneChange: (zoneIndex: number | null) => void;
}) {
  const nonEmptySlices = slices.filter((slice) => slice.seconds > 0);

  return (
    <section className="rounded-xl border border-border bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Heart Rate Zones</h3>
          <p className="mt-1 text-xs text-muted">
            Time in zone based on recorded heart-rate sample intervals.
          </p>
        </div>
        <p className="text-sm text-muted">
          Tracked HR time: <span className="font-semibold text-foreground">{formatDuration(trackedSeconds)}</span>
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={nonEmptySlices}
                dataKey="seconds"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius="52%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="rgba(var(--color-panel), 1)"
                strokeWidth={2}
                isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                onMouseEnter={(entry) => {
                  const slice = entry as HeartRateZoneSlice | undefined;
                  onHoverZoneChange(slice?.zoneIndex ?? null);
                }}
                onMouseLeave={() => onHoverZoneChange(null)}
              >
                {nonEmptySlices.map((slice) => (
                  <Cell
                    key={slice.label}
                    fill={slice.color}
                    fillOpacity={hoveredZoneIndex == null || hoveredZoneIndex === slice.zoneIndex ? 1 : 0.45}
                    strokeWidth={hoveredZoneIndex === slice.zoneIndex ? 3 : 2}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatDuration(Number(value))}
                labelFormatter={(_, payload) => {
                  const entry = payload?.[0]?.payload as HeartRateZoneSlice | undefined;
                  return entry ? `${entry.label} • ${entry.rangeLabel}` : '';
                }}
                contentStyle={CHART_TOOLTIP_STYLE}
                wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          {slices.map((slice) => (
            <div
              key={slice.label}
              onMouseEnter={() => onHoverZoneChange(slice.zoneIndex)}
              onMouseLeave={() => onHoverZoneChange(null)}
              className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                hoveredZoneIndex === slice.zoneIndex
                  ? 'border-accent/40 bg-accent/5'
                  : 'border-border/70 bg-bg/30'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: slice.color, opacity: slice.seconds > 0 ? 1 : 0.35 }}
                  />
                  <span className="text-sm font-medium text-foreground">{slice.label}</span>
                  <span className="truncate text-xs text-muted">{slice.rangeLabel}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-foreground">{formatDuration(slice.seconds)}</p>
                <p className="text-xs text-muted">{(slice.percent * 100).toFixed(1)}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
  const [heartRateZoneSamples, setHeartRateZoneSamples] = useState<ActivitySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reducedMapComplexity, setReducedMapComplexity] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('combined');
  const [chartSeriesVisibility, setChartSeriesVisibility] = useState<ChartSeriesVisibility>(() =>
    defaultChartSeriesVisibility()
  );
  const [hoveredHeartRateZoneIndex, setHoveredHeartRateZoneIndex] = useState<number | null>(null);
  const chartSamplesRequestRef = useRef(0);
  const heartRateZoneSamplesRequestRef = useRef(0);
  const routeMapRef = useRef<ActivityRouteMapHandle | null>(null);
  const accentTheme = useAppStore((state) => state.settings?.accentTheme);
  const chartMaxSamples = useAppStore((state) => state.settings?.chartMaxSamples ?? 2000);
  const heartRateZoneUpperBoundsBpm = useAppStore((state) =>
    normalizeHeartRateZoneUpperBounds(state.settings?.heartRateZoneUpperBoundsBpm)
  );
  const accentPalette = useMemo(() => getAccentThemePalette(accentTheme), [accentTheme]);
  const hasGpsTrack = Boolean(detail?.summary.hasGps && detail.track.length > 0);
  const chartXAxisMode: ChartXAxisMode = hasGpsTrack ? 'distance' : 'time';

  useEffect(() => {
    if (!id) {
      return;
    }

    chartSamplesRequestRef.current += 1;
    heartRateZoneSamplesRequestRef.current += 1;
    setChartSamples([]);
    setHeartRateZoneSamples([]);

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
  const minChartZoomSpan = chartXAxisMode === 'distance' ? CHART_MIN_ZOOM_SPAN_KM : CHART_MIN_ZOOM_SPAN_SECONDS;
  const chartXAxisValues = useMemo(
    () =>
      combinedChart.data.map((point) =>
        chartXAxisMode === 'distance' ? point.distanceKm : point.elapsedSeconds
      ),
    [chartXAxisMode, combinedChart.data]
  );
  const chartZoom = usePlotDragZoom<number>({
    parseLabel: parseNumberChartLabel,
    compareValues: (left, right) => left - right,
    values: chartXAxisValues,
    normalizeDomain: (anchor, current) => {
      const min = Math.max(0, Math.min(anchor, current));
      const max = Math.min(fullChartXAxisDomain[1], Math.max(anchor, current));

      if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < minChartZoomSpan) {
        return null;
      }

      return [min, max];
    },
    areValuesEqual: (left, right) => Math.abs(left - right) < 1e-6,
    areDomainsEqual: (left, right) =>
      areDomainsEqual(left, right, (first, second) => Math.abs(first - second) < Number.EPSILON * 100),
    onPointerMove: (event) => {
      routeMapRef.current?.setHoverTarget(readHoveredRouteCoordinate(event));
    }
  });

  const chartZoomDomain = chartZoom.zoomDomain;
  const chartSelectionDomain = chartZoom.selectionDomain;
  const setChartZoomDomain = chartZoom.setZoomDomain;
  const activeChartXAxisDomain = chartZoomDomain ?? fullChartXAxisDomain;
  const chartSampleDistanceZoomDomain = chartXAxisMode === 'distance' ? chartZoomDomain : null;

  useEffect(() => {
    if (!detail) {
      return;
    }

    setChartZoomDomain(null);
    chartZoom.clearSelection();
  }, [chartXAxisMode, chartZoom.clearSelection, detail?.summary.id, setChartZoomDomain]);

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

  useEffect(() => {
    if (!detail) {
      return;
    }

    const hasHeartRateSummary =
      detail.summary.avgHr != null || detail.summary.minHr != null || detail.summary.maxHr != null;
    if (!hasHeartRateSummary) {
      setHeartRateZoneSamples([]);
      return;
    }

    const requestId = heartRateZoneSamplesRequestRef.current + 1;
    heartRateZoneSamplesRequestRef.current = requestId;

    const loadZoneSamples = async () => {
      try {
        const response = await getActivitySamples(detail.summary.id);
        if (heartRateZoneSamplesRequestRef.current !== requestId) {
          return;
        }
        setHeartRateZoneSamples(response.samples);
      } catch (err) {
        if (heartRateZoneSamplesRequestRef.current !== requestId) {
          return;
        }
        console.error('Failed to load heart rate zone samples', err);
      }
    };

    void loadZoneSamples();
  }, [detail?.summary.avgHr, detail?.summary.id, detail?.summary.maxHr, detail?.summary.minHr]);

  const heartRateZoneBreakdown = useMemo(
    () => buildHeartRateZoneBreakdown(heartRateZoneSamples, heartRateZoneUpperBoundsBpm),
    [heartRateZoneSamples, heartRateZoneUpperBoundsBpm]
  );
  const heartRateZoneHighlightSegments = useMemo(
    () =>
      buildHeartRateZoneHighlightSegments(
        combinedChart.data,
        chartXAxisMode,
        activeChartXAxisDomain,
        hoveredHeartRateZoneIndex,
        heartRateZoneUpperBoundsBpm
      ),
    [
      activeChartXAxisDomain,
      chartXAxisMode,
      combinedChart.data,
      heartRateZoneUpperBoundsBpm,
      hoveredHeartRateZoneIndex
    ]
  );

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

  const handleChartMouseDown = chartZoom.onMouseDown;
  const handleChartMouseMove = chartZoom.onMouseMove;
  const handleChartMouseUp = chartZoom.onMouseUp;
  const handleChartMouseLeave = () => {
    routeMapRef.current?.clearHoverTarget();
    chartZoom.onMouseLeave();
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
                          cursor={CHART_TOOLTIP_CURSOR_LINE}
                          content={<CombinedChartTooltip xAxisMode={chartXAxisMode} />}
                          wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                          isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
                        />
                        {chartSelectionDomain ? (
                          <ReferenceArea
                            x1={chartSelectionDomain[0]}
                            x2={chartSelectionDomain[1]}
                            fill={CHART_SELECTION_FILL}
                            stroke={CHART_SELECTION_STROKE}
                            strokeOpacity={CHART_SELECTION_STROKE_OPACITY}
                            ifOverflow="extendDomain"
                          />
                        ) : null}
                        {heartRateZoneHighlightSegments.map((segment, index) => (
                          <ReferenceArea
                            key={`combined-zone-${segment.start}-${segment.end}-${index}`}
                            x1={segment.start}
                            x2={segment.end}
                            fill="rgba(220, 38, 38, 0.12)"
                            stroke="rgba(220, 38, 38, 0.2)"
                            ifOverflow="extendDomain"
                          />
                        ))}

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
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                            activeDot={CHART_LINE_ACTIVE_DOT}
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                            activeDot={CHART_LINE_ACTIVE_DOT}
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                            activeDot={CHART_LINE_ACTIVE_DOT}
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                            activeDot={CHART_LINE_ACTIVE_DOT}
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                            activeDot={CHART_LINE_ACTIVE_DOT}
                            isAnimationActive={CHART_IS_ANIMATION_ACTIVE}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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
                    zoneHighlightSegments={heartRateZoneHighlightSegments}
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

          {heartRateZoneBreakdown ? (
            <HeartRateZonesCard
              slices={heartRateZoneBreakdown.slices}
              trackedSeconds={heartRateZoneBreakdown.trackedSeconds}
              hoveredZoneIndex={hoveredHeartRateZoneIndex}
              onHoverZoneChange={setHoveredHeartRateZoneIndex}
            />
          ) : null}
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
