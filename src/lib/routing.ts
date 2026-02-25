import type { TrackPoint } from '@/types';

export type RoutingProfile = 'bike' | 'walk';

export interface RouteWaypoint {
  lat: number;
  lon: number;
}

type OsrmRouteResponse = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    geometry?: {
      type?: string;
      coordinates?: number[][];
    };
  }>;
};

export const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

const PROFILE_SEGMENT_BY_PROFILE: Record<RoutingProfile, string> = {
  bike: 'cycling',
  walk: 'walking'
};

function toCoordinateKey(point: RouteWaypoint): string {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

export function dedupeConsecutiveWaypoints(points: RouteWaypoint[]): RouteWaypoint[] {
  const deduped: RouteWaypoint[] = [];

  for (const point of points) {
    if (deduped.length === 0) {
      deduped.push(point);
      continue;
    }

    if (toCoordinateKey(deduped[deduped.length - 1]) === toCoordinateKey(point)) {
      continue;
    }

    deduped.push(point);
  }

  return deduped;
}

function validatePoint(point: RouteWaypoint): asserts point is RouteWaypoint {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    throw new Error('Waypoint contains invalid coordinates.');
  }
}

export async function planRoute(
  waypoints: RouteWaypoint[],
  profile: RoutingProfile,
  options?: { signal?: AbortSignal }
): Promise<{ points: TrackPoint[]; distanceM: number }> {
  const cleaned = dedupeConsecutiveWaypoints(waypoints);

  if (cleaned.length < 2) {
    throw new Error('At least two waypoints are required to plan a route.');
  }

  for (const point of cleaned) {
    validatePoint(point);
  }

  const profileSegment = PROFILE_SEGMENT_BY_PROFILE[profile];
  const coordinateList = cleaned.map((point) => `${point.lon},${point.lat}`).join(';');

  const url = new URL(`/route/v1/${profileSegment}/${coordinateList}`, DEFAULT_OSRM_BASE_URL);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      signal: options?.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new Error('Routing request failed. Check your internet connection and try again.');
  }

  if (!response.ok) {
    throw new Error(`Routing service returned ${response.status}. Please try again.`);
  }

  const data = (await response.json()) as OsrmRouteResponse;
  if (data.code !== 'Ok') {
    throw new Error(data.message || 'Routing service could not compute a route for these points.');
  }

  const route = data.routes?.[0];
  const coordinates = route?.geometry?.coordinates;

  if (!route || !Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('Routing service returned an empty route. Try moving the waypoints.');
  }

  const points: TrackPoint[] = coordinates
    .map((coordinate) => {
      const lon = Number(coordinate?.[0]);
      const lat = Number(coordinate?.[1]);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return { lat, lon };
    })
    .filter((point): point is TrackPoint => point != null);

  if (points.length < 2) {
    throw new Error('Routing service returned invalid route coordinates.');
  }

  return {
    points,
    distanceM: Number.isFinite(route.distance) ? (route.distance as number) : 0
  };
}
