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
