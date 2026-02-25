import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { save } from '@tauri-apps/plugin-dialog';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';

import { MaximizableMapFrame } from '@/components/MaximizableMapFrame';
import { formatDistanceKm } from '@/lib/format';
import { buildTrackGpx, sanitizeGpxFilename } from '@/lib/gpx';
import { US_DEFAULT_CENTER, US_DEFAULT_ZOOM } from '@/lib/mapStyles';
import { planRoute, type RoutingProfile, type RouteWaypoint } from '@/lib/routing';
import { getAccentThemePalette } from '@/lib/theme';
import { writeGpxFile } from '@/lib/tauri';
import { useManagedMapLibre } from '@/lib/useManagedMapLibre';
import { useAppStore } from '@/store/useAppStore';
import type { TrackPoint } from '@/types';

const WAYPOINT_SOURCE_ID = 'planner-waypoints-source';
const WAYPOINT_LAYER_ID = 'planner-waypoints-layer';
const ROUTE_SOURCE_ID = 'planner-route-source';
const ROUTE_OUTER_LAYER_ID = 'planner-route-outer-layer';
const ROUTE_INNER_LAYER_ID = 'planner-route-inner-layer';
const WAYPOINT_DUPLICATE_EPSILON = 0.000001;

type PlannerWaypoint = RouteWaypoint & { id: string };
type RouteStatus = 'idle' | 'routing' | 'ready' | 'error';

function pointsEqual(a: RouteWaypoint, b: RouteWaypoint) {
  return Math.abs(a.lat - b.lat) <= WAYPOINT_DUPLICATE_EPSILON &&
    Math.abs(a.lon - b.lon) <= WAYPOINT_DUPLICATE_EPSILON;
}

function fitMapToPoints(map: maplibregl.Map, points: RouteWaypoint[] | TrackPoint[]) {
  if (points.length === 0) {
    return;
  }

  if (points.length === 1) {
    map.easeTo({
      center: [points[0].lon, points[0].lat],
      zoom: 13,
      duration: 0
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds(
    [points[0].lon, points[0].lat],
    [points[0].lon, points[0].lat]
  );

  for (const point of points) {
    bounds.extend([point.lon, point.lat]);
  }

  map.fitBounds(bounds, {
    padding: 48,
    duration: 0,
    maxZoom: 14
  });
}

function toWaypointFeatureCollection(waypoints: PlannerWaypoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: waypoints.map((waypoint, index) => ({
      type: 'Feature',
      id: waypoint.id,
      properties: {
        label: String(index + 1)
      },
      geometry: {
        type: 'Point',
        coordinates: [waypoint.lon, waypoint.lat]
      }
    }))
  };
}

function toRouteFeatureCollection(points: TrackPoint[]): FeatureCollection<LineString> {
  if (points.length < 2) {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: points.map((point) => [point.lon, point.lat] as [number, number])
        }
      }
    ]
  };
}

