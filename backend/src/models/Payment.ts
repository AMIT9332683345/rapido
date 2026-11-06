import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from './enums.js';

const paymentSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rider: { type: Schema.Types.ObjectId, ref: 'Rider', default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    type: { type: String, enum: ['ride', 'cancellation'], default: 'ride' },
    transactionRef: { type: String, default: null },
    collectedBy: { type: String, enum: ['rider', 'gateway', 'admin'], default: 'rider' },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ booking: 1, type: 1 });

export type Payment = InferSchemaType<typeof paymentSchema>;
export type PaymentDocument = HydratedDocument<Payment>;

export const PaymentModel = model('Payment', paymentSchema);
