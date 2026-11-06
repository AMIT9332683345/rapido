import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const savedLocationSchema = new Schema(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    address: { type: String, trim: true, maxlength: 240, default: null },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], required: true },
    },
  },
  { timestamps: true },
);

savedLocationSchema.index({ customer: 1, label: 1 }, { unique: true });

export type SavedLocation = InferSchemaType<typeof savedLocationSchema>;
export type SavedLocationDocument = HydratedDocument<SavedLocation>;

export const SavedLocationModel = model('SavedLocation', savedLocationSchema);
