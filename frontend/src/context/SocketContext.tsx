import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { showLocalNotification } from '../lib/push';
import type { AppNotification } from '../types';
import { useAuth } from './AuthContext';

interface SocketValue {
  socket: Socket | null;
  connected: boolean;
  joinBooking: (bookingId: string) => void;
  leaveBooking: (bookingId: string) => void;
}

const SocketContext = createContext<SocketValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const token = session?.token ?? null;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const joined = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token) {
      setSocket((current) => {
        current?.disconnect();
        return null;
      });
      setConnected(false);
      joined.current.clear();
      return;
    }

    const instance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 12000,
    });

    instance.on('connect', () => {
      setConnected(true);
      joined.current.forEach((bookingId) => {
        instance.emit('booking:subscribe', { bookingId });
      });
    });
    instance.on('disconnect', () => setConnected(false));
    instance.on('connect_error', () => setConnected(false));

    instance.on('notification', (payload: AppNotification) => {
      window.dispatchEvent(new CustomEvent('amit:notification', { detail: payload }));
      if (document.visibilityState === 'hidden') {
        const link =
          payload.data?.link ||
          (payload.data?.bookingId
            ? `${session?.role === 'rider' ? '/rider/ride/' : '/app/ride/'}${payload.data.bookingId}`
            : '/');
        void showLocalNotification(payload.title, payload.body, link, `note-${payload.id}`);
      }
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, session?.role]);

  const value = useMemo<SocketValue>(
    () => ({
      socket,
      connected,
      joinBooking: (bookingId: string) => {
        joined.current.add(bookingId);
        socket?.emit('booking:subscribe', { bookingId });
      },
      leaveBooking: (bookingId: string) => {
        joined.current.delete(bookingId);
        socket?.emit('booking:unsubscribe', { bookingId });
      },
    }),
    [socket, connected],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside SocketProvider');
  return context;
}

export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => handlerRef.current(payload);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}
