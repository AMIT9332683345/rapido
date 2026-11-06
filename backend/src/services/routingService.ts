import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { haversineMeters, type LatLng } from '../utils/geo.js';

export interface RouteLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteLineString;
  provider: string;
  isEstimate: boolean;
}

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
  }[];
}

function estimateRoute(from: LatLng, to: LatLng): RouteResult {
  const straight = haversineMeters(from, to);
  const distanceMeters = Math.round(straight * 1.35);
  const durationSeconds = Math.round((distanceMeters / 1000 / 22) * 3600);
  return {
    distanceMeters,
    durationSeconds,
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
    provider: 'straight-line-estimate',
    isEstimate: true,
  };
}

/**
 * Real road routing through a self-hosted OSRM instance. The public OSRM demo
 * server is acceptable for local development only and must be replaced in
 * production via OSRM_BASE_URL.
 */
export async function getRoadRoute(from: LatLng, to: LatLng): Promise<RouteResult> {
  const base = env.OSRM_BASE_URL.replace(/\/+$/, '');
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
    const data = (await response.json()) as OsrmResponse;

    if (data.code !== 'Ok' || !data.routes?.length) {
      if (data.code === 'NoRoute') {
        throw HttpError.badRequest(
          'No road route connects these two points. They may be separated by a river or missing road data.',
          { code: 'NO_ROAD_ROUTE' },
        );
      }
      throw new Error(`OSRM returned ${data.code || 'no routes'}`);
    }

    const route = data.routes[0];
    const coordsOut = route.geometry?.coordinates;
    if (!Array.isArray(coordsOut) || coordsOut.length < 2) {
      throw new Error('OSRM route geometry was empty');
    }

    return {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      geometry: { type: 'LineString', coordinates: coordsOut },
      provider: 'osrm',
      isEstimate: false,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;

    if (env.ROUTING_ALLOW_ESTIMATE) {
      console.warn('[routing] OSRM unavailable, using labelled straight-line estimate:', (error as Error).message);
      return estimateRoute(from, to);
    }

    throw HttpError.unavailable(
      'The routing service is temporarily unavailable, so we cannot price this ride safely. Please try again in a moment.',
      { code: 'ROUTING_UNAVAILABLE' },
    );
  }
}
