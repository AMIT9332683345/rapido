import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS, PAYMENT_STATUSES, RIDE_STATUSES } from './enums.js';
import { placeSchema } from './schemas.js';

const fareSchema = new Schema(
  {
    baseFare: { type: Number, default: 0 },
    distanceFare: { type: Number, default: 0 },
    timeFare: { type: Number, default: 0 },
    waitingCharges: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    cancellationFee: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    minimumAdjustment: { type: Number, default: 0 },
    estimated: { type: Number, default: 0 },
    final: { type: Number, default: null },
    currency: { type: String, default: 'INR' },
    configVersion: { type: Schema.Types.ObjectId, ref: 'FareConfiguration', default: null },
  },
  { _id: false },
);

const routeSchema = new Schema(
  {
    distanceMeters: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    geometry: { type: Schema.Types.Mixed, required: true },
    provider: { type: String, required: true },
    isEstimate: { type: Boolean, default: false },
    fetchedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const offerSchema = new Schema(
  {
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', required: true },
    offeredAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    response: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired'],
      default: 'pending',
    },
    round: { type: Number, default: 1 },
  },
  { _id: false },
);

const cancellationSchema = new Schema(
  {
    byRole: { type: String, enum: ['customer', 'rider', 'admin'], required: true },
    byId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, trim: true, maxlength: 300, default: null },
    fee: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const statusTimestampsSchema = new Schema(
  {
    searchingAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    riderArrivingAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    bookingCode: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', default: null, index: true },
    status: { type: String, enum: RIDE_STATUSES, default: 'SEARCHING', index: true },

    pickup: { type: placeSchema, required: true },
    destination: { type: placeSchema, required: true },
    route: { type: routeSchema, required: true },
    fare: { type: fareSchema, required: true },

    payment: {
      method: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
      amount: { type: Number, default: null },
      transactionRef: { type: String, default: null },
      paidAt: { type: Date, default: null },
    },

    offers: { type: [offerSchema], default: [] },
    declinedRiders: { type: [Schema.Types.ObjectId], default: [] },
    offerRound: { type: Number, default: 0 },
    offerExpiresAt: { type: Date, default: null },
    searchDeadlineAt: { type: Date, default: null },
    statusTimestamps: { type: statusTimestampsSchema, default: () => ({}) },

    finalDistanceMeters: { type: Number, default: null },
    waitingMinutes: { type: Number, default: 0 },
    cancellation: { type: cancellationSchema, default: null },
    customerNote: { type: String, maxlength: 300, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  },
);

bookingSchema.index({ status: 1, offerExpiresAt: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ rider: 1, createdAt: -1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ 'pickup.location': '2dsphere' });

export type Booking = InferSchemaType<typeof bookingSchema>;
export type BookingDocument = HydratedDocument<Booking>;

export const BookingModel = model('Booking', bookingSchema);
