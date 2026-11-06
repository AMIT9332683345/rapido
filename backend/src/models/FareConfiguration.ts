import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const fareConfigurationSchema = new Schema(
  {
    name: { type: String, default: 'Default bike fare' },
    currency: { type: String, default: 'INR' },
    baseFare: { type: Number, required: true, min: 0, default: 25 },
    perKm: { type: Number, required: true, min: 0, default: 8 },
    perMinute: { type: Number, required: true, min: 0, default: 0 },
    minimumFare: { type: Number, required: true, min: 0, default: 30 },
    waitingFreeMinutes: { type: Number, required: true, min: 0, default: 3 },
    waitingPerMinute: { type: Number, required: true, min: 0, default: 1 },
    cancellationFee: { type: Number, required: true, min: 0, default: 20 },
    platformFee: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true },
);

fareConfigurationSchema.index({ isActive: 1 });

export type FareConfiguration = InferSchemaType<typeof fareConfigurationSchema>;
export type FareConfigurationDoc = HydratedDocument<FareConfiguration>;

export const FareConfigurationModel = model('FareConfiguration', fareConfigurationSchema);
