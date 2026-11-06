import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { RIDE_STATUSES } from './enums.js';

const rideActivityLogSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    status: { type: String, enum: RIDE_STATUSES, required: true },
    actorRole: {
      type: String,
      enum: ['customer', 'rider', 'admin', 'system'],
      required: true,
    },
    actor: { type: Schema.Types.ObjectId, default: null },
    note: { type: String, maxlength: 300, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

rideActivityLogSchema.index({ booking: 1, createdAt: 1 });

export type RideActivityLog = InferSchemaType<typeof rideActivityLogSchema>;
export type RideActivityLogDocument = HydratedDocument<RideActivityLog>;

export const RideActivityLogModel = model('RideActivityLog', rideActivityLogSchema);
