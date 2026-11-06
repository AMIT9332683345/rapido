import { Schema } from 'mongoose';

export const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) =>
          Array.isArray(v) &&
          v.length === 2 &&
          Math.abs(v[0]) <= 180 &&
          Math.abs(v[1]) <= 90,
        message: 'Location must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

export const placeSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 140 },
    address: { type: String, trim: true, maxlength: 240, default: null },
    location: { type: pointSchema, required: true },
  },
  { _id: false },
);
