import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { getPosition, watchPosition, type Coords } from './geolocation';
import { useSocket } from '../context/SocketContext';

/**
 * Watches the rider's GPS while `tracking` is true and pushes positions to the
 * backend: through the authenticated socket when connected, REST otherwise.
 */
export function useRiderGps({ tracking, broadcast }: { tracking: boolean; broadcast: boolean }) {
  const { socket } = useSocket();
  const [position, setPosition] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<Coords | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!tracking) return;
    const stop = watchPosition(
      (coords) => {
        latest.current = coords;
        setPosition(coords);
        setError(null);
      },
      (message) => setError(message),
    );
    return stop;
  }, [tracking]);

  const send = useCallback(
    (coords: Coords) => {
      if (Date.now() - lastSent.current < 2500) return;
      lastSent.current = Date.now();
      const payload = {
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        accuracy: coords.accuracy ?? null,
      };
      if (socket?.connected) {
        socket.emit('rider:location', payload);
      } else {
        void api.put('/rider/location', payload).catch(() => undefined);
      }
    },
    [socket],
  );

  useEffect(() => {
    if (!broadcast) return;
    const timer = window.setInterval(() => {
      if (latest.current) send(latest.current);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [broadcast, send]);

  const refresh = useCallback(async () => {
    try {
      const coords = await getPosition();
      latest.current = coords;
      setPosition(coords);
      setError(null);
      return coords;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  }, []);

  return { position, error, refresh };
}