function RoutePlannerMap({
  waypoints,
  routePoints,
  onMapClick
}: {
  waypoints: PlannerWaypoint[];
  routePoints: TrackPoint[];
  onMapClick: (point: RouteWaypoint) => void;
}) {
  const accentTheme = useAppStore((state) => state.settings?.accentTheme);
  const accentPalette = useMemo(() => getAccentThemePalette(accentTheme), [accentTheme]);
  const { containerRef, mapRef } = useManagedMapLibre({
    reducedComplexity: false,
    initialCenter: US_DEFAULT_CENTER,
    initialZoom: US_DEFAULT_ZOOM
  });
  const waypointData = useMemo(() => toWaypointFeatureCollection(waypoints), [waypoints]);
  const routeData = useMemo(() => toRouteFeatureCollection(routePoints), [routePoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return undefined;
    }

    const syncMapLayers = () => {
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, {
          type: 'geojson',
          data: routeData
        });
      } else {
        (map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource).setData(routeData);
      }

      if (!map.getSource(WAYPOINT_SOURCE_ID)) {
        map.addSource(WAYPOINT_SOURCE_ID, {
          type: 'geojson',
          data: waypointData
        });
      } else {
        (map.getSource(WAYPOINT_SOURCE_ID) as GeoJSONSource).setData(waypointData);
      }

      if (!map.getLayer(ROUTE_OUTER_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_OUTER_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          paint: {
            'line-color': accentPalette.accentTintHex,
            'line-opacity': 0.95,
            'line-width': 8
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
      }

      if (!map.getLayer(ROUTE_INNER_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_INNER_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          paint: {
            'line-color': accentPalette.accentHex,
            'line-opacity': 1,
            'line-width': 4
          },
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          }
        });
      }

      if (!map.getLayer(WAYPOINT_LAYER_ID)) {
        map.addLayer({
          id: WAYPOINT_LAYER_ID,
          type: 'circle',
          source: WAYPOINT_SOURCE_ID,
          paint: {
            'circle-radius': 6,
            'circle-color': accentPalette.accentHex,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        });
      }

      map.setPaintProperty(ROUTE_OUTER_LAYER_ID, 'line-color', accentPalette.accentTintHex);
      map.setPaintProperty(ROUTE_INNER_LAYER_ID, 'line-color', accentPalette.accentHex);
      map.setPaintProperty(WAYPOINT_LAYER_ID, 'circle-color', accentPalette.accentHex);
    };

    if (map.isStyleLoaded()) {
      syncMapLayers();
      return undefined;
    }

    map.once('load', syncMapLayers);
    return () => {
      map.off('load', syncMapLayers);
    };
  }, [accentPalette.accentHex, accentPalette.accentTintHex, mapRef, routeData, waypointData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return undefined;
    }

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      onMapClick({
        lat: event.lngLat.lat,
        lon: event.lngLat.lng
      });
    };

    const bindClick = () => {
      map.on('click', handleClick);
      map.getCanvas().style.cursor = 'crosshair';
    };

    const unbindClick = () => {
      map.off('click', handleClick);
      map.getCanvas().style.cursor = '';
    };

    if (map.isStyleLoaded()) {
      bindClick();
      return unbindClick;
    }

    map.once('load', bindClick);
    return () => {
      map.off('load', bindClick);
      unbindClick();
    };
  }, [mapRef, onMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return undefined;
    }

    const applyFit = () => {
      if (routePoints.length >= 2) {
        fitMapToPoints(map, routePoints);
        return;
      }

      if (waypoints.length >= 2) {
        fitMapToPoints(map, waypoints);
      }
    };

    if (map.isStyleLoaded()) {
      applyFit();
      return undefined;
    }

    map.once('load', applyFit);
    return () => {
      map.off('load', applyFit);
    };
  }, [mapRef, routePoints, waypoints]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function routeStatusLabel(status: RouteStatus): string {
  switch (status) {
    case 'routing':
      return 'Routing...';
    case 'ready':
      return 'Route ready';
    case 'error':
      return 'Route error';
    default:
      return 'Click to add waypoints';
  }
}

