import { useEffect, useMemo, useRef, useState } from 'react';
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
import { US_DEFAULT_CENTER, US_DEFAULT_ZOOM, getMapStyle } from '@/lib/mapStyles';
import { MaximizableMapFrame } from '@/components/MaximizableMapFrame';
import { MetricCard } from '@/components/MetricCard';
import type { ActivityDetail, TrackPoint } from '@/types';

const ACTIVITY_ROUTE_SOURCE_ID = 'activity-route-source';
const ACTIVITY_ROUTE_LAYER_ID = 'activity-route-layer';

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
    map.easeTo({
      center: US_DEFAULT_CENTER,
      zoom: US_DEFAULT_ZOOM,
      duration: 520
    });
    return;
  }

  if (track.length === 1) {
    map.easeTo({
      center: [track[0].lon, track[0].lat],
      zoom: 14,
      duration: 520
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
    duration: 620,
    maxZoom: 15
  });
}

function ActivityRouteMap({ track }: { track: TrackPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const trackSource = useMemo(() => toRouteFeatureCollection(track), [track]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(false),
      center: US_DEFAULT_CENTER,
      zoom: US_DEFAULT_ZOOM,
      pitchWithRotate: false,
      dragRotate: false
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.scrollZoom.setWheelZoomRate(1 / 520);
    map.scrollZoom.setZoomRate(1 / 130);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if (!container || !map) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

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
            'line-color': '#FC4C02',
            'line-width': 4,
            'line-opacity': 0.95
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
      }

      fitMapToTrack(map, track);
    };

    if (map.isStyleLoaded()) {
      syncTrack();
      return undefined;
    }

    map.once('load', syncTrack);
    return () => {
      map.off('load', syncTrack);
    };
  }, [track, trackSource]);

  return <div ref={containerRef} className="h-full w-full" />;
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Activity Detail</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground">{detail.summary.category}</h2>
          <p className="mt-1 text-sm text-muted">{formatDateTime(detail.summary.activityStart)}</p>
        </div>
        <Link
          to="/activities"
          className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
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
          <h3 className="text-lg font-semibold text-foreground">Route</h3>
        </div>
        <MaximizableMapFrame label="route map" collapsedHeightClassName="h-80">
          {detail.track.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No GPS track available
            </div>
          ) : (
            <ActivityRouteMap track={detail.track} />
          )}
        </MaximizableMapFrame>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="text-lg font-semibold text-foreground">Speed vs Time</h3>
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
          <h3 className="text-lg font-semibold text-foreground">Heart Rate vs Time</h3>
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
          <h3 className="text-lg font-semibold text-foreground">Elevation</h3>
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
