import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { pointSchema } from './schemas.js';

const rideLocationSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true, index: true },
    location: { type: pointSchema, required: true },
    heading: { type: Number, default: null },
    speed: { type: Number, default: null },
    accuracy: { type: Number, default: null },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

rideLocationSchema.index({ location: '2dsphere' });
rideLocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export type RideLocation = InferSchemaType<typeof rideLocationSchema>;
export type RideLocationDocument = HydratedDocument<RideLocation>;

export const RideLocationModel = model('RideLocation', rideLocationSchema);