export function RoutePlannerPage() {
  const [routeName, setRouteName] = useState('Course');
  const [profile, setProfile] = useState<RoutingProfile>('bike');
  const [waypoints, setWaypoints] = useState<PlannerWaypoint[]>([]);
  const [routeStatus, setRouteStatus] = useState<RouteStatus>('idle');
  const [routeError, setRouteError] = useState<string | null>(null);
  const [snappedGeometry, setSnappedGeometry] = useState<TrackPoint[]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const routeRequestSeq = useRef(0);

  const handleAddWaypoint = useCallback((point: RouteWaypoint) => {
    setExportMessage(null);
    setExportError(null);
    setWaypoints((current) => {
      const previous = current[current.length - 1];
      if (previous && pointsEqual(previous, point)) {
        return current;
      }

      return [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ...point
        }
      ];
    });
  }, []);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRouteStatus('idle');
      setRouteError(null);
      setSnappedGeometry([]);
      setDistanceMeters(null);
      return;
    }

    const requestId = ++routeRequestSeq.current;
    const abortController = new AbortController();

    setRouteStatus('routing');
    setRouteError(null);
    setExportMessage(null);

    void planRoute(waypoints, profile, { signal: abortController.signal })
      .then((result) => {
        if (abortController.signal.aborted || routeRequestSeq.current !== requestId) {
          return;
        }

        setSnappedGeometry(result.points);
        setDistanceMeters(result.distanceM);
        setRouteStatus('ready');
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setSnappedGeometry([]);
        setDistanceMeters(null);
        setRouteStatus('error');
        setRouteError(message);
      });

    return () => {
      abortController.abort();
    };
  }, [profile, waypoints]);

  const handleUndoLast = () => {
    setExportMessage(null);
    setExportError(null);
    setWaypoints((current) => current.slice(0, -1));
  };

  const handleClear = () => {
    setExportMessage(null);
    setExportError(null);
    setWaypoints([]);
  };

  const canExport = snappedGeometry.length >= 2 && routeStatus === 'ready' && !exporting;

  const handleExport = async () => {
    if (!canExport) {
      return;
    }

    setExportError(null);
    setExportMessage(null);
    setExporting(true);

    try {
      const gpx = buildTrackGpx({
        name: routeName,
        points: snappedGeometry
      });
      const suggestedName = sanitizeGpxFilename(routeName);
      const selectedPath = await save({
        title: 'Export GPX Route',
        defaultPath: suggestedName,
        filters: [
          {
            name: 'GPX files',
            extensions: ['gpx']
          }
        ]
      });

      if (!selectedPath || Array.isArray(selectedPath)) {
        return;
      }

      const writtenPath = await writeGpxFile(selectedPath, gpx);
      setExportMessage(`Saved GPX to ${writtenPath}`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Planner</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground">Route Planner + GPX Export</h2>
        <p className="mt-2 text-sm text-muted">
          Click the map to add waypoints, build a road-snapped route, and export a GPX track. 
          Routing uses a public online service and may fail or rate-limit.
        </p>
      </header>

      {routeError ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
          {routeError}
        </p>
      ) : null}

      {exportError ? (
        <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
          {exportError}
        </p>
      ) : null}

      {exportMessage ? (
        <p className="rounded-lg border border-border bg-panel p-3 text-sm text-foreground">
          {exportMessage}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-panel p-4">
        <div className="grid gap-4 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <label className="block text-xs uppercase tracking-[0.14em] text-muted">
              Route name
              <input
                type="text"
                value={routeName}
                onChange={(event) => setRouteName(event.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-foreground outline-none ring-0 focus:border-accent/60"
                placeholder="Course"
              />
            </label>
          </div>

          <div className="xl:col-span-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Routing profile</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setProfile('bike')}
                aria-pressed={profile === 'bike'}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  profile === 'bike'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-bg text-muted hover:text-foreground'
                }`}
              >
                Bike
              </button>
              <button
                type="button"
                onClick={() => setProfile('walk')}
                aria-pressed={profile === 'walk'}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  profile === 'walk'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-bg text-muted hover:text-foreground'
                }`}
              >
                Walk/Run
              </button>
            </div>
          </div>

          <div className="xl:col-span-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">Route status</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-foreground">
                {routeStatusLabel(routeStatus)}
              </span>
              <button
                type="button"
                onClick={handleUndoLast}
                disabled={waypoints.length === 0 || routeStatus === 'routing'}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Undo last
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={waypoints.length === 0}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={!canExport}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? 'Exporting...' : 'Export GPX'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Waypoints</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{waypoints.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Route distance</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {distanceMeters != null ? formatDistanceKm(distanceMeters) : 'n/a'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Route points</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{snappedGeometry.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Map</h3>
            <p className="text-sm text-muted">
              Left-click to add waypoints. The route recalculates automatically after each change.
            </p>
          </div>
        </div>

        <MaximizableMapFrame
          label="Route planner map"
          collapsedHeightClassName="h-[520px] overflow-hidden rounded-xl border border-border"
          topLeftActions={
            <div className="rounded-md border border-border bg-panel/90 px-3 py-1.5 text-xs text-muted backdrop-blur">
              {routeStatusLabel(routeStatus)}
            </div>
          }
        >
          <RoutePlannerMap
            waypoints={waypoints}
            routePoints={snappedGeometry}
            onMapClick={handleAddWaypoint}
          />
        </MaximizableMapFrame>
      </section>
    </div>
  );
}
