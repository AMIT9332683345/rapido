import { RideActivityLogModel } from '../models/RideActivityLog.js';
import type { RideStatus } from '../models/enums.js';

interface LogInput {
  bookingId: unknown;
  status: RideStatus;
  actorRole: 'customer' | 'rider' | 'admin' | 'system';
  actorId?: unknown;
  note?: string;
  meta?: Record<string, unknown>;
}

export async function logRideActivity(input: LogInput): Promise<void> {
  try {
    await RideActivityLogModel.create({
      booking: input.bookingId,
      status: input.status,
      actorRole: input.actorRole,
      actor: input.actorId ?? null,
      note: input.note ?? null,
      meta: input.meta ?? {},
    });
  } catch (error) {
    console.error('[activity] failed to write ride log', (error as Error).message);
  }
}
