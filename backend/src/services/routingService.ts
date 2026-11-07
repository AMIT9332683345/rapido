import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { haversineMeters, isValidLatLng, type LatLng } from '../utils/geo.js';

export interface RouteLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  location: LatLng;
  geometry: RouteLineString;
  type: string;
  modifier?: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteLineString;
  provider: string;
  isEstimate: boolean;
  steps: RouteStep[];
  alternatives?: RouteResult[];
}

export interface RouteOptions {
  steps?: boolean;
  alternatives?: boolean;
}

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  ref?: string;
  geometry?: { coordinates?: [number, number][] };
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
    exit?: number;
  };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: { steps?: OsrmStep[] }[];
}

interface OsrmResponse {
  code?: string;
  message?: string;
  routes?: OsrmRoute[];
}

function lineString(coordinates: [number, number][] | undefined): RouteLineString {
  if (!Array.isArray(coordinates) || coordinates.length < 2 ||
      !coordinates.every((point) => Array.isArray(point) && isValidLatLng(point[1], point[0]))) {
    throw new Error('OSRM route geometry was invalid');
  }
  return { type: 'LineString', coordinates };
}

function nonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('OSRM route metrics were invalid');
  return Math.round(value);
}

function instructionFor(step: OsrmStep): string {
  const type = step.maneuver!.type!;
  const modifier = step.maneuver!.modifier;
  const direction = modifier?.replace(/-/g, ' ');
  const road = step.name?.trim() || step.ref?.trim();
  const onto = road ? ` onto ${road}` : '';
  if (type === 'depart') return `Head${direction ? ` ${direction}` : ' out'}${road ? ` on ${road}` : ''}`;
  if (type === 'arrive') return `Arrive at your destination${direction && direction !== 'straight' ? ` on the ${direction}` : ''}`;
  if (modifier === 'uturn') return `Make a U-turn${onto}`;
  if (['roundabout', 'rotary', 'roundabout turn'].includes(type)) {
    return `Enter the roundabout${step.maneuver!.exit ? ` and take exit ${step.maneuver!.exit}` : ''}${onto}`;
  }
  if (type === 'exit roundabout' || type === 'exit rotary') return `Exit the roundabout${onto}`;
  if (type === 'fork') return `Keep ${direction || 'straight'} at the fork${onto}`;
  if (type === 'merge') return `Merge${direction ? ` ${direction}` : ''}${onto}`;
  if (type === 'on ramp') return `Take the ramp${direction ? ` ${direction}` : ''}${onto}`;
  if (type === 'off ramp') return `Take the exit${direction ? ` ${direction}` : ''}${onto}`;
  if (type === 'end of road') return `At the end of the road, turn ${direction || 'ahead'}${onto}`;
  if (type === 'turn') return `Turn ${direction || 'ahead'}${onto}`;
  return `Continue${direction && direction !== 'straight' ? ` ${direction}` : ' straight'}${onto}`;
}

function normalizeStep(step: OsrmStep): RouteStep {
  const location = step.maneuver?.location;
  if (!location || !isValidLatLng(location[1], location[0]) || !step.maneuver?.type) {
    throw new Error('OSRM maneuver was invalid');
  }
  const distanceMeters = nonnegative(step.distance);
  let coordinates = step.geometry?.coordinates;
  if (distanceMeters === 0 && (!coordinates || coordinates.length < 2)) {
    coordinates = [location, location];
  }
  return {
    instruction: instructionFor(step),
    distanceMeters,
    durationSeconds: nonnegative(step.duration),
    location: { lat: location[1], lng: location[0] },
    geometry: lineString(coordinates),
    type: step.maneuver.type,
    ...(step.maneuver.modifier ? { modifier: step.maneuver.modifier } : {}),
  };
}

function normalizeRoute(route: OsrmRoute, stepsRequested: boolean): RouteResult {
  const steps = (route.legs ?? []).flatMap((leg) => leg.steps ?? []).map(normalizeStep);
  if (stepsRequested && !steps.length) throw new Error('OSRM navigation steps were empty');
  return {
    distanceMeters: nonnegative(route.distance),
    durationSeconds: nonnegative(route.duration),
    geometry: lineString(route.geometry?.coordinates),
    provider: 'osrm',
    isEstimate: false,
    steps,
  };
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
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
    },
    provider: 'straight-line-estimate',
    isEstimate: true,
    steps: [],
  };
}

export async function getRoadRoute(from: LatLng, to: LatLng, options: RouteOptions = {}): Promise<RouteResult> {
  if (!isValidLatLng(from.lat, from.lng) || !isValidLatLng(to.lat, to.lng)) {
    throw HttpError.badRequest('Invalid routing coordinates');
  }
  const base = env.OSRM_BASE_URL.replace(/\/+$/, '');
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=${options.alternatives === true}&steps=${options.steps === true}`;

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
    const primary = normalizeRoute(data.routes[0], options.steps === true);
    if (options.alternatives === true) {
      primary.alternatives = data.routes.slice(1).map((route) => normalizeRoute(route, options.steps === true));
    }
    return primary;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (env.ROUTING_ALLOW_ESTIMATE && !options.steps) {
      console.warn('[routing] OSRM unavailable, using labelled straight-line estimate:', (error as Error).message);
      return estimateRoute(from, to);
    }
    throw HttpError.unavailable(
      options.steps
        ? 'Road navigation is temporarily unavailable. Please try again in a moment.'
        : 'The routing service is temporarily unavailable, so we cannot price this ride safely. Please try again in a moment.',
      { code: 'ROUTING_UNAVAILABLE' },
    );
  }
}

export function getNavigationRoute(from: LatLng, to: LatLng, options: Pick<RouteOptions, 'alternatives'> = {}) {
  return getRoadRoute(from, to, { ...options, steps: true });
}
