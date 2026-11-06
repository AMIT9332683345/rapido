import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { allowedOrigins } from '../config/env.js';
import { AdminModel } from '../models/Admin.js';
import { BookingModel } from '../models/Booking.js';
import { RiderModel } from '../models/Rider.js';
import { UserModel } from '../models/User.js';
import { verifyAccessToken, type Role } from '../utils/jwt.js';
import { currentOfferForRider, handleRiderLocation } from '../services/bookingService.js';
import { rooms, setIo } from './registry.js';

interface SocketAuth {
  id: string;
  role: Role;
}

type Ack = (response: { ok: boolean; throttled?: boolean; error?: string }) => void;

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
});

async function loadSocketAuth(token: string): Promise<SocketAuth> {
  const payload = verifyAccessToken(token);
  if (payload.role === 'customer') {
    const user = await UserModel.findById(payload.sub).select('isBlocked').lean();
    if (!user || user.isBlocked) throw new Error('Unauthorized');
  } else if (payload.role === 'rider') {
    const rider = await RiderModel.findById(payload.sub).select('_id').lean();
    if (!rider) throw new Error('Unauthorized');
  } else if (payload.role === 'admin') {
    const admin = await AdminModel.findById(payload.sub).select('_id').lean();
    if (!admin) throw new Error('Unauthorized');
  } else {
    throw new Error('Unauthorized');
  }
  return { id: payload.sub, role: payload.role };
}

export function initSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
  });

  setIo(io);

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization;
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice(7)
          : undefined);
      if (!token) throw new Error('Missing token');
      socket.data.auth = await loadSocketAuth(token);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const auth = socket.data.auth as SocketAuth;

    if (auth.role === 'customer') socket.join(rooms.customer(auth.id));
    if (auth.role === 'rider') socket.join(rooms.rider(auth.id));
    if (auth.role === 'admin') socket.join(rooms.admin);

    socket.emit('connected', { role: auth.role, id: auth.id });

    if (auth.role === 'rider') {
      try {
        const offer = await currentOfferForRider(auth.id);
        if (offer) socket.emit('booking:new', offer);
      } catch {
        // non fatal
      }
    }

    socket.on(
      'booking:subscribe',
      async (payload: { bookingId?: string }, ack?: Ack) => {
        try {
          const bookingId = String(payload?.bookingId ?? '');
          if (!/^[a-f0-9]{24}$/i.test(bookingId)) {
            ack?.({ ok: false, error: 'Invalid booking id' });
            return;
          }
          const filter: Record<string, unknown> = { _id: bookingId };
          if (auth.role === 'customer') filter.customer = auth.id;
          if (auth.role === 'rider') filter.rider = auth.id;
          if (auth.role !== 'admin') {
            const allowed = await BookingModel.exists(filter);
            if (!allowed) {
              ack?.({ ok: false, error: 'Not your booking' });
              return;
            }
          }
          socket.join(rooms.booking(bookingId));
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false, error: 'Could not subscribe' });
        }
      },
    );

    socket.on('booking:unsubscribe', (payload: { bookingId?: string }) => {
      const bookingId = String(payload?.bookingId ?? '');
      if (bookingId) socket.leave(rooms.booking(bookingId));
    });

    socket.on('rider:location', async (payload: unknown, ack?: Ack) => {
      if (auth.role !== 'rider') {
        ack?.({ ok: false, error: 'Only riders can send locations' });
        return;
      }
      const now = Date.now();
      const last = Number(socket.data.lastLocationAt ?? 0);
      if (now - last < 2000) {
        ack?.({ ok: true, throttled: true });
        return;
      }
      try {
        const input = locationSchema.parse(payload);
        socket.data.lastLocationAt = now;
        await handleRiderLocation(auth.id, input);
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('ping:app', (ack?: (value: { pong: number }) => void) => {
      ack?.({ pong: Date.now() });
    });
  });

  return io;
}
