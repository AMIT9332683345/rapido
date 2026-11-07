export interface NavigationPoint {
  lat: number;
  lng: number;
}

export interface NavigationFix extends NavigationPoint {
  accuracy: number;
}

export interface NavigationLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface NavigationStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  location: NavigationPoint;
  geometry: NavigationLineString;
  type: string;
  modifier?: string;
}

export interface NavigationRoute {
  distanceMeters: number;
  durationSeconds: number;
  geometry: NavigationLineString;
  provider: string;
  isEstimate: boolean;
  steps: NavigationStep[];
  alternatives?: NavigationRoute[];
}

export interface NavigationBooking {
  id: string;
  status: string;
  pickup: NavigationPoint;
  destination: NavigationPoint;
}

export function navigationTarget(booking: NavigationBooking | null) {
  if (!booking || !['ACCEPTED', 'RIDER_ARRIVING', 'RIDER_ARRIVED', 'IN_PROGRESS'].includes(booking.status)) return null;
  const goal = booking.status === 'IN_PROGRESS' ? booking.destination : booking.pickup;
  return {
    key: `${booking.id}:${booking.status}:${booking.pickup.lat},${booking.pickup.lng}:${booking.destination.lat},${booking.destination.lng}`,
    bookingId: booking.id,
    goal,
    label: booking.status === 'IN_PROGRESS' ? 'Drop' : 'Pickup',
  };
}

export interface RouteIndex {
  coordinates: [number, number][];
  cumulativeMeters: number[];
  totalMeters: number;
}

const radians = Math.PI / 180;
const earthRadius = 6_371_000;

function segmentMeters(a: [number, number], b: [number, number]) {
  const h = Math.sin((b[1] - a[1]) * radians / 2) ** 2 +
    Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function indexLine(geometry: NavigationLineString): RouteIndex {
  const coordinates = geometry.coordinates;
  if (geometry.type !== 'LineString' || coordinates.length < 2 ||
      !coordinates.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90)) {
    throw new Error('Invalid navigation route geometry');
  }
  const cumulativeMeters = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulativeMeters.push(cumulativeMeters[i - 1] + segmentMeters(coordinates[i - 1], coordinates[i]));
  }
  return { coordinates, cumulativeMeters, totalMeters: cumulativeMeters[cumulativeMeters.length - 1] };
}

export interface RouteProjection {
  location: NavigationPoint;
  alongMeters: number;
  deviationMeters: number;
  segmentIndex: number;
}

export function projectOnRoute(index: RouteIndex, point: NavigationPoint, preferredAlongMeters = 0): RouteProjection {
  let best: RouteProjection | null = null;
  const scaleX = earthRadius * radians * Math.cos(point.lat * radians);
  const scaleY = earthRadius * radians;
  for (let i = 1; i < index.coordinates.length; i++) {
    const a = index.coordinates[i - 1];
    const b = index.coordinates[i];
    const ax = (a[0] - point.lng) * scaleX;
    const ay = (a[1] - point.lat) * scaleY;
    const dx = (b[0] - a[0]) * scaleX;
    const dy = (b[1] - a[1]) * scaleY;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    const deviationMeters = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    const alongMeters = index.cumulativeMeters[i - 1] + fraction * (index.cumulativeMeters[i] - index.cumulativeMeters[i - 1]);
    if (!best || deviationMeters < best.deviationMeters - 0.5 ||
        (Math.abs(deviationMeters - best.deviationMeters) <= 0.5 &&
          Math.abs(alongMeters - preferredAlongMeters) < Math.abs(best.alongMeters - preferredAlongMeters))) {
      best = {
        location: { lng: a[0] + fraction * (b[0] - a[0]), lat: a[1] + fraction * (b[1] - a[1]) },
        alongMeters,
        deviationMeters,
        segmentIndex: i - 1,
      };
    }
  }
  return best!;
}

export interface IndexedNavigation {
  route: NavigationRoute;
  line: RouteIndex;
  maneuverMeters: number[];
}

export function indexNavigation(route: NavigationRoute): IndexedNavigation {
  if (route.isEstimate || route.provider !== 'osrm' || !route.steps?.length) {
    throw new Error('Turn-by-turn navigation requires a real road route');
  }
  const line = indexLine(route.geometry);
  let expectedMeters = 0;
  let previousMeters = 0;
  const maneuverMeters = route.steps.map((step) => {
    const projected = projectOnRoute(line, step.location, expectedMeters);
    const along = step.type === 'arrive' ? line.totalMeters : Math.max(previousMeters, projected.alongMeters);
    expectedMeters += indexLine(step.geometry).totalMeters;
    previousMeters = along;
    return along;
  });
  return { route, line, maneuverMeters };
}

export interface NavigationProgress {
  progressMeters: number;
  remainingMeters: number;
  remainingSeconds: number;
  deviationMeters: number;
  nextStep: NavigationStep;
  nextStepIndex: number;
  distanceToManeuverMeters: number;
}

export function routeProgress(index: IndexedNavigation, fix: NavigationPoint, previousMeters = 0): NavigationProgress {
  const projection = projectOnRoute(index.line, fix, previousMeters);
  const progressMeters = Math.min(index.line.totalMeters, Math.max(previousMeters, projection.alongMeters));
  const remainingMeters = Math.max(0, index.line.totalMeters - progressMeters);
  let nextStepIndex = index.route.steps.findIndex((step, i) => step.type !== 'depart' && index.maneuverMeters[i] >= progressMeters - 2);
  if (nextStepIndex < 0) nextStepIndex = index.route.steps.length - 1;
  return {
    progressMeters,
    remainingMeters,
    remainingSeconds: index.line.totalMeters ? index.route.durationSeconds * remainingMeters / index.line.totalMeters : 0,
    deviationMeters: projection.deviationMeters,
    nextStep: index.route.steps[nextStepIndex],
    nextStepIndex,
    distanceToManeuverMeters: Math.max(0, index.maneuverMeters[nextStepIndex] - progressMeters),
  };
}

export interface RerouteGuard {
  deviationUpdates: number;
  lastRequestAt: number;
}

export function accurateFix(fix: NavigationFix): boolean {
  return Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 70;
}

export function updateRerouteGuard(guard: RerouteGuard, fix: NavigationFix, deviationMeters: number, now: number) {
  const deviationUpdates = accurateFix(fix) && deviationMeters >= 60 ? Math.min(2, guard.deviationUpdates + 1) : 0;
  return {
    guard: { ...guard, deviationUpdates },
    shouldReroute: deviationUpdates >= 2 && now - guard.lastRequestAt >= 30_000,
  };
}

export function maneuverDistance(meters: number): string {
  if (meters < 20) return 'Now';
  return meters < 1000 ? `In ${Math.round(meters / 10) * 10} m` : `In ${(meters / 1000).toFixed(1)} km`;
}
