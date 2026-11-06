export interface Coords {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
}

export function getPosition(timeout = 15000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device does not support location services.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
        }),
      (error) => reject(new Error(geoErrorMessage(error))),
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    );
  });
}

export function watchPosition(
  onUpdate: (coords: Coords) => void,
  onError?: (message: string) => void,
): () => void {
  if (!('geolocation' in navigator)) {
    onError?.('This device does not support location services.');
    return () => undefined;
  }
  const id = navigator.geolocation.watchPosition(
    (position) =>
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      }),
    (error) => onError?.(geoErrorMessage(error)),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function geoErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission was denied. Allow location access in your browser settings, or place the pin on the map.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your location is not available right now. Move to an open area or pick the spot on the map.';
  }
  if (error.code === error.TIMEOUT) {
    return 'Getting your location took too long. Try again or place the pin on the map.';
  }
  return 'Could not get your location. You can still choose a spot on the map.';
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function bearingBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  return (Math.atan2(y, x) * 180) / Math.PI;
}
