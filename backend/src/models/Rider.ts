import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { RIDER_STATUSES } from './enums.js';

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      validate: {
        validator: (v: number[]) =>
          Array.isArray(v) && v.length === 2 && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90,
        message: 'Invalid GeoJSON coordinates',
      },
    },
  },
  { _id: false },
);

const riderSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    mobile: { type: String, required: true, unique: true, match: /^[6-9]\d{9}$/ },
    passwordHash: { type: String, required: true, select: false },
    photoUrl: { type: String, default: null },
    status: { type: String, enum: RIDER_STATUSES, default: 'pending', index: true },
    rejectionReason: { type: String, default: null },
    suspendedReason: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    isOnline: { type: Boolean, default: false, index: true },
    currentLocation: { type: pointSchema, default: null },
    lastLocationAt: { type: Date, default: null },
    currentBooking: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    rating: { type: Number, default: 5, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    pushTokens: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.pushTokens;
        delete ret.__v;
        return ret;
      },
    },
  },
);

riderSchema.index({ currentLocation: '2dsphere' });
riderSchema.index({ status: 1, isOnline: 1 });

export type Rider = InferSchemaType<typeof riderSchema>;
export type RiderDocument = HydratedDocument<Rider>;

export const RiderModel = model('Rider', riderSchema);
