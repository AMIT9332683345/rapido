import { ServiceAreaModel, type ServiceAreaDocument } from '../models/ServiceArea.js';
import { HttpError } from '../utils/httpError.js';
import { pointInGeoJson } from '../utils/geo.js';

let cachedArea: ServiceAreaDocument | null = null;
let cachedAt = 0;
const CACHE_MS = 15_000;

export function invalidateServiceAreaCache(): void {
  cachedArea = null;
  cachedAt = 0;
}

export async function getActiveServiceArea(force = false): Promise<ServiceAreaDocument> {
  if (!force && cachedArea && Date.now() - cachedAt < CACHE_MS) return cachedArea;
  const area = await ServiceAreaModel.findOne({ isActive: true }).sort({ updatedAt: -1 });
  if (!area) {
    throw HttpError.unavailable(
      'The service area is not configured yet. Run the seed command or configure it in the admin panel.',
      { code: 'NO_SERVICE_AREA' },
    );
  }
  cachedArea = area;
  cachedAt = Date.now();
  return area;
}

export async function assertBookablePoint(
  lat: number,
  lng: number,
): Promise<ServiceAreaDocument> {
  const area = await getActiveServiceArea();
  if (!area.isAvailable) {
    throw HttpError.conflict(
      area.unavailableMessage || 'Rides are paused right now. Please try again later.',
      'SERVICE_PAUSED',
    );
  }
  if (!pointInGeoJson([lng, lat], area.boundary)) {
    throw HttpError.badRequest(
      `That place is outside the ${area.name}. Choose a pickup and destination inside the service area.`,
      { code: 'OUTSIDE_SERVICE_AREA' },
    );
  }
  return area;
}

export function isInsideServiceArea(
  area: { boundary: unknown },
  lat: number,
  lng: number,
): boolean {
  return pointInGeoJson([lng, lat], area.boundary);
}

const ROUTE_SAMPLE_LIMIT = 200;

/**
 * A road route can legally leave the polygon — over a tidal channel to another
 * island, or along mainland roads beyond the service area — and distance, fare
 * and ETA priced on it are meaningless. Straight-line fallbacks are skipped
 * because they carry no road at all and are already labelled as estimates.
 */
export function assertRouteInServiceArea(
  area: { boundary?: unknown },
  route: { geometry?: { coordinates?: [number, number][] } | null; isEstimate?: boolean },
): void {
  if (route.isEstimate) return;
  const coordinates = route.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;

  const step = coordinates.length <= 1_000
    ? 1
    : Math.max(1, Math.ceil(coordinates.length / ROUTE_SAMPLE_LIMIT));
  const samples = new Set<number>([0, coordinates.length - 1]);
  for (let index = 0; index < coordinates.length; index += step) samples.add(index);

  for (const index of samples) {
    const [lng, lat] = coordinates[index];
    if (!pointInGeoJson([lng, lat], area.boundary)) {
      throw HttpError.conflict(
        'The road route between these places leaves the service area. Choose stops connected inside it.',
        'ROUTE_OUTSIDE_SERVICE_AREA',
      );
    }
  }
}
