import { env } from '../config/env.js';
import { RiderModel } from '../models/Rider.js';
import { HttpError } from '../utils/httpError.js';
import { haversineMeters, type LatLng } from '../utils/geo.js';
import { getActiveServiceArea, isInsideServiceArea } from './settingsService.js';

export interface PlaceResult {
  label: string;
  address: string;
  lat: number;
  lng: number;
  type: string;
  insideServiceArea: boolean;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}

const cache = new Map<string, { expires: number; data: unknown }>();
const CACHE_MS = 5 * 60 * 1000;

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached(key: string, data: unknown): void {
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: Date.now() + CACHE_MS });
}

let nominatimChain: Promise<unknown> = Promise.resolve();
let lastNominatimCall = 0;

/** Nominatim policy: one request per second, descriptive User-Agent. */
async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const run = async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCall));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimCall = Date.now();

    const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': env.OSM_USER_AGENT,
          Accept: 'application/json',
          'Accept-Language': 'en',
        },
        signal: AbortSignal.timeout(9000),
      });
    } catch {
      throw HttpError.unavailable(
        'Place search is temporarily unavailable. You can still drop a pin on the map.',
        { code: 'GEOCODER_UNAVAILABLE' },
      );
    }
    if (!response.ok) {
      throw HttpError.unavailable('Place search is temporarily unavailable.', {
        code: 'GEOCODER_UNAVAILABLE',
      });
    }
    return response.json();
  };

  const result = nominatimChain.then(run, run);
  nominatimChain = result.catch(() => undefined);
  return result;
}

function toPlace(item: NominatimItem, areaBoundary: unknown): PlaceResult {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const label =
    item.name?.trim() ||
    item.display_name.split(',')[0]?.trim() ||
    `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return {
    label,
    address: item.display_name,
    lat,
    lng,
    type: item.type || item.class || 'place',
    insideServiceArea: isInsideServiceArea({ boundary: areaBoundary }, lat, lng),
  };
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = `search:${q.toLowerCase()}`;
  const cached = getCached<PlaceResult[]>(key);
  if (cached) return cached;

  const area = await getActiveServiceArea();
  const center = area.center!.coordinates;

  const data = (await nominatim('search', {
    format: 'jsonv2',
    limit: '10',
    q,
    viewbox: `${center[0] - 0.35},${center[1] + 0.3},${center[0] + 0.35},${center[1] - 0.3}`,
    bounded: '1',
    addressdetails: '1',
  })) as NominatimItem[];

  const results = (Array.isArray(data) ? data : [])
    .map((item) => toPlace(item, area.boundary))
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));

  setCached(key, results);
  return results;
}

export async function reverseGeocode(lat: number, lng: number): Promise<PlaceResult | null> {
  const key = `reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
  const cached = getCached<PlaceResult | null>(key);
  if (cached !== null) return cached;

  const area = await getActiveServiceArea();
  try {
    const item = (await nominatim('reverse', {
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      zoom: '18',
      addressdetails: '1',
    })) as NominatimItem;

    if (!item || !item.display_name) return null;
    const place = toPlace(item, area.boundary);
    setCached(key, place);
    return place;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return null;
  }
}

export interface NearbyRider {
  id: string;
  name: string;
  photoUrl: string | null;
  rating: number;
  totalRides: number;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export async function findNearbyRiders(
  point: LatLng,
  radiusMeters: number,
): Promise<NearbyRider[]> {
  const area = await getActiveServiceArea();
  const riders = await RiderModel.find({
    status: 'approved',
    isOnline: true,
    currentBooking: null,
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
        $maxDistance: radiusMeters,
      },
    },
  })
    .limit(20)
    .select('name photoUrl rating totalRides currentLocation');

  return riders
    .filter((rider) => {
      const coords = rider.currentLocation?.coordinates;
      return (
        Array.isArray(coords) &&
        isInsideServiceArea(area as unknown as { boundary: unknown }, coords[1], coords[0])
      );
    })
    .map((rider) => {
      const coords = rider.currentLocation!.coordinates as [number, number];
      return {
        id: String(rider._id),
        name: rider.name,
        photoUrl: rider.photoUrl ?? null,
        rating: rider.rating ?? 5,
        totalRides: rider.totalRides ?? 0,
        lat: coords[1],
        lng: coords[0],
        distanceMeters: Math.round(
          haversineMeters(point, { lat: coords[1], lng: coords[0] }),
        ),
      };
    });
}
