export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function toGeoPoint(lat: number, lng: number): GeoPoint {
  return { type: 'Point', coordinates: [lng, lat] };
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Ring = number[][];

function pointInRing(point: [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Accepts a GeoJSON Polygon or MultiPolygon and tests the point against outer
 * rings minus holes. Coordinates are GeoJSON order: [lng, lat].
 */
export function pointInGeoJson(point: [number, number], geometry: unknown): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  const g = geometry as { type?: string; coordinates?: unknown };
  if (g.type === 'Polygon') {
    const rings = g.coordinates as Ring[];
    if (!Array.isArray(rings) || !rings.length) return false;
    if (!pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some((hole) => pointInRing(point, hole));
  }
  if (g.type === 'MultiPolygon') {
    const polygons = g.coordinates as Ring[][];
    return polygons.some((rings) => {
      if (!Array.isArray(rings) || !rings.length) return false;
      if (!pointInRing(point, rings[0])) return false;
      return !rings.slice(1).some((hole) => pointInRing(point, hole));
    });
  }
  return false;
}

export function roundMoney(value: number): number {
  return Math.max(0, Math.round(value));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function shortCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
